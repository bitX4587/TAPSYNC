/**
 * Tests for useAnalyticsSummary hook
 *
 * Covers:
 * - Successful fetch returns the summary data
 * - Loading state is true before the fetch completes
 * - Error state is set when the API call fails
 * - Different ranges produce different query keys (no cross-contamination)
 *
 * Requirements: 8.4
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAnalyticsSummary, ANALYTICS_SUMMARY_QUERY_KEY } from './use-analytics-summary';
import type { AnalyticsSummary } from './analytics.service';
import * as analyticsService from './analytics.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('./analytics.service', () => ({
  fetchAnalyticsSummary: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<AnalyticsSummary> = {}): AnalyticsSummary {
  return {
    totalViews: 42,
    totalLinkClicks: 17,
    totalContactSaves: 5,
    dateRange: {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-07T23:59:59.999Z',
    },
    ...overrides,
  };
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAnalyticsSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts in the loading state before the fetch resolves', async () => {
    // Arrange: never-resolving promise so we can observe the loading state
    (analyticsService.fetchAnalyticsSummary as jest.Mock).mockReturnValue(
      new Promise(() => {}), // never resolves
    );

    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAnalyticsSummary('7d'), {
      wrapper: createWrapper(queryClient),
    });

    // The hook is in loading state immediately after mount
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns the summary data on successful fetch', async () => {
    // Arrange
    const summary = makeSummary({ totalViews: 100, totalLinkClicks: 25, totalContactSaves: 8 });
    (analyticsService.fetchAnalyticsSummary as jest.Mock).mockResolvedValue(summary);

    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAnalyticsSummary('7d'), {
      wrapper: createWrapper(queryClient),
    });

    // Act: wait for the query to succeed
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Assert
    expect(result.current.data).toEqual(summary);
    expect(result.current.isError).toBe(false);
    expect(analyticsService.fetchAnalyticsSummary).toHaveBeenCalledWith('7d');
  });

  it('sets isError when the API call throws', async () => {
    // Arrange
    (analyticsService.fetchAnalyticsSummary as jest.Mock).mockRejectedValue(
      new Error('Network error'),
    );

    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAnalyticsSummary('30d'), {
      wrapper: createWrapper(queryClient),
    });

    // Act
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Assert
    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('calls the API with the correct range parameter', async () => {
    (analyticsService.fetchAnalyticsSummary as jest.Mock).mockResolvedValue(makeSummary());

    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAnalyticsSummary('all'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(analyticsService.fetchAnalyticsSummary).toHaveBeenCalledWith('all');
  });

  it('uses separate cache entries for different ranges', () => {
    // Query keys must differ so switching ranges does not return stale data
    expect(ANALYTICS_SUMMARY_QUERY_KEY('7d')).not.toEqual(ANALYTICS_SUMMARY_QUERY_KEY('30d'));
    expect(ANALYTICS_SUMMARY_QUERY_KEY('30d')).not.toEqual(ANALYTICS_SUMMARY_QUERY_KEY('all'));
    expect(ANALYTICS_SUMMARY_QUERY_KEY('7d')).not.toEqual(ANALYTICS_SUMMARY_QUERY_KEY('all'));
  });

  it('serves pre-seeded cache data without fetching', () => {
    // If the cache already has fresh data, the hook should not trigger a fetch
    const summary = makeSummary();
    (analyticsService.fetchAnalyticsSummary as jest.Mock).mockResolvedValue(summary);

    const queryClient = createTestQueryClient();
    // Pre-seed the cache
    queryClient.setQueryData(ANALYTICS_SUMMARY_QUERY_KEY('7d'), summary);

    const { result } = renderHook(() => useAnalyticsSummary('7d'), {
      wrapper: createWrapper(queryClient),
    });

    // Data is immediately available from cache
    expect(result.current.data).toEqual(summary);
    expect(result.current.isLoading).toBe(false);
    // fetchAnalyticsSummary was not called because the cache is fresh
    expect(analyticsService.fetchAnalyticsSummary).not.toHaveBeenCalled();
  });
});
