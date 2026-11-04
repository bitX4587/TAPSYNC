/**
 * React Query hooks for My Network.
 *
 * Provides list, search, upsert, delete, note-update and sync-pending
 * functionality, with SQLite as an offline cache and pending queue.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.9, 12.10
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { NetworkContactDto, SaveNetworkContactDto, SyncNetworkContactsDto } from '@tapsync/shared';
import type { Mode } from '@tapsync/shared';
import {
  getPendingEntries,
  addPendingEntry,
  deletePendingEntry,
  getPendingCount,
  getCachedContacts,
  getCachedContact,
  upsertCachedContact,
  upsertCachedContacts,
  deleteCachedContact,
  updateCachedContactNote,
} from './network-database';
import { USER_PROFILE_QUERY_KEY } from '../user';
import type { UserProfile } from '../user';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface NetworkListResponse {
  contacts: NetworkContactDto[];
  total: number;
  cursor?: string;
}

// ---------------------------------------------------------------------------
// Query key constants
// ---------------------------------------------------------------------------

export const NETWORK_QUERY_KEYS = {
  list: () => ['network', 'list'] as const,
  contact: (publicId: string) => ['network', 'contact', publicId] as const,
} as const;

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the error is a network/connectivity error rather than a
 * server 4xx/5xx. A network error is any error that is NOT an ApiError — it
 * typically shows up as a `TypeError` thrown by `fetch`.
 */
export function isNetworkError(error: unknown): boolean {
  return !(error instanceof ApiError);
}

// ---------------------------------------------------------------------------
// 1. useNetworkList
// ---------------------------------------------------------------------------

export interface UseNetworkListResult {
  contacts: NetworkContactDto[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  pendingCount: number;
}

/**
 * Fetch and search the user's My Network list.
 *
 * - Online: fetches from `GET /network`, updates the local cache.
 * - Offline/error: falls back to the local SQLite cache.
 * - Client-side filtering by `searchQuery` (name or designation).
 *
 * Requirements: 12.3, 12.6, 12.10
 */
export function useNetworkList(searchQuery?: string): UseNetworkListResult {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<NetworkContactDto[], Error>({
    queryKey: NETWORK_QUERY_KEYS.list(),
    queryFn: async () => {
      try {
        const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
        const response = await api.get<NetworkListResponse>(`/network${params}`);
        const contacts = response.contacts ?? [];
        // Update the local cache with the fresh server data (Req 12.6)
        upsertCachedContacts(contacts);
        return contacts;
      } catch (error) {
        // On any network/server error fall back to the cached contacts (Req 12.10)
        return getCachedContacts();
      }
    },
    staleTime: 30 * 1000,
  });

  // Apply client-side search filter
  const allContacts = data ?? [];
  const contacts = searchQuery
    ? filterContacts(allContacts, searchQuery)
    : allContacts;

  return {
    contacts,
    isLoading,
    isError,
    refetch,
    pendingCount: getPendingCount(),
  };
}

/**
 * Case-insensitive filter over snapshot name and designation.
 */
function filterContacts(contacts: NetworkContactDto[], query: string): NetworkContactDto[] {
  const lower = query.toLowerCase();
  return contacts.filter((c) => {
    const name = c.snapshot?.name?.toLowerCase() ?? '';
    const designation = c.snapshot?.designation?.toLowerCase() ?? '';
    return name.includes(lower) || designation.includes(lower);
  });
}

// ---------------------------------------------------------------------------
// 2. useNetworkUpsert
// ---------------------------------------------------------------------------

interface SaveContactResult {
  contact?: NetworkContactDto;
  pending?: boolean;
}

export interface UseNetworkUpsertResult {
  saveContact: (
    publicId: string,
    source: SaveNetworkContactDto['source'],
    modeAtSave?: Mode,
  ) => Promise<SaveContactResult>;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

/**
 * Save a contact to My Network, with offline queuing.
 *
 * - Own-card detection: throws `{ code: 'OWN_CARD' }` immediately.
 * - Online: POST /network → cache upsert → invalidate list.
 * - Offline/network-error: add to pending queue for later sync.
 *
 * Requirements: 12.1, 12.4, 12.5
 */
export function useNetworkUpsert(): UseNetworkUpsertResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<SaveContactResult, unknown, {
    publicId: string;
    source: SaveNetworkContactDto['source'];
    modeAtSave?: Mode;
  }>({
    mutationFn: async ({ publicId, source, modeAtSave }) => {
      // Own-card detection (Req 12.4)
      const profile = queryClient.getQueryData<UserProfile>(USER_PROFILE_QUERY_KEY);
      if (profile?.publicId === publicId) {
        throw { code: 'OWN_CARD' };
      }

      const tappedAt = new Date().toISOString();
      const dto: SaveNetworkContactDto = { publicId, source, tappedAt, modeAtSave };

      try {
        const contact = await api.post<NetworkContactDto>('/network', dto);
        // Cache the saved contact (Req 12.6)
        upsertCachedContact(contact);
        return { contact };
      } catch (error) {
        if (isNetworkError(error)) {
          // Offline — queue for later sync (Req 12.5)
          addPendingEntry(publicId, source, tappedAt, modeAtSave);
          return { pending: true };
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NETWORK_QUERY_KEYS.list() });
    },
  });

  const saveContact = (
    publicId: string,
    source: SaveNetworkContactDto['source'],
    modeAtSave?: Mode,
  ) => mutation.mutateAsync({ publicId, source, modeAtSave });

  return {
    saveContact,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}

// ---------------------------------------------------------------------------
// 3. useSyncPending
// ---------------------------------------------------------------------------

export interface UseSyncPendingResult {
  syncNow: () => Promise<void>;
  isSyncing: boolean;
}

/**
 * Drain the pending entries queue by POSTing to `POST /network/sync`.
 *
 * Triggers automatically when the app comes to the foreground. Also
 * exposes `syncNow()` for manual invocation.
 *
 * Requirements: 12.2, 12.5, 12.9
 */
export function useSyncPending(): UseSyncPendingResult {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  const doSync = async () => {
    // Guard against concurrent sync calls
    if (isSyncingRef.current) return;

    const pending = getPendingEntries();
    if (pending.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const dto: SyncNetworkContactsDto = {
        entries: pending.map((e) => ({
          publicId: e.publicId,
          source: e.source,
          tappedAt: e.tappedAt,
          ...(e.modeAtSave ? { modeAtSave: e.modeAtSave } : {}),
        })),
      };

      const response = await api.post<NetworkListResponse>('/network/sync', dto);

      // On success: remove each synced pending entry
      for (const entry of pending) {
        deletePendingEntry(entry.id);
      }

      // Update the local cache and invalidate the list query
      if (response?.contacts) {
        upsertCachedContacts(response.contacts);
      }
      await queryClient.invalidateQueries({ queryKey: NETWORK_QUERY_KEYS.list() });
    } catch {
      // Leave pending entries intact for the next attempt (Req 12.5)
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  // Listen for app foreground events and sync when they occur
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          void doSync();
        }
      },
    );

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { syncNow: doSync, isSyncing };
}

// ---------------------------------------------------------------------------
// 4. useNetworkContact
// ---------------------------------------------------------------------------

export interface UseNetworkContactResult {
  contact: NetworkContactDto | null;
  isLoading: boolean;
}

/**
 * Fetch a single contact by publicId.
 *
 * Uses the list cache if available, falls back to the local SQLite cache.
 *
 * Requirements: 12.3, 12.6
 */
export function useNetworkContact(publicId: string): UseNetworkContactResult {
  const queryClient = useQueryClient();

  const { data: contact = null, isLoading } = useQuery<NetworkContactDto | null>({
    queryKey: NETWORK_QUERY_KEYS.contact(publicId),
    queryFn: async () => {
      // Check the in-memory list cache first
      const cached = queryClient.getQueryData<NetworkContactDto[]>(NETWORK_QUERY_KEYS.list());
      if (cached) {
        const found = cached.find((c) => c.publicId === publicId) ?? null;
        if (found) return found;
      }

      // Fall back to SQLite cache
      return getCachedContact(publicId);
    },
    staleTime: 30 * 1000,
  });

  return { contact, isLoading };
}

// ---------------------------------------------------------------------------
// 5. useNetworkDelete
// ---------------------------------------------------------------------------

export interface UseNetworkDeleteResult {
  deleteContact: (id: string) => Promise<void>;
  isPending: boolean;
}

/**
 * Delete a contact from My Network.
 *
 * Requirements: 12.4
 */
export function useNetworkDelete(): UseNetworkDeleteResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, unknown, string>({
    mutationFn: async (id: string) => {
      await api.delete(`/network/${id}`);
      deleteCachedContact(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NETWORK_QUERY_KEYS.list() });
    },
  });

  return {
    deleteContact: (id: string) => mutation.mutateAsync(id),
    isPending: mutation.isPending,
  };
}

// ---------------------------------------------------------------------------
// 6. useNetworkNote
// ---------------------------------------------------------------------------

export interface UseNetworkNoteResult {
  updateNote: (id: string, note: string) => Promise<void>;
  isPending: boolean;
}

/**
 * Update the private note on a contact.
 *
 * Requirements: 12.4
 */
export function useNetworkNote(): UseNetworkNoteResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, unknown, { id: string; note: string }>({
    mutationFn: async ({ id, note }) => {
      const updated = await api.patch<NetworkContactDto>(`/network/${id}`, { note });
      updateCachedContactNote(id, note);
      // Update the individual contact query if cached
      queryClient.setQueryData<NetworkContactDto | null>(
        NETWORK_QUERY_KEYS.contact(updated.publicId),
        updated,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NETWORK_QUERY_KEYS.list() });
    },
  });

  return {
    updateNote: (id: string, note: string) => mutation.mutateAsync({ id, note }),
    isPending: mutation.isPending,
  };
}
