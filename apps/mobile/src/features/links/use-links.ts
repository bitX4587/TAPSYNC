/**
 * React Query hooks for link management.
 *
 * Provides read hooks (useLinks) and write hooks (useCreateLink, useUpdateLink,
 * useDeleteLink) that keep the React Query cache in sync with the API.
 *
 * Requirements: 3.1–3.9
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Mode } from '@tapsync/shared';
import {
  fetchLinks,
  createLink,
  updateLink,
  deleteLink,
  moveCopyLink,
  type Link,
  type CreateLinkDto,
  type UpdateLinkDto,
  type MoveCopyLinkDto,
} from './link.service';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/**
 * Query key factory for links.
 *
 * The base key `['links']` is a prefix of every link query, so invalidating
 * `linksKeys.all` refreshes both the per-mode and unfiltered caches.
 */
export const linksKeys = {
  all: ['links'] as const,
  mode: (mode: Mode) => ['links', mode] as const,
};

// ---------------------------------------------------------------------------
// Read hook
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated user's links, optionally filtered by mode.
 *
 * When `mode` is provided the query key is `['links', mode]`, which lets the
 * optimistic toggle hook target a single mode's cache.
 */
export function useLinks(mode?: Mode) {
  return useQuery<Link[]>({
    queryKey: mode ? linksKeys.mode(mode) : linksKeys.all,
    queryFn: () => fetchLinks(mode),
  });
}

// ---------------------------------------------------------------------------
// Write hooks
// ---------------------------------------------------------------------------

export interface UseCreateLinkOptions {
  onSuccess?: (link: Link) => void;
  onError?: (error: Error) => void;
}

/**
 * Create a new link.
 * Invalidates the links cache on success so the new link appears in lists.
 */
export function useCreateLink({ onSuccess, onError }: UseCreateLinkOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation<Link, Error, CreateLinkDto>({
    mutationFn: createLink,
    onSuccess: (link) => {
      queryClient.invalidateQueries({ queryKey: linksKeys.all });
      onSuccess?.(link);
    },
    onError: (error) => {
      onError?.(error);
    },
  });
}

export interface UseUpdateLinkOptions {
  onSuccess?: (link: Link) => void;
  onError?: (error: Error) => void;
}

/**
 * Update an existing link (title, URL, category, icon, isEnabled).
 * Invalidates the links cache on success.
 */
export function useUpdateLink({ onSuccess, onError }: UseUpdateLinkOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation<Link, Error, { id: string; dto: UpdateLinkDto }>({
    mutationFn: ({ id, dto }) => updateLink(id, dto),
    onSuccess: (link) => {
      queryClient.invalidateQueries({ queryKey: linksKeys.all });
      onSuccess?.(link);
    },
    onError: (error) => {
      onError?.(error);
    },
  });
}

export interface UseDeleteLinkOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Delete a link.
 * Invalidates the links cache on success.
 */
export function useDeleteLink({ onSuccess, onError }: UseDeleteLinkOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: deleteLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linksKeys.all });
      onSuccess?.();
    },
    onError: (error) => {
      onError?.(error);
    },
  });
}

// ---------------------------------------------------------------------------
// Move / Copy hooks (Requirement 3.7)
// ---------------------------------------------------------------------------

export interface UseMoveCopyLinkOptions {
  onSuccess?: (link: Link) => void;
  onError?: (error: Error) => void;
}

/**
 * Variables for the move/copy mutation.
 */
export interface MoveCopyVariables {
  id: string;
  dto: MoveCopyLinkDto;
}

/**
 * Move a link from its current mode to the other mode.
 *
 * Invalidates the links cache for both modes on success so the lists stay in sync.
 *
 * Requirement 3.7 — WHEN an Owner moves a link between modes THEN the system
 * SHALL update it accordingly.
 */
export function useMoveLink({ onSuccess, onError }: UseMoveCopyLinkOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation<Link, Error, MoveCopyVariables>({
    mutationFn: ({ id, dto }) => moveCopyLink(id, { ...dto, copy: false }),
    onSuccess: (link) => {
      // Invalidate both modes so neither list shows stale data.
      queryClient.invalidateQueries({ queryKey: linksKeys.all });
      onSuccess?.(link);
    },
    onError: (error) => {
      onError?.(error);
    },
  });
}

/**
 * Copy a link to the other mode (keeps the original in place).
 *
 * Invalidates the links cache for both modes on success.
 *
 * Requirement 3.7 — WHEN an Owner copies a link between modes THEN the system
 * SHALL duplicate it accordingly.
 */
export function useCopyLink({ onSuccess, onError }: UseMoveCopyLinkOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation<Link, Error, MoveCopyVariables>({
    mutationFn: ({ id, dto }) => moveCopyLink(id, { ...dto, copy: true }),
    onSuccess: (link) => {
      queryClient.invalidateQueries({ queryKey: linksKeys.all });
      onSuccess?.(link);
    },
    onError: (error) => {
      onError?.(error);
    },
  });
}
