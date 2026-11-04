/**
 * Link service
 *
 * API call functions for profile link management (CRUD, reorder, move/copy).
 *
 * Requirements: 3.1–3.9 (Link Management)
 */

import { Mode } from '@tapsync/shared';
import { api } from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single profile link as returned by the API.
 *
 * The API returns Mongoose documents serialized to JSON, so the identifier
 * is `_id` (a MongoDB ObjectId string).
 */
export interface Link {
  /** MongoDB ObjectId (string). */
  _id: string;
  userId: string;
  mode: Mode;
  title: string;
  url: string;
  /** Icon key from the registry in `packages/shared`, or `'custom'`. */
  icon: string;
  /** Category key from `LINK_CATEGORIES` in `packages/shared`, or `'custom'`. */
  category: string;
  /** Relative sort position within the (userId, mode) partition. */
  priorityOrder: number;
  /** Whether the link is visible on the public page (Requirement 3.5). */
  isEnabled: boolean;
  /** Denormalized click counter (Requirement 8.2 / 11.2). */
  clickCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO for creating a new link.
 * Requirement 3.1 — Owner creates a link with title, URL, mode, category, icon.
 */
export interface CreateLinkDto {
  title: string;
  url: string;
  mode: Mode;
  category: string;
  icon?: string;
}

/**
 * DTO for updating an existing link.
 * Requirement 3.3 — Owner edits a link.
 * Requirement 3.5 — Owner disables a link (isEnabled).
 */
export interface UpdateLinkDto {
  title?: string;
  url?: string;
  category?: string;
  icon?: string;
  isEnabled?: boolean;
}

/**
 * DTO for atomic reordering of links within a mode.
 * Requirement 3.4 — Owner reorders links, persist atomically.
 */
export interface ReorderLinksDto {
  mode: Mode;
  orderedIds: string[];
}

/**
 * DTO for moving or copying a link between modes.
 * Requirement 3.7 — Owner moves or copies link between modes.
 */
export interface MoveCopyLinkDto {
  targetMode: Mode;
  /** If true, copy instead of move. */
  copy?: boolean;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetch links for the authenticated user, optionally filtered by mode.
 *
 * Requirement 3.1 — links are returned sorted by priorityOrder.
 *
 * @param mode If provided, only links for this mode are returned.
 */
export async function fetchLinks(mode?: Mode): Promise<Link[]> {
  const endpoint = mode ? `/links?mode=${mode}` : '/links';
  return api.get<Link[]>(endpoint);
}

/**
 * Create a new link.
 * Requirement 3.1.
 */
export async function createLink(dto: CreateLinkDto): Promise<Link> {
  return api.post<Link>('/links', dto);
}

/**
 * Update an existing link (title, URL, category, icon, isEnabled).
 * Requirement 3.3 (edit) and 3.5 (enable/disable).
 */
export async function updateLink(id: string, dto: UpdateLinkDto): Promise<Link> {
  return api.patch<Link>(`/links/${id}`, dto);
}

/**
 * Delete a link.
 * Requirement 3.6.
 */
export async function deleteLink(id: string): Promise<void> {
  return api.delete<void>(`/links/${id}`);
}

/**
 * Atomically reorder links within a mode.
 * Requirement 3.4.
 */
export async function reorderLinks(dto: ReorderLinksDto): Promise<void> {
  return api.put<void>('/links/reorder', dto);
}

/**
 * Move or copy a link between modes.
 * Requirement 3.7.
 */
export async function moveCopyLink(id: string, dto: MoveCopyLinkDto): Promise<Link> {
  return api.post<Link>(`/links/${id}/move-copy`, dto);
}
