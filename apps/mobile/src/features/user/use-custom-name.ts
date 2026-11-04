/**
 * useCustomName hook
 *
 * Encapsulates:
 * - Debounced availability check (GET /user/custom-name/available)
 * - Claim / change mutation (PUT /user/custom-name)
 * - Remove mutation (DELETE /user/custom-name)
 *
 * Requirements: 2.8–2.14
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  checkCustomNameAvailability,
  claimCustomName,
  removeCustomName,
  type UserProfile,
} from './user.service';
import { USER_PROFILE_QUERY_KEY } from './use-user-profile';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Status of the live availability check.
 *
 * idle       — no input yet (or input cleared)
 * checking   — API request in flight
 * available  — the name is free to claim
 * taken      — the name is already used by another account
 * invalid    — the name fails client-side format validation
 */
export type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/**
 * Custom name format: 3–30 chars, lowercase letters, digits, `_` or `-`.
 * Requirements: 2.8
 */
export const CUSTOM_NAME_REGEX = /^[a-z0-9_-]{3,30}$/;

export interface UseCustomNameOptions {
  /** Debounce delay in ms before firing the availability check. @default 500 */
  debounceMs?: number;
  /** Called after the name is successfully claimed/changed. */
  onClaimSuccess?: (profile: UserProfile) => void;
  /** Called when a claim/change request fails. */
  onClaimError?: (error: Error) => void;
  /** Called after the custom name is successfully removed. */
  onRemoveSuccess?: (profile: UserProfile) => void;
  /** Called when a remove request fails. */
  onRemoveError?: (error: Error) => void;
}

export interface UseCustomNameResult {
  /** The user's current custom name (from the profile cache). May be undefined. */
  currentName: string | undefined | null;
  /**
   * Start a debounced availability check for `name`. Cancels any pending check.
   * Immediately validates the format client-side; only fires the API call if valid.
   */
  checkAvailability: (name: string) => void;
  /** Current state of the availability check. */
  availabilityStatus: AvailabilityStatus;
  /** Human-readable reason for unavailability, if provided by the API. */
  availabilityReason: string | undefined;
  /** Submit a claim/change request for the current input name. */
  claimOrChange: (name: string) => void;
  /** Whether a claim/change request is in flight. */
  isClaiming: boolean;
  /** Submit a remove request. */
  removeName: () => void;
  /** Whether a remove request is in flight. */
  isRemoving: boolean;
  /** Error from the last claim/change attempt. */
  changeError: Error | null;
  /** Error from the last remove attempt. */
  removeError: Error | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manage the Owner's custom name: availability check, claim/change, remove.
 *
 * Example:
 *   const {
 *     currentName, checkAvailability, availabilityStatus,
 *     claimOrChange, isClaiming, removeName, isRemoving,
 *   } = useCustomName({ onClaimSuccess: () => router.back() });
 */
export function useCustomName({
  debounceMs = 500,
  onClaimSuccess,
  onClaimError,
  onRemoveSuccess,
  onRemoveError,
}: UseCustomNameOptions = {}): UseCustomNameResult {
  const queryClient = useQueryClient();

  // ── Availability state ────────────────────────────────────────────────────
  const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityStatus>('idle');
  const [availabilityReason, setAvailabilityReason] = useState<string | undefined>(undefined);

  // Use a ref for the debounce timer so it survives re-renders without causing them.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the timer when the hook unmounts.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const checkAvailability = useCallback(
    (name: string) => {
      // Clear any pending debounced check.
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Empty input → back to idle.
      if (!name) {
        setAvailabilityStatus('idle');
        setAvailabilityReason(undefined);
        return;
      }

      // Immediate client-side format check — no need to hit the API for bad input.
      if (!CUSTOM_NAME_REGEX.test(name)) {
        setAvailabilityStatus('invalid');
        setAvailabilityReason(undefined);
        return;
      }

      // Show "checking" immediately so the user gets quick feedback.
      setAvailabilityStatus('checking');
      setAvailabilityReason(undefined);

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const result = await checkCustomNameAvailability(name);
          setAvailabilityStatus(result.available ? 'available' : 'taken');
          setAvailabilityReason(result.reason);
        } catch {
          // Network/server error — reset to idle so the user can retry.
          setAvailabilityStatus('idle');
          setAvailabilityReason(undefined);
        }
      }, debounceMs);
    },
    [debounceMs],
  );

  // ── Claim / change mutation ────────────────────────────────────────────────
  const claimMutation = useMutation<UserProfile, Error, string>({
    mutationFn: claimCustomName,
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, updatedProfile);
      queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });
      onClaimSuccess?.(updatedProfile);
    },
    onError: (error) => {
      onClaimError?.(error);
    },
  });

  // ── Remove mutation ───────────────────────────────────────────────────────
  const removeMutation = useMutation<UserProfile, Error, void>({
    mutationFn: removeCustomName,
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, updatedProfile);
      queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });
      onRemoveSuccess?.(updatedProfile);
    },
    onError: (error) => {
      onRemoveError?.(error);
    },
  });

  // ── Read current name from the React Query cache ──────────────────────────
  const cachedProfile = queryClient.getQueryData<UserProfile>(USER_PROFILE_QUERY_KEY);

  return {
    currentName: cachedProfile?.customName,
    checkAvailability,
    availabilityStatus,
    availabilityReason,
    claimOrChange: claimMutation.mutate,
    isClaiming: claimMutation.isPending,
    removeName: removeMutation.mutate,
    isRemoving: removeMutation.isPending,
    changeError: claimMutation.error,
    removeError: removeMutation.error,
  };
}
