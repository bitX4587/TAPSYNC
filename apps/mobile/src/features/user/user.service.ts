/**
 * User profile service
 *
 * Handles fetching and updating the authenticated user's profile,
 * including the active mode toggle and avatar upload.
 *
 * Requirements: 2.4, 2.5, 2.7, 4.1, 4.2
 */

import { api, apiRequest } from '../../lib/api';

export type Mode = 'work' | 'casual';

/**
 * Full user profile returned by GET /user/me
 */
export interface UserProfile {
  publicId: string;
  fullName?: string | null;
  designation?: string | null;
  company?: string | null;
  bio?: string | null;
  phone?: string | null;
  publicEmail?: string | null;
  avatarUrl?: string | null;
  customName?: string | null;
  hiddenFields: ('phone' | 'publicEmail')[];
  activeMode: Mode;
  status: 'active' | 'suspended' | 'deleted';
  hasEmailLinked: boolean;
  hasGoogleLinked: boolean;
  hasRecoveryCode: boolean;
}

/**
 * DTO for PATCH /user/me — all fields optional.
 *
 * Requirements: 2.4, 2.7
 */
export interface UpdateProfileDto {
  fullName?: string | null;
  designation?: string | null;
  company?: string | null;
  bio?: string | null;
  phone?: string | null;
  publicEmail?: string | null;
  /** Fields the Owner wants to hide from the public page and vCard. */
  hiddenFields?: ('phone' | 'publicEmail')[];
}

/**
 * Response from PATCH /user/mode
 */
export interface ModeToggleResponse {
  activeMode: Mode;
}

/**
 * Fetch the current user's profile.
 *
 * Requirements: 4.4 — the app displays the Active Mode as stored on the server.
 */
export async function fetchUserProfile(): Promise<UserProfile> {
  return api.get<UserProfile>('/user/me');
}

/**
 * Toggle (or set) the active mode.
 *
 * Requirements: 4.2 — WHEN an Owner calls the mode toggle with 'work' or
 * 'casual' THEN the system SHALL update the Active Mode and return the new value.
 */
export async function updateMode(mode: Mode): Promise<ModeToggleResponse> {
  return api.patch<ModeToggleResponse>('/user/mode', { mode });
}

/**
 * Update the current user's profile fields.
 *
 * Requirements: 2.4 — WHEN an Owner updates full name, bio, designation,
 * phone, public email or company THEN the system SHALL validate and persist
 * the changes.
 * Requirements: 2.7 — hidden fields are excluded from the public page and vCard.
 */
export async function updateUserProfile(dto: UpdateProfileDto): Promise<UserProfile> {
  return api.patch<UserProfile>('/user/me', dto);
}

// ─── Custom Name ─────────────────────────────────────────────────────────────

/**
 * Response from GET /user/custom-name/available
 */
export interface CustomNameAvailabilityResponse {
  available: boolean;
  reason?: string;
}

/**
 * Check whether a custom name is available to claim.
 *
 * Requirements: 2.8
 */
export async function checkCustomNameAvailability(
  name: string,
): Promise<CustomNameAvailabilityResponse> {
  return api.get<CustomNameAvailabilityResponse>(
    `/user/custom-name/available?name=${encodeURIComponent(name)}`,
  );
}

/**
 * Claim or change the current user's custom name.
 *
 * Requirements: 2.8, 2.9, 2.10, 2.13, 2.14
 */
export async function claimCustomName(name: string): Promise<UserProfile> {
  return api.put<UserProfile>('/user/custom-name', { name });
}

/**
 * Remove the current user's custom name (retires the name).
 *
 * Requirements: 2.11
 */
export async function removeCustomName(): Promise<UserProfile> {
  return api.delete<UserProfile>('/user/custom-name');
}

// ─── Avatar upload ────────────────────────────────────────────────────────────

/**
 * Upload a profile avatar image via multipart/form-data.
 *
 * Requirements: 2.5 — accept JPEG, PNG or WebP up to 5 MB, resize, CDN URL.
 *
 * @param fileUri  Local file URI (e.g. from an image picker).
 * @param fileName File name including extension (e.g. 'avatar.jpg').
 * @param mimeType MIME type (e.g. 'image/jpeg').
 */
export async function uploadAvatar(
  fileUri: string,
  fileName: string,
  mimeType: string,
): Promise<UserProfile> {
  const formData = new FormData();
  // React Native's FormData accepts { uri, type, name } as the file blob.
  formData.append('file', {
    uri: fileUri,
    type: mimeType,
    name: fileName,
  } as unknown as Blob);

  // Use apiRequest directly so we can send FormData. We must NOT set
  // Content-Type manually — the runtime sets the multipart boundary.
  return apiRequest<UserProfile>('/user/me/avatar', {
    method: 'POST',
    body: formData,
    headers: {},
  });
}
