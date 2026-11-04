/**
 * Integration tests for My Network: pending queue, duplicate handling, own-card skip.
 *
 * These tests exercise the FULL interaction between the React Query hooks, the
 * local SQLite store (via the in-memory expo-sqlite mock), and the (mocked) HTTP
 * API. Unlike `use-network.test.ts` — which mocks the entire `network-database`
 * module with `jest.fn()` stubs — these tests let the REAL `network-database` run
 * against the in-memory SQLite mock. This verifies that the hooks actually
 * persist and read pending entries / cached contacts through the storage layer,
 * not just that they call the right functions.
 *
 * Coverage areas (Requirements 12.1, 12.4, 12.5, 12.6, 12.9, 12.10):
 *   1. Pending queue  — offline save → queue → sync drains the queue
 *   2. Duplicate handling — repeat taps, cache replace-by-id, duplicate pending
 *   3. Own-card skip — useNetworkUpsert rejects, useNetworkLinkSave detects
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that transitively use them
// ---------------------------------------------------------------------------

// Only the HTTP layer is mocked. `network-database` runs for real, backed by the
// in-memory expo-sqlite mock wired via moduleNameMapper in jest.config.js.
jest.mock('../../lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    statusCode: number;
    code?: string;
    constructor(message: string, statusCode: number, code?: string) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

const mockRouterReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

// AppState mock — useSyncPending subscribes to foreground events. The listener
// list is kept inside the factory closure; a __triggerChange helper is exposed
// so tests can simulate foreground transitions if needed.
jest.mock('react-native', () => {
  const listeners: Array<(state: string) => void> = [];
  return {
    AppState: {
      addEventListener: jest.fn(
        (event: string, handler: (state: string) => void) => {
          if (event === 'change') listeners.push(handler);
          return {
            remove: jest.fn(() => {
              const idx = listeners.indexOf(handler);
              if (idx !== -1) listeners.splice(idx, 1);
            }),
          };
        },
      ),
      __triggerChange: (state: string) => listeners.forEach((fn) => fn(state)),
      currentState: 'active',
    },
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { api } from '../../lib/api';
import {
  useNetworkList,
  useNetworkUpsert,
  useSyncPending,
} from './use-network';
import { useNetworkLinkSave } from './use-network-link-save';
import {
  addPendingEntry,
  getPendingEntries,
  getPendingCount,
  getCachedContacts,
  upsertCachedContact,
  __resetDatabaseForTesting,
} from './network-database';
import * as SQLiteMock from 'expo-sqlite';
import type { NetworkContactDto } from '@tapsync/shared';
import type { UserProfile } from '../user';
import { USER_PROFILE_QUERY_KEY } from '../user';

const { __clearAllMockDatabases } = SQLiteMock as unknown as {
  __clearAllMockDatabases: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function makeContact(overrides: Partial<NetworkContactDto> = {}): NetworkContactDto {
  return {
    id: 'contact-1',
    publicId: 'abcdefghjk',
    status: 'saved',
    source: 'link',
    tapCount: 1,
    firstSavedAt: '2024-01-01T00:00:00.000Z',
    lastTappedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    publicId: 'myownid123',
    activeMode: 'work',
    hiddenFields: [],
    status: 'active',
    hasEmailLinked: false,
    hasGoogleLinked: false,
    hasRecoveryCode: false,
    ...overrides,
  };
}

/**
 * Wrapper that provides a QueryClient and optionally pre-seeds the user profile
 * cache (for own-card detection) without triggering a real fetch.
 */
function createWrapper(queryClient: QueryClient, profile?: UserProfile) {
  return ({ children }: { children: React.ReactNode }) => {
    if (profile) {
      queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, profile);
    }
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  __clearAllMockDatabases();
  __resetDatabaseForTesting();
  jest.clearAllMocks();
});

// ===========================================================================
// 1. Pending queue
// ===========================================================================

describe('My Network — pending queue', () => {
  /**
   * Test 1: saveContact while offline queues a pending entry with correct data.
   * The real SQLite store should hold the entry afterwards. (Req 12.5)
   */
  it('queues a pending entry when the API throws a network error (offline)', async () => {
    (api.post as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(
      USER_PROFILE_QUERY_KEY,
      makeProfile({ publicId: 'different00' }),
    );

    const { result } = renderHook(() => useNetworkUpsert(), {
      wrapper: createWrapper(queryClient),
    });

    let saveResult: unknown;
    await act(async () => {
      saveResult = await result.current.saveContact('abcdefghjk', 'nfc');
    });

    expect(saveResult).toEqual({ pending: true });

    // The REAL database now holds one pending entry with the correct fields.
    const entries = getPendingEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].publicId).toBe('abcdefghjk');
    expect(entries[0].source).toBe('nfc');
    // tappedAt is a valid ISO 8601 string generated at save time
    const tappedAtMs = new Date(entries[0].tappedAt).getTime();
    expect(Number.isFinite(tappedAtMs)).toBe(true);
    expect(getPendingCount()).toBe(1);
  });

  /**
   * Test 2: syncNow drains the queue via POST /network/sync and deletes entries.
   * The real SQLite store should be empty afterwards. (Req 12.5, 12.9)
   */
  it('drains pending entries via POST /network/sync and deletes them on success', async () => {
    addPendingEntry('aaaaaaaaaa', 'nfc', '2024-01-01T00:00:00.000Z');
    addPendingEntry('bbbbbbbbbb', 'qr', '2024-01-02T00:00:00.000Z');
    expect(getPendingCount()).toBe(2);

    (api.post as jest.Mock).mockResolvedValue({ contacts: [], total: 0 });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useSyncPending(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.syncNow();
    });

    expect(api.post).toHaveBeenCalledWith(
      '/network/sync',
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({ publicId: 'aaaaaaaaaa', source: 'nfc' }),
          expect.objectContaining({ publicId: 'bbbbbbbbbb', source: 'qr' }),
        ]),
      }),
    );

    // The REAL database is drained.
    expect(getPendingEntries()).toEqual([]);
    expect(getPendingCount()).toBe(0);
  });

  /**
   * Test 3: when sync fails, pending entries are preserved for the next attempt.
   * (Req 12.5)
   */
  it('preserves pending entries when sync fails', async () => {
    addPendingEntry('abcdefghjk', 'nfc', '2024-01-01T00:00:00.000Z');
    expect(getPendingCount()).toBe(1);

    (api.post as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useSyncPending(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.syncNow();
    });

    expect(api.post).toHaveBeenCalled();
    // The entry must still be in the REAL database.
    const entries = getPendingEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].publicId).toBe('abcdefghjk');
    expect(getPendingCount()).toBe(1);
  });

  /**
   * Test 4: multiple offline saves are all queued in FIFO order and synced
   * together in one POST /network/sync call. (Req 12.5, 12.9)
   */
  it('queues multiple offline saves in order and syncs them together', async () => {
    // First, all saves go offline.
    (api.post as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(
      USER_PROFILE_QUERY_KEY,
      makeProfile({ publicId: 'different00' }),
    );

    const { result } = renderHook(() => useNetworkUpsert(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.saveContact('aaaaaaaaaa', 'nfc');
    });
    await act(async () => {
      await result.current.saveContact('bbbbbbbbbb', 'qr');
    });
    await act(async () => {
      await result.current.saveContact('cccccccccc', 'link');
    });

    // All three queued in FIFO order in the REAL database.
    const entries = getPendingEntries();
    expect(entries.map((e) => e.publicId)).toEqual([
      'aaaaaaaaaa',
      'bbbbbbbbbb',
      'cccccccccc',
    ]);
    expect(getPendingCount()).toBe(3);

    // Now go online and sync everything in one call.
    (api.post as jest.Mock).mockResolvedValue({ contacts: [], total: 0 });
    const { result: syncResult } = renderHook(() => useSyncPending(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await syncResult.current.syncNow();
    });

    const syncCall = (api.post as jest.Mock).mock.calls.find(
      (c) => c[0] === '/network/sync',
    );
    expect(syncCall).toBeDefined();
    expect(syncCall[1].entries).toHaveLength(3);
    expect(
      syncCall[1].entries.map((e: { publicId: string }) => e.publicId),
    ).toEqual(['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc']);

    // Queue fully drained.
    expect(getPendingEntries()).toEqual([]);
  });

  /**
   * Test 5: after a successful sync, the network list query is invalidated and
   * refetches from the server. (Req 12.9, 12.6)
   */
  it('invalidates the network list after a successful sync so it refetches', async () => {
    addPendingEntry('abcdefghjk', 'nfc', '2024-01-01T00:00:00.000Z');

    const serverContacts = [
      makeContact({ id: 'c1', publicId: 'abcdefghjk', tapCount: 2 }),
    ];
    (api.get as jest.Mock).mockResolvedValue({
      contacts: serverContacts,
      total: 1,
    });
    (api.post as jest.Mock).mockResolvedValue({
      contacts: serverContacts,
      total: 1,
    });

    const queryClient = createTestQueryClient();

    // Render both the list hook and the sync hook together so the list query is
    // active (mounted) and will refetch when invalidated.
    const { result } = renderHook(
      () => ({
        list: useNetworkList(),
        sync: useSyncPending(),
      }),
      { wrapper: createWrapper(queryClient) },
    );

    // Wait for the initial list fetch.
    await waitFor(() => {
      expect(result.current.list.isLoading).toBe(false);
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    // Trigger a sync.
    await act(async () => {
      await result.current.sync.syncNow();
    });

    // Invalidation of the active list query triggers a background refetch.
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });
});

// ===========================================================================
// 2. Duplicate handling
// ===========================================================================

describe('My Network — duplicate handling', () => {
  /**
   * Test 6: saving the same publicId twice (online) hits the server twice
   * (idempotent upsert dedupes server-side) and the local cache holds one
   * contact. (Req 12.2, 12.6)
   */
  it('allows saving the same publicId twice online; the cache holds one contact', async () => {
    const contact = makeContact({ id: 'c1', publicId: 'abcdefghjk', tapCount: 1 });
    (api.post as jest.Mock).mockResolvedValue(contact);

    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(
      USER_PROFILE_QUERY_KEY,
      makeProfile({ publicId: 'different00' }),
    );

    const { result } = renderHook(() => useNetworkUpsert(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.saveContact('abcdefghjk', 'nfc');
    });
    await act(async () => {
      await result.current.saveContact('abcdefghjk', 'nfc');
    });

    // Server receives both taps (it dedupes via idempotent upsert).
    const networkCalls = (api.post as jest.Mock).mock.calls.filter(
      (c) => c[0] === '/network',
    );
    expect(networkCalls).toHaveLength(2);
    expect(networkCalls[0][1].publicId).toBe('abcdefghjk');
    expect(networkCalls[1][1].publicId).toBe('abcdefghjk');

    // The REAL local cache has a single entry (INSERT OR REPLACE by server id).
    const cached = getCachedContacts();
    expect(cached).toHaveLength(1);
    expect(cached[0].id).toBe('c1');
  });

  /**
   * Test 7: upsertCachedContact with the same server id replaces, not duplicates.
   * (Req 12.6)
   */
  it('upsertCachedContact with the same server id replaces instead of duplicating', () => {
    upsertCachedContact(
      makeContact({ id: 'c1', tapCount: 1, snapshot: { name: 'Old' } }),
    );
    upsertCachedContact(
      makeContact({ id: 'c1', tapCount: 3, snapshot: { name: 'New' } }),
    );

    const cached = getCachedContacts();
    expect(cached).toHaveLength(1);
    expect(cached[0].tapCount).toBe(3);
    expect(cached[0].snapshot?.name).toBe('New');
  });

  /**
   * Test 8: two pending entries for the same publicId are both stored (the
   * server deduplicates on sync). (Req 12.5)
   */
  it('queues two pending entries for the same publicId (server dedupes on sync)', () => {
    addPendingEntry('abcdefghjk', 'nfc', '2024-01-01T00:00:00.000Z');
    addPendingEntry('abcdefghjk', 'qr', '2024-01-02T00:00:00.000Z');

    const entries = getPendingEntries();
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.publicId === 'abcdefghjk')).toBe(true);
    expect(entries[0].source).toBe('nfc');
    expect(entries[1].source).toBe('qr');
  });

  /**
   * Test 9: after syncing repeat taps for the same publicId, the server
   * response reflects the updated tapCount and lastTappedAt, and the local
   * cache is updated to match. (Req 12.2, 12.6, 12.9)
   */
  it('updates tapCount and lastTappedAt from the server response after a sync of repeat taps', async () => {
    // Two pending taps for the same publicId.
    addPendingEntry('abcdefghjk', 'nfc', '2024-01-01T00:00:00.000Z');
    addPendingEntry('abcdefghjk', 'nfc', '2024-01-02T00:00:00.000Z');

    // Server dedupes and returns a single contact with updated counts.
    const syncedContact = makeContact({
      id: 'c1',
      publicId: 'abcdefghjk',
      tapCount: 2,
      lastTappedAt: '2024-01-02T00:00:00.000Z',
    });
    (api.post as jest.Mock).mockResolvedValue({
      contacts: [syncedContact],
      total: 1,
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useSyncPending(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.syncNow();
    });

    // The REAL local cache reflects the server's deduped + updated contact.
    const cached = getCachedContacts();
    expect(cached).toHaveLength(1);
    expect(cached[0].tapCount).toBe(2);
    expect(cached[0].lastTappedAt).toBe('2024-01-02T00:00:00.000Z');

    // Pending queue drained.
    expect(getPendingEntries()).toEqual([]);
  });
});

// ===========================================================================
// 3. Own-card skip
// ===========================================================================

describe('My Network — own-card skip', () => {
  /**
   * Test 10: useNetworkUpsert rejects with { code: 'OWN_CARD' } and never calls
   * the API when the publicId matches the user's own profile. (Req 12.4)
   */
  it('rejects with { code: "OWN_CARD" } and does not call the API when saving your own card', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(
      USER_PROFILE_QUERY_KEY,
      makeProfile({ publicId: 'abcdefghjk' }),
    );

    const { result } = renderHook(() => useNetworkUpsert(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      act(async () => {
        await result.current.saveContact('abcdefghjk', 'nfc');
      }),
    ).rejects.toEqual({ code: 'OWN_CARD' });

    expect(api.post).not.toHaveBeenCalled();
  });

  /**
   * Test 11: own-card rejection happens before any API call, so nothing is
   * queued in the REAL pending database. (Req 12.4, 12.5)
   */
  it('does not queue a pending entry when the save is skipped as own-card', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(
      USER_PROFILE_QUERY_KEY,
      makeProfile({ publicId: 'abcdefghjk' }),
    );

    const { result } = renderHook(() => useNetworkUpsert(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      act(async () => {
        await result.current.saveContact('abcdefghjk', 'nfc');
      }),
    ).rejects.toEqual({ code: 'OWN_CARD' });

    // Nothing queued in the REAL database.
    expect(getPendingEntries()).toEqual([]);
    expect(getPendingCount()).toBe(0);
  });

  /**
   * Test 12: the deep-link save handler (useNetworkLinkSave) detects an own-card
   * when profile.publicId matches the link's publicId, sets status to 'own-card',
   * and never attempts a save. (Req 12.4, 13.1)
   */
  it('deep link handler reports own-card when profile.publicId matches the link publicId', async () => {
    const profile = makeProfile({ publicId: 'abcdefghjk' });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, profile);
    // Guard against a background profile refetch hitting the API unexpectedly.
    (api.get as jest.Mock).mockResolvedValue(profile);

    const { result } = renderHook(() => useNetworkLinkSave('abcdefghjk'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('own-card');
    });

    // No save attempted — the API is never hit and there is no navigation.
    expect(api.post).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
