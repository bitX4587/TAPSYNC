/**
 * useUpdateProfile hook
 *
 * Calls PATCH /user/me and invalidates the profile cache on success.
 *
 * Requirements:
 *   2.4 — WHEN an Owner updates full name, bio, designation, phone, public
 *          email or company THEN the system SHALL validate and persist the changes.
 *   2.6 — WHEN an Owner updates their profile THEN the system SHALL invalidate
 *          the cached public page (the API handles cache invalidation server-side;
 *          this hook updates the local React Query cache).
 *   2.7 — hiddenFields lets the Owner mark phone / publicEmail as hidden.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateUserProfile, type UpdateProfileDto, type UserProfile } from './user.service';
import { USER_PROFILE_QUERY_KEY } from './use-user-profile';

export interface UseUpdateProfileOptions {
  /**
   * Called after a successful profile update.
   */
  onSuccess?: (profile: UserProfile) => void;
  /**
   * Called when the update request fails.
   */
  onError?: (error: Error) => void;
}

export interface UseUpdateProfileResult {
  /** Submit the profile update. */
  updateProfile: (dto: UpdateProfileDto) => void;
  /** Whether the PATCH request is in flight. */
  isUpdating: boolean;
  /** The last error returned by the API, or null. */
  error: Error | null;
}

/**
 * Mutation hook for updating the current user's profile.
 *
 * Example:
 *   const { updateProfile, isUpdating, error } = useUpdateProfile({
 *     onSuccess: () => router.back(),
 *     onError: (err) => Alert.alert('Error', err.message),
 *   });
 */
export function useUpdateProfile({
  onSuccess,
  onError,
}: UseUpdateProfileOptions = {}): UseUpdateProfileResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<UserProfile, Error, UpdateProfileDto>({
    mutationFn: updateUserProfile,

    /**
     * On success, write the fresh profile into the React Query cache and
     * call the caller's onSuccess handler.
     */
    onSuccess: (updatedProfile) => {
      // Eagerly update the cache with the server-confirmed data so the
      // rest of the app sees the latest values immediately.
      queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, updatedProfile);
      onSuccess?.(updatedProfile);
    },

    onError: (error) => {
      onError?.(error);
    },
  });

  return {
    updateProfile: mutation.mutate,
    isUpdating: mutation.isPending,
    error: mutation.error,
  };
}
