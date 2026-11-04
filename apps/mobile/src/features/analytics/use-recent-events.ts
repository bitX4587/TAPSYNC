/**
 * useRecentEvents hook
 *
 * Fetches the list of recent analytics events using React Query.
 *
 * Requirements:
 *   8.5 — Analytics screen SHALL show a list of recent tap events with time
 *          and mode. No visitor identity is ever exposed.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchRecentEvents, type RecentEvent } from './analytics.service';

export const RECENT_EVENTS_QUERY_KEY = (limit: number) =>
  ['analytics', 'recent', limit] as const;

/**
 * React Query hook to read recent analytics events.
 *
 * @example
 *   const { data, isLoading, isError } = useRecentEvents(20);
 */
export function useRecentEvents(limit: number = 20) {
  return useQuery<RecentEvent[]>({
    queryKey: RECENT_EVENTS_QUERY_KEY(limit),
    queryFn: () => fetchRecentEvents(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
