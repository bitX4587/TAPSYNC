/**
 * Tests for useCustomName hook
 *
 * Covers:
 * - Availability check calls the API (debounced)
 * - available / taken / invalid status transitions
 * - Claim invalidates the USER_PROFILE_QUERY_KEY cache
 * - Remove invalidates the USER_PROFILE_QUERY_KEY cache
 * - Client-side format validation does not call the API
 *
 * Requirements: 2.8–2.14
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCustomName, CUSTOM_NAME_REGEX } from './use-custom-name';
import { USER_PROFILE_QUERY_KEY } from './use-user-profile';
import type { UserProfile } from './user.service';
import * as userService from './user.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('./user.service', () => ({
  fetchUserProfile: jest.fn(),
  checkCustomNameAvailability: jest.fn(),
  claimCustomName: jest.fn(),
  removeCustomName: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    publicId: 'abc123xyz9',
    activeMode: 'work',
    hiddenFields: [],
    status: 'active',
    hasEmailLinked: false,
    hasGoogleLinked: false,
    hasRecoveryCode: false,
    customName: null,
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
// CUSTOM_NAME_REGEX
// ---------------------------------------------------------------------------

describe('CUSTOM_NAME_REGEX', () => {
  it('accepts valid names', () => {
    expect(CUSTOM_NAME_REGEX.test('abc')).toBe(true);
    expect(CUSTOM_NAME_REGEX.test('my-name')).toBe(true);
    expect(CUSTOM_NAME_REGEX.test('my_name123')).toBe(true);
    expect(CUSTOM_NAME_REGEX.test('a'.repeat(30))).toBe(true);
  });

  it('rejects names that are too short', () => {
    expect(CUSTOM_NAME_REGEX.test('ab')).toBe(false);
    expect(CUSTOM_NAME_REGEX.test('')).toBe(false);
  });

  it('rejects names that are too long', () => {
    expect(CUSTOM_NAME_REGEX.test('a'.repeat(31))).toBe(false);
  });

  it('rejects uppercase letters', () => {
    expect(CUSTOM_NAME_REGEX.test('ABC')).toBe(false);
    expect(CUSTOM_NAME_REGEX.test('MyName')).toBe(false);
  });

  it('rejects special characters beyond _ and -', () => {
    expect(CUSTOM_NAME_REGEX.test('my name')).toBe(false);
    expect(CUSTOM_NAME_REGEX.test('my.name')).toBe(false);
    expect(CUSTOM_NAME_REGEX.test('my@name')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useCustomName
// ---------------------------------------------------------------------------

describe('useCustomName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Only flush pending timers when fake timers are active — the
    // claim/remove error-case tests switch to real timers (jest.useRealTimers()).
    try {
      jest.runOnlyPendingTimers();
    } catch {
      // Real timers are active — nothing to flush.
    }
    jest.useRealTimers();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  it('returns idle availabilityStatus initially', () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName(), {
      wrapper: createWrapper(queryClient),
    });
    expect(result.current.availabilityStatus).toBe('idle');
  });

  it('reads currentName from the React Query cache', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ customName: 'acme' }));

    const { result } = renderHook(() => useCustomName(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.currentName).toBe('acme');
  });

  it('returns null currentName when none is set', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ customName: null }));

    const { result } = renderHook(() => useCustomName(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.currentName).toBeNull();
  });

  // ── Format validation (no API call) ──────────────────────────────────────

  it('sets status to invalid for a name that fails the regex without calling the API', () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.checkAvailability('AB'); // uppercase + too short
    });

    expect(result.current.availabilityStatus).toBe('invalid');
    expect(userService.checkCustomNameAvailability).not.toHaveBeenCalled();
  });

  it('sets status to idle for empty input', () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName(), {
      wrapper: createWrapper(queryClient),
    });

    // First make it non-idle
    act(() => {
      result.current.checkAvailability('ab'); // invalid (too short)
    });
    expect(result.current.availabilityStatus).toBe('invalid');

    // Clear the input
    act(() => {
      result.current.checkAvailability('');
    });
    expect(result.current.availabilityStatus).toBe('idle');
    expect(userService.checkCustomNameAvailability).not.toHaveBeenCalled();
  });

  // ── API availability check ────────────────────────────────────────────────

  it('shows checking immediately for a valid name, then available after debounce', async () => {
    (userService.checkCustomNameAvailability as jest.Mock).mockResolvedValue({
      available: true,
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName({ debounceMs: 500 }), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.checkAvailability('valid-name');
    });

    // Immediately checking
    expect(result.current.availabilityStatus).toBe('checking');
    expect(userService.checkCustomNameAvailability).not.toHaveBeenCalled();

    // Fast-forward past the debounce
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(result.current.availabilityStatus).toBe('available');
    });

    expect(userService.checkCustomNameAvailability).toHaveBeenCalledWith('valid-name');
  });

  it('sets status to taken when the API returns available: false', async () => {
    (userService.checkCustomNameAvailability as jest.Mock).mockResolvedValue({
      available: false,
      reason: 'Already taken by another account',
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName({ debounceMs: 100 }), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.checkAvailability('taken-name');
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(result.current.availabilityStatus).toBe('taken');
    });

    expect(result.current.availabilityReason).toBe('Already taken by another account');
  });

  it('debounces rapid input changes and only calls the API once', async () => {
    (userService.checkCustomNameAvailability as jest.Mock).mockResolvedValue({ available: true });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName({ debounceMs: 500 }), {
      wrapper: createWrapper(queryClient),
    });

    // Simulate typing quickly
    act(() => { result.current.checkAvailability('abc'); });
    act(() => { result.current.checkAvailability('abcd'); });
    act(() => { result.current.checkAvailability('abcde'); });

    // Only the last call should fire after debounce
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(result.current.availabilityStatus).toBe('available');
    });

    expect(userService.checkCustomNameAvailability).toHaveBeenCalledTimes(1);
    expect(userService.checkCustomNameAvailability).toHaveBeenCalledWith('abcde');
  });

  it('resets to idle if the availability API call throws', async () => {
    (userService.checkCustomNameAvailability as jest.Mock).mockRejectedValue(
      new Error('Network error'),
    );

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName({ debounceMs: 100 }), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.checkAvailability('some-name');
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(result.current.availabilityStatus).toBe('idle');
    });
  });

  // ── Claim / change ────────────────────────────────────────────────────────

  it('claim calls claimCustomName and updates the cache on success', async () => {
    const updatedProfile = makeProfile({ customName: 'my-new-name' });
    (userService.claimCustomName as jest.Mock).mockResolvedValue(updatedProfile);

    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile());

    const onClaimSuccess = jest.fn();
    const { result } = renderHook(() => useCustomName({ onClaimSuccess }), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.claimOrChange('my-new-name');
    });

    await waitFor(() => {
      expect(result.current.isClaiming).toBe(false);
    });

    expect(userService.claimCustomName).toHaveBeenCalledWith('my-new-name', expect.any(Object));

    // Cache should reflect the new profile
    const cached = queryClient.getQueryData<UserProfile>(USER_PROFILE_QUERY_KEY);
    expect(cached?.customName).toBe('my-new-name');

    expect(onClaimSuccess).toHaveBeenCalledWith(updatedProfile);
  });

  it('claim sets changeError and calls onClaimError on failure', async () => {
    // These mutation-error tests don't involve debouncing, so use real timers
    // to let waitFor poll properly while the rejection microtask settles.
    jest.useRealTimers();

    const claimError = new Error('Name conflict');
    (userService.claimCustomName as jest.Mock).mockRejectedValue(claimError);

    const onClaimError = jest.fn();
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName({ onClaimError }), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.claimOrChange('taken-name');
    });

    // Wait for the mutation error to be surfaced (same pattern as
    // use-update-profile.test.tsx — more robust than waiting for isPending).
    await waitFor(() => expect(result.current.changeError).not.toBeNull());

    expect(onClaimError).toHaveBeenCalledWith(claimError);
    expect(result.current.changeError).toBe(claimError);
  });

  // ── Remove ────────────────────────────────────────────────────────────────

  it('remove calls removeCustomName and updates the cache on success', async () => {
    const updatedProfile = makeProfile({ customName: null });
    (userService.removeCustomName as jest.Mock).mockResolvedValue(updatedProfile);

    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ customName: 'acme' }));

    const onRemoveSuccess = jest.fn();
    const { result } = renderHook(() => useCustomName({ onRemoveSuccess }), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.removeName();
    });

    await waitFor(() => {
      expect(result.current.isRemoving).toBe(false);
    });

    expect(userService.removeCustomName).toHaveBeenCalled();

    // Cache should reflect the removed name
    const cached = queryClient.getQueryData<UserProfile>(USER_PROFILE_QUERY_KEY);
    expect(cached?.customName).toBeNull();

    expect(onRemoveSuccess).toHaveBeenCalledWith(updatedProfile);
  });

  it('remove sets removeError and calls onRemoveError on failure', async () => {
    // Same rationale as the claim-error test — real timers + wait for the
    // error state directly (same pattern as use-update-profile.test.tsx).
    jest.useRealTimers();

    const removeError = new Error('Server error');
    (userService.removeCustomName as jest.Mock).mockRejectedValue(removeError);

    const onRemoveError = jest.fn();
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName({ onRemoveError }), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.removeName();
    });

    await waitFor(() => expect(result.current.removeError).not.toBeNull());

    expect(onRemoveError).toHaveBeenCalledWith(removeError);
    expect(result.current.removeError).toBe(removeError);
  });

  // ── Loading states ────────────────────────────────────────────────────────

  it('isClaiming is true while the claim request is in flight', async () => {
    let resolveFn!: (v: UserProfile) => void;
    (userService.claimCustomName as jest.Mock).mockReturnValue(
      new Promise<UserProfile>((resolve) => { resolveFn = resolve; }),
    );

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.claimOrChange('my-name');
    });

    await waitFor(() => {
      expect(result.current.isClaiming).toBe(true);
    });

    // Resolve
    await act(async () => { resolveFn(makeProfile({ customName: 'my-name' })); });

    await waitFor(() => {
      expect(result.current.isClaiming).toBe(false);
    });
  });

  it('isRemoving is true while the remove request is in flight', async () => {
    let resolveFn!: (v: UserProfile) => void;
    (userService.removeCustomName as jest.Mock).mockReturnValue(
      new Promise<UserProfile>((resolve) => { resolveFn = resolve; }),
    );

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomName(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.removeName();
    });

    await waitFor(() => {
      expect(result.current.isRemoving).toBe(true);
    });

    await act(async () => { resolveFn(makeProfile({ customName: null })); });

    await waitFor(() => {
      expect(result.current.isRemoving).toBe(false);
    });
  });
});
