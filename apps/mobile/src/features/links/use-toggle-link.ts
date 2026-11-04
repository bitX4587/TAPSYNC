/**
 * useToggleLink hook
 *
 * Implements an optimistic enable/disable toggle for a profile link with
 * automatic rollback on failure. This mirrors the optimistic pattern used
 * by `useModeToggle`.
 *
 * Flow:
 * 1. User flips the Switch → optimistically update the React Query cache for
 *    the link's mode so the UI reflects the change instantly.
 * 2. PATCH /links/:id with { isEnabled } is called in the background.
 * 3a. SUCCESS → invalidate the links query so the server-confirmed value loads.
 * 3b. FAILURE → rollback to the previous cache and call onError (Req 3.5).
 *
 * Requirements: 3.5 (enable/disable), 3.3 (persist + invalidate)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Mode } from '@tapsync/shared';
import { updateLink, type Link } from './link.service';
import { linksKeys } from './use-links';

/**
 * Variables passed to the toggle mutation.
 * `isEnabled` is the NEW desired value.
 * `mode` is needed to target the correct per-mode cache for the optimistic
 * update (the PATCH endpoint only needs the id, but the cache is partitioned
 * by mode).
 */
export interface ToggleLinkVariables {
  /** The link's MongoDB ObjectId. */
  id: string;
  /** The mode the link belongs to. */
  mode: Mode;
  /** The desired enabled state. */
  isEnabled: boolean;
}

export interface UseToggleLinkOptions {
  /**
   * Called when the toggle request fails so the UI can show an error toast.
   * Receives the error that was thrown.
   */
  onError?: (error: Error) => void;
}

export interface UseToggleLinkResult {
  /** Call this to toggle a link's enabled state. */
  toggleLink: (variables: ToggleLinkVariables) => void;
  /** Whether a toggle request is in flight. */
  isToggling: boolean;
}

/**
 * Context returned by `onMutate` and passed to `onError` for rollback.
 * Declared explicitly so TypeScript knows the shape of the optimistic
 * snapshot.
 */
interface ToggleLinkContext {
  previousLinks: Link[] | undefined;
  queryKey: readonly ['links', Mode];
}

/**
 * Optimistic link enable/disable toggle hook.
 *
 * Example:
 *   const { toggleLink, isToggling } = useToggleLink({
 *     onError: (err) => Alert.alert('Could not update link', err.message),
 *   });
 *   toggleLink({ id: link._id, mode: link.mode, isEnabled: !link.isEnabled });
 */
export function useToggleLink({
  onError,
}: UseToggleLinkOptions = {}): UseToggleLinkResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<Link, Error, ToggleLinkVariables, ToggleLinkContext>({
    mutationFn: ({ id, isEnabled }) => updateLink(id, { isEnabled }),

    /**
     * Optimistic update — immediately flip isEnabled in the per-mode cache
     * so the Switch reflects the new state without waiting for the server.
     */
    onMutate: async ({ id, mode, isEnabled }) => {
      const queryKey = linksKeys.mode(mode);

      // Cancel any in-flight fetches so they don't overwrite our optimistic value.
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the current cached links for rollback.
      const previousLinks = queryClient.getQueryData<Link[]>(queryKey);

      // Write the optimistic value.
      if (previousLinks) {
        queryClient.setQueryData<Link[]>(
          queryKey,
          previousLinks.map((link) =>
            link._id === id ? { ...link, isEnabled } : link,
          ),
        );
      }

      // Return the snapshot so onError can restore it.
      return { previousLinks, queryKey };
    },

    /**
     * On success, invalidate the links query so the confirmed server value
     * is loaded (handles the rare case where the server returns a different
     * value).
     */
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linksKeys.all });
    },

    /**
     * On failure, roll back to the previous cache and notify the caller.
     */
    onError: (error, _variables, context) => {
      if (context?.previousLinks && context.queryKey) {
        queryClient.setQueryData<Link[]>(context.queryKey, context.previousLinks);
      }
      onError?.(error);
    },
  });

  return {
    toggleLink: mutation.mutate,
    isToggling: mutation.isPending,
  };
}
