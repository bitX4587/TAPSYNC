/**
 * Analytics service
 *
 * Fetches analytics data from the API.
 *
 * Requirements: 8.4 — total views, link clicks and contact saves for selectable ranges.
 * Requirements: 8.5 — per-link click counts and recent taps.
 */

import { api } from '../../lib/api';

/** Range parameter accepted by GET /analytics/summary and GET /analytics/links */
export type AnalyticsRange = '7d' | '30d' | 'all';

/** Shape of GET /analytics/summary response */
export interface AnalyticsSummary {
  totalViews: number;
  totalLinkClicks: number;
  totalContactSaves: number;
  dateRange: {
    start: string;
    end: string;
  };
}

/** Shape of a single item from GET /analytics/links */
export interface LinkAnalytics {
  linkId: string;
  linkTitle: string;
  clickCount: number;
  mode: 'work' | 'casual';
}

/** Shape of a single item from GET /analytics/recent */
export interface RecentEvent {
  type: 'view' | 'link_click' | 'contact_save';
  mode: 'work' | 'casual';
  occurredAt: string;
  country?: string;
  deviceType?: 'ios' | 'android' | 'desktop' | 'other';
  linkTitle?: string;
}

/**
 * Fetch aggregate analytics counts for the given date range.
 *
 * Maps to GET /analytics/summary?range={range}.
 */
export async function fetchAnalyticsSummary(range: AnalyticsRange): Promise<AnalyticsSummary> {
  return api.get<AnalyticsSummary>(`/analytics/summary?range=${range}`);
}

/**
 * Fetch per-link click counts for the given date range.
 *
 * Maps to GET /analytics/links?range={range}.
 *
 * Requirements: 8.5
 */
export async function fetchLinkAnalytics(range: AnalyticsRange): Promise<LinkAnalytics[]> {
  return api.get<LinkAnalytics[]>(`/analytics/links?range=${range}`);
}

/**
 * Fetch recent analytics events.
 *
 * Maps to GET /analytics/recent?limit={limit}.
 *
 * Requirements: 8.5
 */
export async function fetchRecentEvents(limit: number = 20): Promise<RecentEvent[]> {
  return api.get<RecentEvent[]>(`/analytics/recent?limit=${limit}`);
}
