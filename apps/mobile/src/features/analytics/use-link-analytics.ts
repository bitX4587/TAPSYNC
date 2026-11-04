/**
 * useLinkAnalytics hook
 *
 * Fetches per-link click counts for a selectable date range using React Query.
 *
 * Requirements:
 *   8.5 — Analytics screen SHALL show per-link click counts.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchLinkAnalytics, type AnalyticsRange, type LinkAnalytics } from './analytics.service';

export const LINK_ANALYTICS_QUERY_KEY = (range: AnalyticsRange) =>
  ['analytics', 'links', range] as const;

/**
 * React Query hook to read per-link click counts for the given range.
 *
 * @example
 *   const { data, isLoading, isError } = useLinkAnalytics('7d');
 */
export function useLinkAnalytics(range: AnalyticsRange) {
  return useQuery<LinkAnalytics[]>({
    queryKey: LINK_ANALYTICS_QUERY_KEY(range),
    queryFn: () => fetchLinkAnalytics(range),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
