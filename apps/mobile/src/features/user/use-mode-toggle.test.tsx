/**
 * Tests for useModeToggle hook
 *
 * Verifies optimistic update and rollback behaviour as required by
 * Requirements 4.2 and 4.5.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useModeToggle } from './use-mode-toggle';
import { USER_PROFILE_QUERY_KEY } from './use-user-profile';
import type { UserProfile } from './user.service';
import * as userService from './user.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('./user.service', () => ({
  fetchUserProfile: jest.fn(),
  updateMode: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal UserProfile fixture with the fields the hook cares about. */
function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    publicId: 'abc123xyz9',
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

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useModeToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads activeMode from the React Query cache', () => {
    const queryClient = createTestQueryClient();
    const profile = makeProfile({ activeMode: 'casual' });
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, profile);

    const { result } = renderHook(() => useModeToggle(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.activeMode).toBe('casual');
  });

  it('returns undefined activeMode when the cache is empty', () => {
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useModeToggle(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.activeMode).toBeUndefined();
  });

  /**
   * Requirement 4.2 — optimistic update:
   * The mode in the cache should change immediately, before the
   * PATCH /user/mode response arrives.
   */
  it('applies the optimistic update before the request completes', async () => {
    // Arrange: start with 'work' mode in cache
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ activeMode: 'work' }));

    // The updateMode call never resolves during this test (we check state mid-flight)
    let resolveFn!: () => void;
    (userService.updateMode as jest.Mock).mockReturnValue(
      new Promise<{ activeMode: 'casual' }>((resolve) => {
        resolveFn = () => resolve({ activeMode: 'casual' });
      }),
    );

    const { result } = renderHook(() => useModeToggle(), {
      wrapper: createWrapper(queryClient),
    });

    // Act: trigger the toggle and let the onMutate run synchronously
    await act(async () => {
      result.current.toggle('casual');
    });

    // Assert: the cache already reflects the new mode (optimistic)
    const cachedProfile = queryClient.getQueryData<UserProfile>(USER_PROFILE_QUERY_KEY);
    expect(cachedProfile?.activeMode).toBe('casual');

    // Finish the pending request cleanly to avoid open handles
    await act(async () => { resolveFn(); });
  });

  /**
   * Requirement 4.5 — rollback on failure:
   * If PATCH /user/mode fails, the cache should revert to the previous mode
   * and the onError callback should be called.
   */
  it('rolls back the optimistic update when the request fails', async () => {
    // Arrange: start with 'work' in cache
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ activeMode: 'work' }));

    const networkError = new Error('Network error');
    (userService.updateMode as jest.Mock).mockRejectedValue(networkError);

    const onError = jest.fn();

    const { result } = renderHook(() => useModeToggle({ onError }), {
      wrapper: createWrapper(queryClient),
    });

    // Act
    act(() => {
      result.current.toggle('casual');
    });

    // Wait for the mutation to fail and rollback
    await waitFor(() => {
      expect(result.current.isToggling).toBe(false);
    });

    // Assert: cache is back to 'work'
    const cachedProfile = queryClient.getQueryData<UserProfile>(USER_PROFILE_QUERY_KEY);
    expect(cachedProfile?.activeMode).toBe('work');

    // Assert: error callback was called
    expect(onError).toHaveBeenCalledWith(networkError);
  });

  /**
   * Requirement 4.5 — error callback is not required:
   * When no onError handler is provided, a failing toggle should not throw.
   */
  it('does not throw when onError is not provided and request fails', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ activeMode: 'work' }));

    (userService.updateMode as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useModeToggle(), {
      wrapper: createWrapper(queryClient),
    });

    // Should not throw
    await expect(
      act(() => {
        result.current.toggle('casual');
      }),
    ).resolves.not.toThrow();

    await waitFor(() => {
      expect(result.current.isToggling).toBe(false);
    });

    // Cache should still be rolled back
    const cachedProfile = queryClient.getQueryData<UserProfile>(USER_PROFILE_QUERY_KEY);
    expect(cachedProfile?.activeMode).toBe('work');
  });

  it('sets isToggling to true while the request is in flight', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile());

    let resolveFn!: () => void;
    (userService.updateMode as jest.Mock).mockReturnValue(
      new Promise<{ activeMode: 'casual' }>((resolve) => {
        resolveFn = () => resolve({ activeMode: 'casual' });
      }),
    );

    const { result } = renderHook(() => useModeToggle(), {
      wrapper: createWrapper(queryClient),
    });

    // Trigger the toggle without awaiting so we can check the in-flight state
    act(() => {
      result.current.toggle('casual');
    });

    // While in flight, isToggling should be true
    await waitFor(() => {
      expect(result.current.isToggling).toBe(true);
    });

    // Resolve and confirm it goes back to false
    await act(async () => { resolveFn(); });

    await waitFor(() => {
      expect(result.current.isToggling).toBe(false);
    });
  });

  /**
   * Requirement 4.2 — calling updateMode with the chosen mode.
   * React Query v5 passes (variables, { client, meta }) to mutationFn.
   */
  it('calls updateMode with the requested mode', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ activeMode: 'work' }));

    (userService.updateMode as jest.Mock).mockResolvedValue({ activeMode: 'casual' });

    const { result } = renderHook(() => useModeToggle(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.toggle('casual');
    });

    await waitFor(() => {
      expect(result.current.isToggling).toBe(false);
    });

    // The first argument to the mocked mutationFn should be 'casual'
    expect(userService.updateMode).toHaveBeenCalledWith(
      'casual',
      expect.any(Object),
    );
  });
});
