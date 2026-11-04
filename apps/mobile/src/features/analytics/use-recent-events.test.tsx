/**
 * Tests for useRecentEvents hook
 *
 * Covers:
 * - Loading state before fetch completes
 * - Returns event list on success
 * - Error state when API call fails
 * - Calls the API with the correct limit parameter
 *
 * Requirements: 8.5
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRecentEvents, RECENT_EVENTS_QUERY_KEY } from './use-recent-events';
import type { RecentEvent } from './analytics.service';
import * as analyticsService from './analytics.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('./analytics.service', () => ({
  fetchRecentEvents: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvents(): RecentEvent[] {
  return [
    {
      type: 'view',
      mode: 'work',
      occurredAt: '2024-01-15T10:00:00.000Z',
      country: 'PH',
      deviceType: 'ios',
    },
    {
      type: 'link_click',
      mode: 'casual',
      occurredAt: '2024-01-15T09:30:00.000Z',
      linkTitle: 'LinkedIn',
      deviceType: 'android',
    },
  ];
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function createWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRecentEvents', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts in the loading state before the fetch resolves', () => {
    (analyticsService.fetchRecentEvents as jest.Mock).mockReturnValue(new Promise(() => {}));
    const qc = createTestQueryClient();
    const { result } = renderHook(() => useRecentEvents(), { wrapper: createWrapper(qc) });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns event list on successful fetch', async () => {
    const events = makeEvents();
    (analyticsService.fetchRecentEvents as jest.Mock).mockResolvedValue(events);
    const qc = createTestQueryClient();
    const { result } = renderHook(() => useRecentEvents(20), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(events);
    expect(result.current.isError).toBe(false);
    expect(analyticsService.fetchRecentEvents).toHaveBeenCalledWith(20);
  });

  it('sets isError when the API call throws', async () => {
    (analyticsService.fetchRecentEvents as jest.Mock).mockRejectedValue(new Error('Network error'));
    const qc = createTestQueryClient();
    const { result } = renderHook(() => useRecentEvents(10), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('defaults to limit 20 when no argument is given', async () => {
    (analyticsService.fetchRecentEvents as jest.Mock).mockResolvedValue([]);
    const qc = createTestQueryClient();
    const { result } = renderHook(() => useRecentEvents(), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(analyticsService.fetchRecentEvents).toHaveBeenCalledWith(20);
  });

  it('uses separate cache entries for different limits', () => {
    expect(RECENT_EVENTS_QUERY_KEY(10)).not.toEqual(RECENT_EVENTS_QUERY_KEY(20));
  });
});
