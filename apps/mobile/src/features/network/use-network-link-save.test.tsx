/**
 * Tests for the useNetworkLinkSave hook.
 *
 * Verifies the My Network save flow state machine:
 *   - Invalid Public ID → 'invalid' (Req 12.1)
 *   - Own-card detection → 'own-card' (Req 12.4)
 *   - Successful save → 'redirecting' + navigate to My Network (Req 12.1, 13.1)
 *   - 404 → 'not-found'
 *   - Generic error → 'error'
 *
 * Requirements: 12.1, 12.4, 13.1
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNetworkLinkSave } from './use-network-link-save';
import type { UserProfile } from '../user';
import { USER_PROFILE_QUERY_KEY } from '../user';
import { ApiError } from '../../lib/api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRouterReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

jest.mock('./network-save', () => ({
  validatePublicId: jest.fn(),
  saveNetworkContactFromLink: jest.fn(),
  isApiErrorWithStatus: jest.fn(),
}));

// Import after mocks are set up
import {
  saveNetworkContactFromLink,
  validatePublicId,
  isApiErrorWithStatus,
} from './network-save';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    publicId: 'myownid123',
    activeMode: 'work',
    hiddenFields: [],
    status: 'active',
    hasEmailLinked: false,
    hasGoogleLinked: false,
    hasRecoveryCode: false,
    ...overrides,
  };
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient, profile?: UserProfile) {
  return ({ children }: { children: React.ReactNode }) => {
    if (profile) {
      queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, profile);
    }
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useNetworkLinkSave', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up mock implementations (can reference ApiError here — it's in scope)
    (validatePublicId as jest.Mock).mockImplementation((id: string) => {
      if (!id) return 'No Public ID provided.';
      if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/.test(id)) {
        return 'This link contains an invalid Public ID.';
      }
      return null;
    });

    (isApiErrorWithStatus as jest.Mock).mockImplementation(
      (error: unknown, statusCode: number) =>
        error instanceof ApiError && error.statusCode === statusCode,
    );
  });

  /**
   * Requirement 12.1 — invalid Public ID format shows an error immediately.
   */
  it('returns "invalid" status for a malformed Public ID', async () => {
    const queryClient = createTestQueryClient();
    const profile = makeProfile();

    const { result } = renderHook(() => useNetworkLinkSave('tooshort'), {
      wrapper: createWrapper(queryClient, profile),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('invalid');
    });
    expect(result.current.errorMessage).toMatch(/invalid Public ID/i);
    expect(saveNetworkContactFromLink).not.toHaveBeenCalled();
  });

  it('returns "invalid" status for an empty Public ID', async () => {
    const queryClient = createTestQueryClient();
    const profile = makeProfile();

    const { result } = renderHook(() => useNetworkLinkSave(''), {
      wrapper: createWrapper(queryClient, profile),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('invalid');
    });
  });

  /**
   * Requirement 12.4 — own-card detection: skip saving, show "own-card".
   */
  it('returns "own-card" status when the publicId matches the user profile', async () => {
    const queryClient = createTestQueryClient();
    const profile = makeProfile({ publicId: 'abcdefghjk' });

    const { result } = renderHook(() => useNetworkLinkSave('abcdefghjk'), {
      wrapper: createWrapper(queryClient, profile),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('own-card');
    });
    expect(saveNetworkContactFromLink).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  /**
   * Requirement 12.1 + 13.1 — successful save navigates to My Network with highlight.
   */
  it('saves the contact and navigates to the network tab on success', async () => {
    const queryClient = createTestQueryClient();
    const profile = makeProfile({ publicId: 'myownid123' });

    (saveNetworkContactFromLink as jest.Mock).mockResolvedValue({ id: 'contact-1' });

    const { result } = renderHook(() => useNetworkLinkSave('abcdefghjk'), {
      wrapper: createWrapper(queryClient, profile),
    });

    // Should pass validation and start saving
    await waitFor(() => {
      expect(result.current.status).toBe('saving');
    });

    // Then the save resolves and we navigate
    await waitFor(() => {
      expect(result.current.status).toBe('redirecting');
    });

    expect(saveNetworkContactFromLink).toHaveBeenCalledWith('abcdefghjk');
    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: '/(tabs)/network',
      params: { highlight: 'abcdefghjk' },
    });
  });

  /**
   * Requirement 12.1 — 404 (profile not found) shows "not-found".
   */
  it('returns "not-found" status when the API returns 404', async () => {
    const queryClient = createTestQueryClient();
    const profile = makeProfile({ publicId: 'myownid123' });

    const notFoundError = new ApiError('Profile not found', 404, 'NOT_FOUND');
    (saveNetworkContactFromLink as jest.Mock).mockRejectedValue(notFoundError);

    const { result } = renderHook(() => useNetworkLinkSave('abcdefghjk'), {
      wrapper: createWrapper(queryClient, profile),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('not-found');
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  /**
   * Requirement 12.4 — server-side 403 (own-card guard) is handled as "own-card".
   */
  it('returns "own-card" status when the API returns 403 (server own-card guard)', async () => {
    const queryClient = createTestQueryClient();
    const profile = makeProfile({ publicId: 'different000' });

    const forbiddenError = new ApiError('Cannot save your own profile', 403, 'FORBIDDEN');
    (saveNetworkContactFromLink as jest.Mock).mockRejectedValue(forbiddenError);

    const { result } = renderHook(() => useNetworkLinkSave('abcdefghjk'), {
      wrapper: createWrapper(queryClient, profile),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('own-card');
    });
  });

  /**
   * Generic network error → 'error' status.
   */
  it('returns "error" status for a non-404, non-403 error', async () => {
    const queryClient = createTestQueryClient();
    const profile = makeProfile({ publicId: 'myownid123' });

    (saveNetworkContactFromLink as jest.Mock).mockRejectedValue(
      new Error('Network failure'),
    );

    const { result } = renderHook(() => useNetworkLinkSave('abcdefghjk'), {
      wrapper: createWrapper(queryClient, profile),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.errorMessage).toBe('Network failure');
  });

  /**
   * Requirement 12.1 — the save uses source: 'link' (verified in network-save tests).
   * Here we just confirm the hook calls the service.
   */
  it('does not save while the user profile is still loading', async () => {
    const queryClient = createTestQueryClient();
    // No profile in cache → useUserProfile returns isLoading: true
    // (jest-expo/react-query: the query starts but hasn't resolved)

    const { result } = renderHook(() => useNetworkLinkSave('abcdefghjk'), {
      wrapper: createWrapper(queryClient),
    });

    // Should be in loading state, not saving
    expect(result.current.status).toBe('loading');
    expect(saveNetworkContactFromLink).not.toHaveBeenCalled();
  });
});
