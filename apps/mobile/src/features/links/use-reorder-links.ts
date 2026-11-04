/**
 * useReorderLinks hook
 *
 * Implements an optimistic reorder of profile links within a mode, with
 * automatic rollback on failure. This mirrors the optimistic pattern used
 * by `useToggleLink` and `useModeToggle`.
 *
 * Flow:
 * 1. User moves a link up/down → optimistically reorder the React Query cache
 *    for the link's mode so the list reflects the new order instantly.
 * 2. PUT /links/reorder with { mode, orderedIds } is called in the background.
 * 3a. SUCCESS → invalidate the links query so the server-confirmed order loads.
 * 3b. FAILURE → rollback to the previous cache and call onError (Req 3.4).
 *
 * Requirements: 3.4 (reorder persist atomically), 3.3 (persist + invalidate)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Mode } from '@tapsync/shared';
import { reorderLinks as reorderLinksService, type Link } from './link.service';
import { linksKeys } from './use-links';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Variables passed to the reorder mutation.
 */
export interface ReorderLinksVariables {
  /** The mode whose links are being reordered. */
  mode: Mode;
  /** The full list of link IDs in the new desired order. */
  orderedIds: string[];
}

export interface UseReorderLinksOptions {
  /**
   * Called when the reorder request fails so the UI can show an error toast.
   * Receives the error that was thrown.
   */
  onError?: (error: Error) => void;
}

export interface UseReorderLinksResult {
  /** Call this to persist a new link order within a mode. */
  reorderLinks: (mode: Mode, orderedIds: string[]) => void;
  /** Whether a reorder request is in flight. */
  isReordering: boolean;
}

/**
 * Context returned by `onMutate` and passed to `onError` for rollback.
 * Declared explicitly so TypeScript knows the shape of the optimistic
 * snapshot.
 */
interface ReorderLinksContext {
  previousLinks: Link[] | undefined;
  queryKey: readonly ['links', Mode];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reorder the cached links array to match the given `orderedIds`, updating
 * each link's `priorityOrder` to reflect its new position.
 *
 * Links not present in `orderedIds` (defensive) are appended at the end in
 * their original relative order.
 */
function applyOrder(
  links: Link[] | undefined,
  orderedIds: string[],
): Link[] | undefined {
  if (!links) return links;

  const byId = new Map(links.map((link) => [link._id, link]));
  const reordered: Link[] = [];

  orderedIds.forEach((id) => {
    const link = byId.get(id);
    if (link) {
      reordered.push({ ...link, priorityOrder: reordered.length });
    }
  });

  // Append any links not included in orderedIds (defensive) at the end.
  links.forEach((link) => {
    if (!orderedIds.includes(link._id)) {
      reordered.push({ ...link, priorityOrder: reordered.length });
    }
  });

  return reordered;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Optimistic link reorder hook.
 *
 * Example:
 *   const { reorderLinks, isReordering } = useReorderLinks({
 *     onError: (err) => Alert.alert('Could not reorder links', err.message),
 *   });
 *   reorderLinks(Mode.Work, ['id3', 'id1', 'id2']);
 */
export function useReorderLinks({
  onError,
}: UseReorderLinksOptions = {}): UseReorderLinksResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    void,
    Error,
    ReorderLinksVariables,
    ReorderLinksContext
  >({
    mutationFn: ({ mode, orderedIds }) =>
      reorderLinksService({ mode, orderedIds }),

    /**
     * Optimistic update — immediately reorder the per-mode cache so the
     * list reflects the new order without waiting for the server.
     */
    onMutate: async ({ mode, orderedIds }) => {
      const queryKey = linksKeys.mode(mode);

      // Cancel any in-flight fetches so they don't overwrite our optimistic value.
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the current cached links for rollback.
      const previousLinks = queryClient.getQueryData<Link[]>(queryKey);

      // Write the optimistic reordered list.
      if (previousLinks) {
        queryClient.setQueryData<Link[]>(
          queryKey,
          applyOrder(previousLinks, orderedIds),
        );
      }

      // Return the snapshot so onError can restore it.
      return { previousLinks, queryKey };
    },

    /**
     * On success, invalidate the links query so the confirmed server order
     * is loaded (handles the rare case where the server returns a different
     * order).
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
    reorderLinks: (mode, orderedIds) =>
      mutation.mutate({ mode, orderedIds }),
    isReordering: mutation.isPending,
  };
}
