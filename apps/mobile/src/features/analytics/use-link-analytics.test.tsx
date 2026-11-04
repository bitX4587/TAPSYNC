/**
 * Tests for useLinkAnalytics hook
 *
 * Covers:
 * - Loading state before fetch completes
 * - Returns per-link data on success
 * - Error state when API call fails
 * - Different ranges produce separate cache entries
 *
 * Requirements: 8.5
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLinkAnalytics, LINK_ANALYTICS_QUERY_KEY } from './use-link-analytics';
import type { LinkAnalytics } from './analytics.service';
import * as analyticsService from './analytics.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('./analytics.service', () => ({
  fetchLinkAnalytics: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLinks(): LinkAnalytics[] {
  return [
    { linkId: 'link-1', linkTitle: 'LinkedIn', clickCount: 12, mode: 'work' },
    { linkId: 'link-2', linkTitle: 'GitHub', clickCount: 5, mode: 'casual' },
  ];
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLinkAnalytics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts in the loading state before the fetch resolves', () => {
    (analyticsService.fetchLinkAnalytics as jest.Mock).mockReturnValue(new Promise(() => {}));
    const qc = createTestQueryClient();
    const { result } = renderHook(() => useLinkAnalytics('7d'), { wrapper: createWrapper(qc) });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns per-link data on successful fetch', async () => {
    const links = makeLinks();
    (analyticsService.fetchLinkAnalytics as jest.Mock).mockResolvedValue(links);
    const qc = createTestQueryClient();
    const { result } = renderHook(() => useLinkAnalytics('30d'), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(links);
    expect(result.current.isError).toBe(false);
    expect(analyticsService.fetchLinkAnalytics).toHaveBeenCalledWith('30d');
  });

  it('sets isError when the API call throws', async () => {
    (analyticsService.fetchLinkAnalytics as jest.Mock).mockRejectedValue(new Error('API error'));
    const qc = createTestQueryClient();
    const { result } = renderHook(() => useLinkAnalytics('all'), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('uses separate cache entries for different ranges', () => {
    expect(LINK_ANALYTICS_QUERY_KEY('7d')).not.toEqual(LINK_ANALYTICS_QUERY_KEY('30d'));
    expect(LINK_ANALYTICS_QUERY_KEY('30d')).not.toEqual(LINK_ANALYTICS_QUERY_KEY('all'));
  });
});
