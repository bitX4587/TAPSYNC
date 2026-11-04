/**
 * React Query hooks for NFC card management.
 *
 * Requirements: 7.3, 7.5, 7.8–7.11
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bindCard,
  getProgramPayload,
  labelCard,
  listCards,
  unassignCard,
  type NfcCard,
} from './cards.service';
import { ApiError } from '../../lib/api';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const CARDS_QUERY_KEY = ['cards'] as const;
export const PROGRAM_PAYLOAD_QUERY_KEY = ['cards', 'program-payload'] as const;

// ─── Result types ─────────────────────────────────────────────────────────────

/**
 * Result returned by `useBindCard`'s mutate function.
 *
 * `alreadyBound` is true when the card is already registered to THIS user
 * (idempotent success).  It is false for a fresh bind.
 * If the card belongs to a DIFFERENT user, the mutation throws instead.
 */
export interface BindCardResult {
  card: NfcCard;
  alreadyBound: boolean;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch the permanent profile URL to write to the NFC card.
 *
 * Requirements: 7.3 — the URL is always /c/{publicId}, never the custom name.
 */
export function useCardProgramPayload() {
  return useQuery({
    queryKey: PROGRAM_PAYLOAD_QUERY_KEY,
    queryFn: getProgramPayload,
    // This URL never changes, so we can cache it aggressively.
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Fetch all cards bound to the authenticated user.
 *
 * Requirements: 7.11 — multiple cards are supported.
 */
export function useCards() {
  return useQuery({
    queryKey: CARDS_QUERY_KEY,
    queryFn: listCards,
    staleTime: 30 * 1000,
  });
}

/**
 * Mutation to bind an NFC card after a successful write.
 *
 * Handles `ALREADY_BOUND` (HTTP 409) gracefully:
 * - If the card is already bound to THIS user → returns `{ alreadyBound: true }`.
 * - If the card is bound to a DIFFERENT user → throws so the caller can show
 *   an error ("This card is already registered to another account.").
 *
 * Requirements: 7.5, 7.8, 7.9
 */
export function useBindCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (uid: string): Promise<BindCardResult> => {
      try {
        const response = await bindCard(uid);
        return { card: response.card, alreadyBound: false };
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 409) {
          // The API returns 409 for any UID conflict.
          // Check whether this card belongs to the current user by looking
          // at the cards already in the local cache.
          const cachedCards = queryClient.getQueryData<NfcCard[]>(CARDS_QUERY_KEY);
          const normalizedUid = uid.toUpperCase();
          const ownCard = cachedCards?.find(
            (c) => c.uid.toUpperCase() === normalizedUid,
          );

          if (ownCard) {
            // Card is already bound to this user — treat as success.
            return { card: ownCard, alreadyBound: true };
          }

          // Card is bound to a different account — surface the error.
          throw new Error('This card is already registered to another account.');
        }
        throw err;
      }
    },
    onSuccess: () => {
      // Refresh the card list so the new card appears immediately.
      queryClient.invalidateQueries({ queryKey: CARDS_QUERY_KEY });
    },
  });
}

/**
 * Mutation to unassign a card from the authenticated user's account.
 *
 * Requirements: 7.10
 */
export function useUnassignCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unassignCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CARDS_QUERY_KEY });
    },
  });
}

/**
 * Mutation to update a card's label.
 */
export function useLabelCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      labelCard(id, label),
    onSuccess: (updatedCard) => {
      // Optimistically update the card in the list cache.
      queryClient.setQueryData<NfcCard[]>(CARDS_QUERY_KEY, (old) =>
        old?.map((c) => (c.id === updatedCard.id ? updatedCard : c)) ?? [],
      );
    },
  });
}
