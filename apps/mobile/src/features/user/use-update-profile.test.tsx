/**
 * Tests for useUpdateProfile hook
 *
 * Verifies that PATCH /user/me is called with the supplied DTO, the local
 * React Query cache is updated on success, and errors are surfaced correctly.
 *
 * Requirements:
 *   2.4 — profile fields are persisted via PATCH /user/me
 *   2.6 — profile cache is updated on success so the rest of the app reflects
 *          the latest values immediately
 *   2.7 — hiddenFields in the DTO controls phone/email visibility
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateProfile } from './use-update-profile';
import { USER_PROFILE_QUERY_KEY } from './use-user-profile';
import type { UserProfile, UpdateProfileDto } from './user.service';
import * as userService from './user.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('./user.service', () => ({
  ...jest.requireActual('./user.service'),
  updateUserProfile: jest.fn(),
  fetchUserProfile: jest.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    publicId: 'abc123xyz9',
    fullName: 'Jane Doe',
    designation: 'Engineer',
    company: 'Acme',
    bio: 'Hello world',
    phone: '+1234567890',
    publicEmail: 'jane@example.com',
    avatarUrl: null,
    customName: null,
    hiddenFields: [],
    activeMode: 'work',
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useUpdateProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Requirement 2.4 — WHEN an Owner updates their profile fields THEN
   * updateUserProfile SHALL be called with those fields.
   */
  it('calls updateUserProfile with the supplied DTO', async () => {
    const queryClient = createTestQueryClient();
    const updatedProfile = makeProfile({ fullName: 'John Smith' });

    (userService.updateUserProfile as jest.Mock).mockResolvedValue(updatedProfile);

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(queryClient),
    });

    const dto: UpdateProfileDto = { fullName: 'John Smith' };

    act(() => {
      result.current.updateProfile(dto);
    });

    await waitFor(() => expect(result.current.isUpdating).toBe(false));

    expect(userService.updateUserProfile).toHaveBeenCalledWith(dto, expect.any(Object));
  });

  /**
   * Requirement 2.6 — on success, the React Query cache MUST be updated
   * with the server-confirmed profile so the rest of the app sees fresh data.
   */
  it('writes the server response into the React Query cache on success', async () => {
    const queryClient = createTestQueryClient();
    const originalProfile = makeProfile({ fullName: 'Jane Doe' });
    const updatedProfile = makeProfile({ fullName: 'Jane Smith' });

    // Pre-populate cache with original data.
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, originalProfile);

    (userService.updateUserProfile as jest.Mock).mockResolvedValue(updatedProfile);

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.updateProfile({ fullName: 'Jane Smith' });
    });

    await waitFor(() => expect(result.current.isUpdating).toBe(false));

    // The cache should now contain the server-confirmed name.
    const cached = queryClient.getQueryData<UserProfile>(USER_PROFILE_QUERY_KEY);
    expect(cached?.fullName).toBe('Jane Smith');
  });

  /**
   * Requirement 2.7 — hiddenFields in the DTO is passed through to the API.
   */
  it('passes hiddenFields to updateUserProfile', async () => {
    const queryClient = createTestQueryClient();
    const updatedProfile = makeProfile({ hiddenFields: ['phone', 'publicEmail'] });

    (userService.updateUserProfile as jest.Mock).mockResolvedValue(updatedProfile);

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(queryClient),
    });

    const dto: UpdateProfileDto = {
      hiddenFields: ['phone', 'publicEmail'],
    };

    act(() => {
      result.current.updateProfile(dto);
    });

    await waitFor(() => expect(result.current.isUpdating).toBe(false));

    expect(userService.updateUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ hiddenFields: ['phone', 'publicEmail'] }),
      expect.any(Object),
    );
  });

  /**
   * isUpdating should be true while the request is in flight and false once done.
   */
  it('sets isUpdating to true while the request is in flight', async () => {
    const queryClient = createTestQueryClient();

    let resolveFn!: (profile: UserProfile) => void;
    (userService.updateUserProfile as jest.Mock).mockReturnValue(
      new Promise<UserProfile>((resolve) => {
        resolveFn = resolve;
      }),
    );

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.updateProfile({ fullName: 'In Flight' });
    });

    await waitFor(() => expect(result.current.isUpdating).toBe(true));

    // Resolve the pending request.
    await act(async () => {
      resolveFn(makeProfile({ fullName: 'In Flight' }));
    });

    await waitFor(() => expect(result.current.isUpdating).toBe(false));
  });

  /**
   * When the API returns an error, the hook should surface it and call onError.
   */
  it('calls onError and exposes the error when the request fails', async () => {
    const queryClient = createTestQueryClient();
    const networkError = new Error('Network error');

    (userService.updateUserProfile as jest.Mock).mockRejectedValue(networkError);

    const onError = jest.fn();

    const { result } = renderHook(() => useUpdateProfile({ onError }), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.updateProfile({ fullName: 'Will Fail' });
    });

    // Wait for the mutation error to be surfaced
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(onError).toHaveBeenCalledWith(networkError);
    expect(result.current.error).toBe(networkError);
  });

  /**
   * onError is optional — a failing update without a handler should not throw.
   */
  it('does not throw when onError is not provided and the request fails', async () => {
    const queryClient = createTestQueryClient();

    (userService.updateUserProfile as jest.Mock).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      act(() => {
        result.current.updateProfile({ fullName: 'No Handler' });
      }),
    ).resolves.not.toThrow();

    await waitFor(() => expect(result.current.isUpdating).toBe(false));
  });

  /**
   * onSuccess callback is called after a successful update.
   */
  it('calls onSuccess with the updated profile after a successful update', async () => {
    const queryClient = createTestQueryClient();
    const updatedProfile = makeProfile({ fullName: 'Success User' });

    (userService.updateUserProfile as jest.Mock).mockResolvedValue(updatedProfile);

    const onSuccess = jest.fn();

    const { result } = renderHook(() => useUpdateProfile({ onSuccess }), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.updateProfile({ fullName: 'Success User' });
    });

    await waitFor(() => expect(result.current.isUpdating).toBe(false));

    expect(onSuccess).toHaveBeenCalledWith(updatedProfile);
  });
});
