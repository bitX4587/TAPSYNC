/**
 * useAnalyticsSummary hook
 *
 * Fetches the analytics summary (total views, link clicks, contact saves) for
 * a selectable date range using React Query.
 *
 * Requirements:
 *   8.4 — WHEN an Owner opens the Analytics screen the app SHALL show total
 *          views, link clicks and contact saves for selectable ranges.
 *   8.5 — Quick stats (view/click totals) surface on the dashboard.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAnalyticsSummary, type AnalyticsRange, type AnalyticsSummary } from './analytics.service';

export const ANALYTICS_SUMMARY_QUERY_KEY = (range: AnalyticsRange) =>
  ['analytics', 'summary', range] as const;

/**
 * React Query hook to read the analytics summary for the given range.
 *
 * Data is considered fresh for 5 minutes to avoid hammering the API on
 * every home screen render.
 *
 * @example
 *   const { data, isLoading, isError } = useAnalyticsSummary('7d');
 */
export function useAnalyticsSummary(range: AnalyticsRange) {
  return useQuery<AnalyticsSummary>({
    queryKey: ANALYTICS_SUMMARY_QUERY_KEY(range),
    queryFn: () => fetchAnalyticsSummary(range),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
