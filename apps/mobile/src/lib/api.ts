/**
 * API client with token refresh interceptor and expo-secure-store integration.
 * Handles authentication, token storage, and automatic token refresh.
 */

import * as SecureStore from 'expo-secure-store';
import { triggerRefreshFailure } from '../features/auth/auth-context';

// Token storage keys
const ACCESS_TOKEN_KEY = 'tapsync_access_token';
const REFRESH_TOKEN_KEY = 'tapsync_refresh_token';

// API base URL from environment
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Token storage utilities using expo-secure-store
 */
export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async setAccessToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  },

  async getRefreshToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  },

  async clearTokens(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  },
};

/**
 * API error class for structured error handling
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Refresh token response type
 */
interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Flag to prevent multiple concurrent refresh attempts
 */
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(): Promise<string> {
  // If already refreshing, return the existing promise
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;

  refreshPromise = (async () => {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();

      if (!refreshToken) {
        throw new ApiError('No refresh token available', 401, 'NO_REFRESH_TOKEN');
      }

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // Refresh token is invalid, expired, or the family was revoked (Req 1.11).
        // `triggerRefreshFailure` clears tokens and notifies the auth context so
        // the app can redirect the user back to the entry screen.
        await triggerRefreshFailure();
        throw new ApiError('Token refresh failed', response.status, 'REFRESH_FAILED');
      }

      const data: RefreshTokenResponse = await response.json();

      // Store new tokens
      await tokenStorage.setTokens(data.accessToken, data.refreshToken);

      return data.accessToken;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * API client options
 */
export interface ApiRequestOptions extends RequestInit {
  /**
   * Whether to include the access token in the Authorization header
   * @default true
   */
  withAuth?: boolean;

  /**
   * Whether to automatically retry with token refresh on 401
   * @default true
   */
  autoRefresh?: boolean;
}

/**
 * Make an authenticated API request with automatic token refresh
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    withAuth = true,
    autoRefresh = true,
    headers = {},
    ...fetchOptions
  } = options;

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  // Prepare headers
  const requestHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // Add access token if auth is required
  if (withAuth) {
    const accessToken = await tokenStorage.getAccessToken();
    if (accessToken) {
      requestHeaders['Authorization'] = `Bearer ${accessToken}`;
    }
  }

  // Make the request
  let response = await fetch(url, {
    ...fetchOptions,
    headers: requestHeaders,
  });

  // Handle 401 with automatic token refresh
  if (response.status === 401 && withAuth && autoRefresh) {
    try {
      // Refresh the access token
      const newAccessToken = await refreshAccessToken();

      // Retry the request with the new token
      requestHeaders['Authorization'] = `Bearer ${newAccessToken}`;
      response = await fetch(url, {
        ...fetchOptions,
        headers: requestHeaders,
      });
    } catch (refreshError) {
      // If refresh fails, re-throw the original error
      if (refreshError instanceof ApiError) {
        throw refreshError;
      }
      throw new ApiError(
        'Authentication failed',
        401,
        'AUTH_FAILED',
        refreshError,
      );
    }
  }

  // Parse response
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');

  let data: unknown;
  if (isJson) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  // Handle error responses
  if (!response.ok) {
    const errorData = data as {
      statusCode?: number;
      code?: string;
      message?: string;
      details?: unknown;
    };

    throw new ApiError(
      errorData.message || `API request failed with status ${response.status}`,
      response.status,
      errorData.code,
      errorData.details,
    );
  }

  return data as T;
}

/**
 * Convenience methods for common HTTP methods
 */
export const api = {
  get: <T = unknown>(endpoint: string, options?: ApiRequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = unknown>(endpoint: string, options?: ApiRequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};

/**
 * Check if the user is authenticated (has tokens stored)
 */
export async function isAuthenticated(): Promise<boolean> {
  const refreshToken = await tokenStorage.getRefreshToken();
  return refreshToken !== null;
}

/**
 * Sign out the user by clearing all tokens
 */
export async function signOut(): Promise<void> {
  try {
    // Call logout endpoint to invalidate refresh token on server
    await api.post('/auth/logout', undefined, { autoRefresh: false });
  } catch (error) {
    // Continue even if logout request fails
    console.warn('Logout request failed:', error);
  } finally {
    // Always clear local tokens
    await tokenStorage.clearTokens();
  }
}
