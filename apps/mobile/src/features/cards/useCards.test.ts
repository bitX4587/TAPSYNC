/**
 * Unit tests for useBindCard hook (useCards.ts)
 *
 * Tests cover Requirements 7.5, 7.8, 7.9:
 *  - Successful bind → returns { alreadyBound: false, card }
 *  - ALREADY_BOUND (409) when card is in the user's own list → returns { alreadyBound: true }
 *  - ALREADY_BOUND (409) when card is NOT in the user's list → throws with a clear message
 *  - Other API errors → rethrown unchanged
 *
 * Strategy:
 *  - Mock `./cards.service` to control `bindCard` and avoid real HTTP calls.
 *  - Mock `@tanstack/react-query` so `useQueryClient` returns a controllable fake
 *    client whose `getQueryData` and `invalidateQueries` are jest fns.
 *  - Mock `../../lib/api` so `ApiError` is available as a real class that
 *    instanceof checks inside the hook work against.
 *
 * Requirements: 7.5, 7.8, 7.9
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

// ─── Mock cards.service ───────────────────────────────────────────────────────
jest.mock('./cards.service', () => ({
  bindCard: jest.fn(),
  getProgramPayload: jest.fn(),
  listCards: jest.fn(),
  unassignCard: jest.fn(),
  labelCard: jest.fn(),
}));

// ─── Mock ../../lib/api (for ApiError) ────────────────────────────────────────
// The hook does `err instanceof ApiError`, so the class must be the same
// reference that gets imported in the test.  We create it inside the factory
// and re-export it through __esModule so the named import works.
jest.mock('../../lib/api', () => {
  class MockApiError extends Error {
    statusCode: number;
    code?: string;
    details?: unknown;

    constructor(message: string, statusCode: number, code?: string, details?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
    }
  }

  return {
    __esModule: true,
    ApiError: MockApiError,
    // Other api exports the service might pull in at module-level
    api: {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    },
    apiRequest: jest.fn(),
    tokenStorage: {
      getAccessToken: jest.fn(),
      setAccessToken: jest.fn(),
      getRefreshToken: jest.fn(),
      setRefreshToken: jest.fn(),
      setTokens: jest.fn(),
      clearTokens: jest.fn(),
    },
    isAuthenticated: jest.fn(),
    signOut: jest.fn(),
  };
});

// ─── Mock @tanstack/react-query ───────────────────────────────────────────────
// We only need useMutation and useQueryClient.  useMutation is kept real
// (from the actual package) via jest.requireActual so the hook's retry/state
// logic works.  useQueryClient is replaced with a factory that returns our
// mock client instance.

const mockGetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockSetQueryData = jest.fn();

const mockQueryClient = {
  getQueryData: mockGetQueryData,
  invalidateQueries: mockInvalidateQueries,
  setQueryData: mockSetQueryData,
};

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: jest.fn(() => mockQueryClient),
  };
});

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { bindCard } from './cards.service';
import { ApiError } from '../../lib/api';
import { useBindCard, CARDS_QUERY_KEY } from './useCards';
import type { NfcCard } from './cards.service';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockBindCard = bindCard as jest.Mock;

/** A sample NfcCard returned by the API. */
function makeCard(uid: string): NfcCard {
  return {
    id: 'card-id-001',
    uid,
    status: 'active',
    label: 'My card',
    lastProgrammedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Wrap renderHook in a QueryClientProvider so React Query hooks work.
 * We use a fresh QueryClient per test to avoid state leaking.
 */
function renderUseBindCard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return renderHook(() => useBindCard(), { wrapper });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useBindCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue(undefined);
    mockInvalidateQueries.mockResolvedValue(undefined);
  });

  // ── Successful bind ────────────────────────────────────────────────────────

  describe('successful bind', () => {
    it('returns { alreadyBound: false, card } when the API call succeeds', async () => {
      const uid = '04AABBCCDD1234';
      const card = makeCard(uid);
      mockBindCard.mockResolvedValue({ card });

      const { result } = renderUseBindCard();

      await act(async () => {
        await result.current.mutateAsync(uid);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ alreadyBound: false, card });
    });

    it('invalidates the cards query after a successful bind', async () => {
      const uid = '04AABBCCDD1234';
      const card = makeCard(uid);
      mockBindCard.mockResolvedValue({ card });

      const { result } = renderUseBindCard();

      await act(async () => {
        await result.current.mutateAsync(uid);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: CARDS_QUERY_KEY });
    });

    it('calls bindCard with the correct uid', async () => {
      const uid = '04AABBCCDD1234';
      const card = makeCard(uid);
      mockBindCard.mockResolvedValue({ card });

      const { result } = renderUseBindCard();

      await act(async () => {
        await result.current.mutateAsync(uid);
      });

      expect(mockBindCard).toHaveBeenCalledWith(uid);
    });
  });

  // ── ALREADY_BOUND — own card ───────────────────────────────────────────────

  describe('ALREADY_BOUND: card belongs to current user', () => {
    it('returns { alreadyBound: true, card } when the UID is in the cached card list', async () => {
      const uid = '04AABBCCDD1234';
      const existingCard = makeCard(uid);

      // Simulate 409 from the API
      mockBindCard.mockRejectedValue(new ApiError('Conflict', 409, 'ALREADY_BOUND'));

      // Cache contains a card with the same UID (belonging to this user)
      mockGetQueryData.mockReturnValue([existingCard]);

      const { result } = renderUseBindCard();

      await act(async () => {
        await result.current.mutateAsync(uid);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ alreadyBound: true, card: existingCard });
    });

    it('is case-insensitive when comparing UIDs', async () => {
      const uid = '04aabbccdd1234'; // lowercase
      const existingCard = makeCard('04AABBCCDD1234'); // stored uppercase

      mockBindCard.mockRejectedValue(new ApiError('Conflict', 409, 'ALREADY_BOUND'));
      mockGetQueryData.mockReturnValue([existingCard]);

      const { result } = renderUseBindCard();

      await act(async () => {
        await result.current.mutateAsync(uid);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ alreadyBound: true, card: existingCard });
    });

    it('handles an empty cached list gracefully (falls through to throw)', async () => {
      const uid = '04AABBCCDD1234';

      mockBindCard.mockRejectedValue(new ApiError('Conflict', 409, 'ALREADY_BOUND'));
      // Empty list — the card cannot belong to this user
      mockGetQueryData.mockReturnValue([]);

      const { result } = renderUseBindCard();

      await act(async () => {
        try {
          await result.current.mutateAsync(uid);
        } catch {
          // expected
        }
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toMatchObject({
        message: 'This card is already registered to another account.',
      });
    });
  });

  // ── ALREADY_BOUND — other user's card ─────────────────────────────────────

  describe('ALREADY_BOUND: card belongs to a different user', () => {
    it('throws "already registered to another account" when UID is not in the cached list', async () => {
      const uid = '04AABBCCDD1234';

      mockBindCard.mockRejectedValue(new ApiError('Conflict', 409, 'ALREADY_BOUND'));

      // Cache has a different card — the conflicting UID is NOT present
      mockGetQueryData.mockReturnValue([makeCard('04DIFFERENT00000')]);

      const { result } = renderUseBindCard();

      await act(async () => {
        try {
          await result.current.mutateAsync(uid);
        } catch {
          // expected
        }
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toMatchObject({
        message: 'This card is already registered to another account.',
      });
    });

    it('throws when no cached card list exists at all (undefined)', async () => {
      const uid = '04AABBCCDD1234';

      mockBindCard.mockRejectedValue(new ApiError('Conflict', 409, 'ALREADY_BOUND'));
      // No cached data
      mockGetQueryData.mockReturnValue(undefined);

      const { result } = renderUseBindCard();

      await act(async () => {
        try {
          await result.current.mutateAsync(uid);
        } catch {
          // expected
        }
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toMatchObject({
        message: 'This card is already registered to another account.',
      });
    });
  });

  // ── Other API errors ───────────────────────────────────────────────────────

  describe('other API errors', () => {
    it('rethrows a non-409 ApiError (e.g. 500)', async () => {
      const uid = '04AABBCCDD1234';
      const serverError = new ApiError('Internal Server Error', 500, 'SERVER_ERROR');

      mockBindCard.mockRejectedValue(serverError);

      const { result } = renderUseBindCard();

      await act(async () => {
        try {
          await result.current.mutateAsync(uid);
        } catch {
          // expected
        }
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      // The exact same error instance is rethrown
      expect(result.current.error).toBe(serverError);
    });

    it('rethrows a non-409 ApiError (e.g. 401)', async () => {
      const uid = '04AABBCCDD1234';
      const authError = new ApiError('Unauthorized', 401, 'UNAUTHORIZED');

      mockBindCard.mockRejectedValue(authError);

      const { result } = renderUseBindCard();

      await act(async () => {
        try {
          await result.current.mutateAsync(uid);
        } catch {
          // expected
        }
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(authError);
    });

    it('rethrows a plain Error (non-ApiError)', async () => {
      const uid = '04AABBCCDD1234';
      const networkError = new Error('Network request failed');

      mockBindCard.mockRejectedValue(networkError);

      const { result } = renderUseBindCard();

      await act(async () => {
        try {
          await result.current.mutateAsync(uid);
        } catch {
          // expected
        }
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(networkError);
    });
  });
});
