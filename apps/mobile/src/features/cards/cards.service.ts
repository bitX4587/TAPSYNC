/**
 * Cards service
 *
 * API calls for NFC card programming and management.
 *
 * Requirements: 7.3, 7.5, 7.8–7.11
 */

import { api } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Response from GET /cards/program-payload
 * The permanent profile URL to write onto the card — always /c/{publicId},
 * never the custom name URL (Requirement 7.3).
 */
export interface ProgramPayload {
  url: string;
}

/**
 * A bound NFC card as returned by the API.
 */
export interface NfcCard {
  id: string;
  uid: string;
  status: 'active' | 'unassigned';
  label?: string | null;
  lastProgrammedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response from POST /cards/bind
 */
export interface BindCardResponse {
  card: NfcCard;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Fetch the permanent profile URL to write to the card.
 *
 * Requirements: 7.3 — the app SHALL fetch the permanent Profile URL and
 * SHALL NOT use the Custom Name URL.
 */
export async function getProgramPayload(): Promise<ProgramPayload> {
  return api.get<ProgramPayload>('/cards/program-payload');
}

/**
 * Bind a card UID to the authenticated user's account.
 *
 * Requirements: 7.5 — after a verified write, call the API to bind.
 * Requirements: 7.8 — if UID is already bound to another account, API returns 409.
 *
 * @throws ApiError with statusCode 409 and code 'ALREADY_BOUND' if the card
 *         is registered to a different account.
 */
export async function bindCard(uid: string): Promise<BindCardResponse> {
  return api.post<BindCardResponse>('/cards/bind', { uid });
}

/**
 * List all cards bound to the authenticated user.
 *
 * Requirements: 7.11 — an owner may have multiple cards.
 */
export async function listCards(): Promise<NfcCard[]> {
  return api.get<NfcCard[]>('/cards');
}

/**
 * Unassign (remove) a card from the authenticated user's account.
 *
 * Requirements: 7.10 — unassigning marks the card as `unassigned`.
 */
export async function unassignCard(id: string): Promise<void> {
  return api.delete<void>(`/cards/${id}`);
}

/**
 * Update the label on a card.
 *
 * @param id    Card document ID.
 * @param label Human-readable label (e.g. "Wallet card", "Keychain").
 */
export async function labelCard(id: string, label: string): Promise<NfcCard> {
  return api.patch<NfcCard>(`/cards/${id}`, { label });
}
