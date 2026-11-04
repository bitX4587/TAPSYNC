/**
 * useModeToggle hook
 *
 * Implements an optimistic mode toggle with automatic rollback on failure.
 *
 * Flow:
 * 1. User taps the toggle → optimistically update the React Query cache.
 * 2. PATCH /user/mode is called in the background.
 * 3a. SUCCESS → server confirms the new mode; cache is refreshed.
 * 3b. FAILURE → rollback to the previous mode in cache; call onError callback
 *     so the UI can show an error message (Requirement 4.5).
 *
 * Requirements: 4.2, 4.5
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMode, type Mode, type UserProfile } from './user.service';
import { USER_PROFILE_QUERY_KEY } from './use-user-profile';

export interface UseModeToggleOptions {
  /**
   * Called when the toggle request fails so the UI can display an error toast.
   * Receives the error that was thrown.
   *
   * Requirements: 4.5
   */
  onError?: (error: Error) => void;
}

export interface UseModeToggleResult {
  /** The current active mode (optimistically updated). */
  activeMode: Mode | undefined;
  /** Whether a toggle request is in flight. */
  isToggling: boolean;
  /** Call this to switch to the given mode. */
  toggle: (mode: Mode) => void;
}

/**
 * Optimistic mode toggle hook.
 *
 * Example:
 *   const { activeMode, toggle, isToggling } = useModeToggle({
 *     onError: (err) => Toast.show(err.message),
 *   });
 */
export function useModeToggle({ onError }: UseModeToggleOptions = {}): UseModeToggleResult {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updateMode,

    /**
     * Optimistic update — immediately write the new mode to cache so the
     * UI reflects the change without waiting for the server round-trip.
     */
    onMutate: async (newMode: Mode) => {
      // Cancel any in-flight fetches so they don't overwrite our optimistic value.
      await queryClient.cancelQueries({ queryKey: USER_PROFILE_QUERY_KEY });

      // Snapshot the current cached profile for rollback.
      const previousProfile = queryClient.getQueryData<UserProfile>(USER_PROFILE_QUERY_KEY);

      // Write the optimistic value.
      if (previousProfile) {
        queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, {
          ...previousProfile,
          activeMode: newMode,
        });
      }

      // Return the snapshot so onError can restore it.
      return { previousProfile };
    },

    /**
     * On success, invalidate the cache so the confirmed server value is loaded.
     * This handles the rare case where the server returns a different mode.
     */
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });
    },

    /**
     * On failure, roll back to the previous mode and notify the caller.
     *
     * Requirements: 4.5 — the mobile app SHALL revert the optimistic UI state
     * and show an error message.
     */
    onError: (error: Error, _newMode: Mode, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, context.previousProfile);
      }
      onError?.(error);
    },
  });

  // Read the mode from the React Query cache (may be the optimistic value).
  const profile = queryClient.getQueryData<UserProfile>(USER_PROFILE_QUERY_KEY);

  return {
    activeMode: profile?.activeMode,
    isToggling: mutation.isPending,
    toggle: mutation.mutate,
  };
}
