/**
 * Tests for useNetwork hooks (React Query).
 *
 * Covers:
 *  1. useNetworkList — server fetch, cache fallback, search filter
 *  2. useNetworkUpsert — online save, offline pending queue, own-card check
 *  3. useSyncPending — drains pending entries via POST /network/sync
 *  4. useNetworkDelete — deletes from server + cache
 *  5. useNetworkNote — updates note on server + cache
 *
 * Requirements: 12.1–12.6, 12.9, 12.10
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { AppState } from 'react-native';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the hooks under test
// ---------------------------------------------------------------------------

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

jest.mock('./network-database', () => ({
  getPendingEntries: jest.fn(),
  addPendingEntry: jest.fn(),
  deletePendingEntry: jest.fn(),
  clearPendingEntries: jest.fn(),
  getPendingCount: jest.fn(),
  getCachedContacts: jest.fn(),
  getCachedContact: jest.fn(),
  upsertCachedContact: jest.fn(),
  upsertCachedContacts: jest.fn(),
  deleteCachedContact: jest.fn(),
  updateCachedContactNote: jest.fn(),
  initDatabase: jest.fn(),
}));

jest.mock('react-native', () => {
  const listeners: Array<(state: string) => void> = [];
  return {
    AppState: {
      addEventListener: jest.fn((event: string, handler: (state: string) => void) => {
        if (event === 'change') listeners.push(handler);
        return { remove: jest.fn(() => { listeners.length = 0; }) };
      }),
      // Expose for triggering in tests
      __triggerChange: (state: string) => listeners.forEach((fn) => fn(state)),
      currentState: 'active',
    },
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { api } from '../../lib/api';
import * as db from './network-database';
import {
  useNetworkList,
  useNetworkUpsert,
  useSyncPending,
  useNetworkContact,
  useNetworkDelete,
  useNetworkNote,
  isNetworkError,
  NETWORK_QUERY_KEYS,
} from './use-network';
import type { NetworkContactDto } from '@tapsync/shared';
import type { UserProfile } from '../user';
import { USER_PROFILE_QUERY_KEY } from '../user';

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

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeContact(overrides: Partial<NetworkContactDto> = {}): NetworkContactDto {
  return {
    id: 'contact-1',
    publicId: 'abc123xyz9',
    status: 'saved',
    source: 'nfc',
    tapCount: 1,
    firstSavedAt: '2024-01-01T00:00:00.000Z',
    lastTappedAt: '2024-01-02T00:00:00.000Z',
    snapshot: { name: 'Alice Smith', designation: 'Engineer' },
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    publicId: 'myownpublic1',
    activeMode: 'work',
    hiddenFields: [],
    status: 'active',
    hasEmailLinked: false,
    hasGoogleLinked: false,
    hasRecoveryCode: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isNetworkError helper
// ---------------------------------------------------------------------------

describe('isNetworkError', () => {
  it('returns true for a plain TypeError (fetch failure)', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
  });

  it('returns false for an ApiError', () => {
    const { ApiError } = jest.requireMock('../../lib/api') as { ApiError: new (m: string, s: number) => Error & { statusCode: number } };
    expect(isNetworkError(new ApiError('Not Found', 404))).toBe(false);
  });

  it('returns true for unknown non-ApiError values', () => {
    expect(isNetworkError(null)).toBe(true);
    expect(isNetworkError('oops')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 1. useNetworkList
// ---------------------------------------------------------------------------

describe('useNetworkList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.getPendingCount as jest.Mock).mockReturnValue(0);
    (db.getCachedContacts as jest.Mock).mockReturnValue([]);
  });

  it('returns server contacts on success and updates the cache', async () => {
    const contacts = [makeContact()];
    (api.get as jest.Mock).mockResolvedValue({ contacts, total: 1 });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNetworkList(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.contacts).toEqual(contacts);
    expect(db.upsertCachedContacts).toHaveBeenCalledWith(contacts);
    expect(result.current.isError).toBe(false);
  });

  it('falls back to the local cache on network error', async () => {
    const cachedContacts = [makeContact({ id: 'cached-1' })];
    (api.get as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    (db.getCachedContacts as jest.Mock).mockReturnValue(cachedContacts);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNetworkList(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.contacts).toEqual(cachedContacts);
  });

  it('filters contacts by name when searchQuery is provided', async () => {
    const contacts = [
      makeContact({ id: '1', snapshot: { name: 'Alice Smith' } }),
      makeContact({ id: '2', snapshot: { name: 'Bob Jones' } }),
    ];
    (api.get as jest.Mock).mockResolvedValue({ contacts, total: 2 });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNetworkList('alice'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].id).toBe('1');
  });

  it('filters contacts by designation', async () => {
    const contacts = [
      makeContact({ id: '1', snapshot: { name: 'Alice', designation: 'Engineer' } }),
      makeContact({ id: '2', snapshot: { name: 'Bob', designation: 'Designer' } }),
    ];
    (api.get as jest.Mock).mockResolvedValue({ contacts, total: 2 });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNetworkList('design'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].id).toBe('2');
  });

  it('exposes pendingCount from the local DB', async () => {
    (api.get as jest.Mock).mockResolvedValue({ contacts: [], total: 0 });
    (db.getPendingCount as jest.Mock).mockReturnValue(3);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNetworkList(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pendingCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 2. useNetworkUpsert
// ---------------------------------------------------------------------------

describe('useNetworkUpsert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves to server and updates the local cache on success', async () => {
    const savedContact = makeContact();
    (api.post as jest.Mock).mockResolvedValue(savedContact);

    const queryClient = createTestQueryClient();
    // No own-card conflict — provide a different publicId
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ publicId: 'different123' }));

    const { result } = renderHook(() => useNetworkUpsert(), {
      wrapper: createWrapper(queryClient),
    });

    let saveResult: unknown;
    await act(async () => {
      saveResult = await result.current.saveContact('abc123xyz9', 'nfc');
    });

    expect(api.post).toHaveBeenCalledWith(
      '/network',
      expect.objectContaining({ publicId: 'abc123xyz9', source: 'nfc' }),
    );
    expect(db.upsertCachedContact).toHaveBeenCalledWith(savedContact);
    expect(saveResult).toEqual({ contact: savedContact });
  });

  it('adds to the pending queue on network error (offline path)', async () => {
    (api.post as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    (db.addPendingEntry as jest.Mock).mockReturnValue(42);

    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ publicId: 'different123' }));

    const { result } = renderHook(() => useNetworkUpsert(), {
      wrapper: createWrapper(queryClient),
    });

    let saveResult: unknown;
    await act(async () => {
      saveResult = await result.current.saveContact('abc123xyz9', 'link');
    });

    expect(db.addPendingEntry).toHaveBeenCalledWith(
      'abc123xyz9',
      'link',
      expect.any(String),
      undefined,
    );
    expect(saveResult).toEqual({ pending: true });
  });

  it('throws OWN_CARD when publicId matches the user profile', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ publicId: 'abc123xyz9' }));

    const { result } = renderHook(() => useNetworkUpsert(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      act(async () => {
        await result.current.saveContact('abc123xyz9', 'nfc');
      }),
    ).rejects.toEqual({ code: 'OWN_CARD' });

    expect(api.post).not.toHaveBeenCalled();
    expect(db.addPendingEntry).not.toHaveBeenCalled();
  });

  it('re-throws ApiError (4xx) without queuing as pending', async () => {
    const { ApiError } = jest.requireMock('../../lib/api') as { ApiError: new (m: string, s: number) => Error & { statusCode: number } };
    (api.post as jest.Mock).mockRejectedValue(new ApiError('Not Found', 404));

    const queryClient = createTestQueryClient();
    queryClient.setQueryData<UserProfile>(USER_PROFILE_QUERY_KEY, makeProfile({ publicId: 'different123' }));

    const { result } = renderHook(() => useNetworkUpsert(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      act(async () => {
        await result.current.saveContact('abc123xyz9', 'nfc');
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(db.addPendingEntry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. useSyncPending
// ---------------------------------------------------------------------------

describe('useSyncPending', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('syncs pending entries when syncNow is called', async () => {
    const pending = [
      { id: 1, publicId: 'abc123xyz9', source: 'nfc' as const, tappedAt: '2024-01-01T00:00:00.000Z', modeAtSave: null, createdAt: '2024-01-01T00:00:00.000Z' },
    ];
    (db.getPendingEntries as jest.Mock).mockReturnValue(pending);
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
          expect.objectContaining({ publicId: 'abc123xyz9', source: 'nfc' }),
        ]),
      }),
    );
    expect(db.deletePendingEntry).toHaveBeenCalledWith(1);
  });

  it('does nothing when there are no pending entries', async () => {
    (db.getPendingEntries as jest.Mock).mockReturnValue([]);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useSyncPending(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.syncNow();
    });

    expect(api.post).not.toHaveBeenCalled();
  });

  it('leaves pending entries intact when sync fails', async () => {
    const pending = [
      { id: 1, publicId: 'abc123xyz9', source: 'nfc' as const, tappedAt: '2024-01-01T00:00:00.000Z', modeAtSave: null, createdAt: '2024-01-01T00:00:00.000Z' },
    ];
    (db.getPendingEntries as jest.Mock).mockReturnValue(pending);
    (api.post as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useSyncPending(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.syncNow();
    });

    // Should NOT delete entries when sync fails
    expect(db.deletePendingEntry).not.toHaveBeenCalled();
  });

  it('syncs when app comes to foreground', async () => {
    const pending = [
      { id: 2, publicId: 'xyz987abcd', source: 'link' as const, tappedAt: '2024-01-01T00:00:00.000Z', modeAtSave: null, createdAt: '2024-01-01T00:00:00.000Z' },
    ];
    (db.getPendingEntries as jest.Mock).mockReturnValue(pending);
    (api.post as jest.Mock).mockResolvedValue({ contacts: [], total: 0 });

    const queryClient = createTestQueryClient();
    renderHook(() => useSyncPending(), {
      wrapper: createWrapper(queryClient),
    });

    // Simulate app coming to foreground
    await act(async () => {
      (AppState as unknown as { __triggerChange: (s: string) => void }).__triggerChange('active');
      // Wait for the async sync to complete
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/network/sync', expect.any(Object));
    });
  });
});

// ---------------------------------------------------------------------------
// 4. useNetworkDelete
// ---------------------------------------------------------------------------

describe('useNetworkDelete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls DELETE /network/:id and removes from cache', async () => {
    (api.delete as jest.Mock).mockResolvedValue({});

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNetworkDelete(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.deleteContact('contact-1');
    });

    expect(api.delete).toHaveBeenCalledWith('/network/contact-1');
    expect(db.deleteCachedContact).toHaveBeenCalledWith('contact-1');
  });

  it('reflects isPending correctly during deletion', async () => {
    let resolveFn!: () => void;
    (api.delete as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => { resolveFn = resolve; }),
    );

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNetworkDelete(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isPending).toBe(false);

    act(() => {
      void result.current.deleteContact('contact-1');
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(async () => { resolveFn(); });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. useNetworkNote
// ---------------------------------------------------------------------------

describe('useNetworkNote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('patches the note on the server and updates the local cache', async () => {
    const updatedContact = makeContact({ note: 'Met at conference' });
    (api.patch as jest.Mock).mockResolvedValue(updatedContact);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNetworkNote(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.updateNote('contact-1', 'Met at conference');
    });

    expect(api.patch).toHaveBeenCalledWith('/network/contact-1', { note: 'Met at conference' });
    expect(db.updateCachedContactNote).toHaveBeenCalledWith('contact-1', 'Met at conference');
  });

  it('sets isPending to true while the request is in flight', async () => {
    let resolveFn!: () => void;
    (api.patch as jest.Mock).mockReturnValue(
      new Promise<NetworkContactDto>((resolve) => {
        resolveFn = () => resolve(makeContact());
      }),
    );

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useNetworkNote(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      void result.current.updateNote('contact-1', 'A note');
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(async () => { resolveFn(); });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});
