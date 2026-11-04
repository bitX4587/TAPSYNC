/**
 * Unit tests for API client
 */

import * as SecureStore from 'expo-secure-store';
import { triggerRefreshFailure } from '../features/auth/auth-context';
import {
  api,
  ApiError,
  apiRequest,
  isAuthenticated,
  signOut,
  tokenStorage,
} from './api';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock auth-context: the real triggerRefreshFailure is a no-op unless an
// AuthProvider is mounted (which registers a handler that calls clearTokens).
// In unit tests we simulate that handler so refresh-failure clears tokens.
jest.mock('../features/auth/auth-context', () => ({
  triggerRefreshFailure: jest.fn(),
  registerRefreshFailureHandler: jest.fn(),
  unregisterRefreshFailureHandler: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('tokenStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should get access token from secure store', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('access_token_123');

    const token = await tokenStorage.getAccessToken();

    expect(token).toBe('access_token_123');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('tapsync_access_token');
  });

  it('should set access token in secure store', async () => {
    await tokenStorage.setAccessToken('new_access_token');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'tapsync_access_token',
      'new_access_token',
    );
  });

  it('should get refresh token from secure store', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh_token_123');

    const token = await tokenStorage.getRefreshToken();

    expect(token).toBe('refresh_token_123');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('tapsync_refresh_token');
  });

  it('should set refresh token in secure store', async () => {
    await tokenStorage.setRefreshToken('new_refresh_token');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'tapsync_refresh_token',
      'new_refresh_token',
    );
  });

  it('should set both tokens at once', async () => {
    await tokenStorage.setTokens('access_123', 'refresh_456');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'tapsync_access_token',
      'access_123',
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'tapsync_refresh_token',
      'refresh_456',
    );
  });

  it('should clear all tokens', async () => {
    await tokenStorage.clearTokens();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('tapsync_access_token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('tapsync_refresh_token');
  });
});

describe('apiRequest', () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (triggerRefreshFailure as jest.Mock).mockImplementation(async () => {
      await tokenStorage.clearTokens();
    });
  });

  it('should make a successful GET request without auth', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' }),
    } as Response);

    const result = await apiRequest('/test', { withAuth: false });

    expect(result).toEqual({ data: 'test' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
      }),
    );
  });

  it('should include access token when withAuth is true', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('my_access_token');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true }),
    } as Response);

    await apiRequest('/protected', { withAuth: true });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my_access_token',
        }),
      }),
    );
  });

  it('should refresh token and retry on 401', async () => {
    // First call: return expired access token
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('expired_token')
      .mockResolvedValueOnce('old_refresh_token')
      .mockResolvedValueOnce('old_refresh_token');

    // First request: 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
    } as Response);

    // Refresh request: success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
      }),
    } as Response);

    // Retry request: success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'success' }),
    } as Response);

    const result = await apiRequest('/protected');

    expect(result).toEqual({ data: 'success' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'tapsync_access_token',
      'new_access_token',
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'tapsync_refresh_token',
      'new_refresh_token',
    );
  });

  it('should throw ApiError on failed refresh', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('expired_token')
      .mockResolvedValueOnce('invalid_refresh_token')
      .mockResolvedValueOnce('invalid_refresh_token');

    // First request: 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
    } as Response);

    // Refresh request: 401 (refresh token invalid)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Invalid refresh token' }),
    } as Response);

    await expect(apiRequest('/protected')).rejects.toThrow(ApiError);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2); // clearTokens
  });

  it('should throw ApiError with details on error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'email' },
      }),
    } as Response);

    await expect(apiRequest('/test', { withAuth: false })).rejects.toMatchObject({
      message: 'Invalid input',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: { field: 'email' },
    });
  });

  it('should handle non-JSON responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'Plain text response',
    } as Response);

    const result = await apiRequest('/test', { withAuth: false });

    expect(result).toBe('Plain text response');
  });
});

describe('api convenience methods', () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it('should make GET request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'get' }),
    } as Response);

    const result = await api.get('/endpoint');

    expect(result).toEqual({ data: 'get' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('should make POST request with body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 123 }),
    } as Response);

    const result = await api.post('/endpoint', { name: 'Test' });

    expect(result).toEqual({ id: 123 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      }),
    );
  });

  it('should make PATCH request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ updated: true }),
    } as Response);

    await api.patch('/endpoint', { field: 'value' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ field: 'value' }),
      }),
    );
  });

  it('should make PUT request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ replaced: true }),
    } as Response);

    await api.put('/endpoint', { data: 'new' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ data: 'new' }),
      }),
    );
  });

  it('should make DELETE request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: async () => '',
    } as Response);

    await api.delete('/endpoint');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('isAuthenticated', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true when refresh token exists', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('refresh_token_123');

    const result = await isAuthenticated();

    expect(result).toBe(true);
  });

  it('should return false when no refresh token exists', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const result = await isAuthenticated();

    expect(result).toBe(false);
  });
});

describe('signOut', () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('some_token');
  });

  it('should call logout endpoint and clear tokens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    } as Response);

    await signOut();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
  });

  it('should clear tokens even if logout request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await signOut();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
  });
});
