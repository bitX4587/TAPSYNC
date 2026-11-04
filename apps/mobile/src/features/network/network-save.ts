/**
 * Network save service — link-handling flow for My Network.
 *
 * When the app is opened from a `tapsync://c/{publicId}` or
 * `tapsync://p/{customName}` deep link, these helpers validate the input,
 * resolve a custom name to a publicId, and save the contact to My Network.
 *
 * Requirements: 12.1, 12.4, 13.1
 */

import {
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
  CUSTOM_NAME_REGEX,
  CUSTOM_NAME_MIN_LENGTH,
  CUSTOM_NAME_MAX_LENGTH,
} from '@tapsync/shared';
import { api, ApiError } from '../../lib/api';
import type { SaveNetworkContactDto, NetworkContactDto } from '@tapsync/shared';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Regex for a valid Public ID: exactly {@link PUBLIC_ID_LENGTH} characters
 * from the look-alike-free {@link PUBLIC_ID_ALPHABET}.
 */
const PUBLIC_ID_REGEX = new RegExp(
  `^[${PUBLIC_ID_ALPHABET}]{${PUBLIC_ID_LENGTH}}$`,
);

/**
 * Validate a Public ID received from a deep link.
 *
 * Requirement 12.1 — the app SHALL validate the Public ID format.
 *
 * @returns `null` when valid, or an error message string when invalid.
 */
export function validatePublicId(publicId: string): string | null {
  if (!publicId) {
    return 'No Public ID provided.';
  }
  if (!PUBLIC_ID_REGEX.test(publicId)) {
    return 'This link contains an invalid Public ID.';
  }
  return null;
}

/**
 * Validate a custom name received from a deep link.
 *
 * Requirement 2.8 — 3–30 characters, lowercase letters, numbers, `_` and `-`.
 *
 * @returns `null` when valid, or an error message string when invalid.
 */
export function validateCustomName(name: string): string | null {
  if (!name) {
    return 'No custom name provided.';
  }
  if (name.length < CUSTOM_NAME_MIN_LENGTH || name.length > CUSTOM_NAME_MAX_LENGTH) {
    return `Custom name must be ${CUSTOM_NAME_MIN_LENGTH}–${CUSTOM_NAME_MAX_LENGTH} characters.`;
  }
  if (!CUSTOM_NAME_REGEX.test(name)) {
    return 'Custom name may only contain lowercase letters, numbers, _ and -.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Custom-name resolution
// ---------------------------------------------------------------------------

/**
 * Response from `GET /public/profiles/p/:name`.
 * - `profile` is present when the name is the owner's current custom name.
 * - `redirectTo` (a `/c/{publicId}` path) is present when the name is retired.
 */
interface CustomNameResolutionResponse {
  profile?: { publicId: string };
  redirectTo?: string;
}

/**
 * Resolve a custom name to a Public ID via the public API.
 *
 * Requirement 13.1 — `tapsync://p/{name}` must resolve the profile before
 * running the save flow.
 *
 * @throws {ApiError} with `statusCode` 404 when the name does not exist.
 * @returns The resolved Public ID.
 */
export async function resolveCustomNameToPublicId(name: string): Promise<string> {
  const response = await api.get<CustomNameResolutionResponse>(
    `/public/profiles/p/${encodeURIComponent(name)}`,
    { withAuth: false },
  );

  // Current name — profile is present
  if (response.profile?.publicId) {
    return response.profile.publicId;
  }

  // Retired name — redirectTo is a `/c/{publicId}` path
  if (response.redirectTo) {
    return extractPublicIdFromPath(response.redirectTo);
  }

  // Should never happen, but guard anyway
  throw new ApiError('Could not resolve custom name', 404, 'NAME_NOT_RESOLVED');
}

/**
 * Extract the Public ID from a `/c/{publicId}` path returned by the API.
 */
function extractPublicIdFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  // Expecting ['c', '{publicId}']
  const publicId = segments[segments.length - 1];
  return publicId ?? '';
}

// ---------------------------------------------------------------------------
// Save to My Network
// ---------------------------------------------------------------------------

/**
 * Save a contact to My Network with `source: 'link'`.
 *
 * Requirement 12.1 — save without asking for confirmation.
 * Requirement 13.1 — the save flow runs when the app opens from a profile link.
 *
 * @throws {ApiError} with `statusCode`:
 *   - 404 when the profile does not exist.
 *   - 403 when the caller tries to save their own profile (server-side guard).
 * @returns The saved/updated NetworkContactDto.
 */
export async function saveNetworkContactFromLink(
  publicId: string,
): Promise<NetworkContactDto> {
  const dto: SaveNetworkContactDto = {
    publicId,
    source: 'link',
    tappedAt: new Date().toISOString(),
  };

  return api.post<NetworkContactDto>('/network', dto);
}

/**
 * Type guard for detecting an ApiError with a specific status code.
 */
export function isApiErrorWithStatus(
  error: unknown,
  statusCode: number,
): boolean {
  return error instanceof ApiError && error.statusCode === statusCode;
}
