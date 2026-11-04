/**
 * Analytics screen
 *
 * Displays tap and engagement stats for the authenticated Owner:
 *  - Range selector (7 days / 30 days / All time)
 *  - Totals card: total views, link clicks and contact saves
 *  - Per-link click list for the selected range
 *  - Recent events list: time, mode, coarse metadata (country, device type)
 *    — NO visitor identity is ever shown (Requirement 8.9)
 *
 * Requirements:
 *   8.4 — WHEN an Owner opens the Analytics screen the app SHALL show
 *          total views, link clicks and contact saves for selectable ranges.
 *   8.5 — The Analytics screen SHALL show per-link click counts and a list
 *          of recent tap events with time and mode.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useProtectedRoute } from '../../features/auth';
import {
  useAnalyticsSummary,
  useLinkAnalytics,
  useRecentEvents,
  type AnalyticsRange,
  type LinkAnalytics,
  type RecentEvent,
  ANALYTICS_SUMMARY_QUERY_KEY,
  LINK_ANALYTICS_QUERY_KEY,
  RECENT_EVENTS_QUERY_KEY,
} from '../../features/analytics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RANGE_OPTIONS: { label: string; value: AnalyticsRange }[] = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'All time', value: 'all' },
];

const RECENT_LIMIT = 20;

// ---------------------------------------------------------------------------
// Range selector
// ---------------------------------------------------------------------------

interface RangeSelectorProps {
  selected: AnalyticsRange;
  onSelect: (range: AnalyticsRange) => void;
}

function RangeSelector({ selected, onSelect }: RangeSelectorProps) {
  return (
    <View
      style={rangeStyles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel="Select date range"
    >
      {RANGE_OPTIONS.map((opt, index) => {
        const isActive = selected === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              rangeStyles.segment,
              isActive && rangeStyles.segmentActive,
              index === 0 && rangeStyles.segmentFirst,
              index === RANGE_OPTIONS.length - 1 && rangeStyles.segmentLast,
            ]}
            onPress={() => onSelect(opt.value)}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: isActive }}
            activeOpacity={0.75}
          >
            <Text
              style={[
                rangeStyles.segmentText,
                isActive && rangeStyles.segmentTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const rangeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
  },
  segmentFirst: { marginRight: 2 },
  segmentLast: { marginLeft: 2 },
  segmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  segmentTextActive: {
    color: '#111827',
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Skeleton block (reusable loading placeholder)
// ---------------------------------------------------------------------------

function Skeleton({ width, height, style }: { width: number | string; height: number; style?: object }) {
  return (
    <View
      style={[
        { width: width as number, height, borderRadius: 6, backgroundColor: '#E5E7EB' },
        style,
      ]}
      accessibilityElementsHidden
    />
  );
}

// ---------------------------------------------------------------------------
// Totals card
// ---------------------------------------------------------------------------

interface TotalsCardProps {
  isLoading: boolean;
  isError: boolean;
  totalViews?: number;
  totalLinkClicks?: number;
  totalContactSaves?: number;
}

function TotalsCard({ isLoading, isError, totalViews, totalLinkClicks, totalContactSaves }: TotalsCardProps) {
  return (
    <View style={totalsStyles.card} accessibilityLabel="Analytics totals">
      <Text style={totalsStyles.cardTitle}>Overview</Text>
      <View style={totalsStyles.divider} />
      {isError ? (
        <View style={totalsStyles.errorRow}>
          <Text style={totalsStyles.errorText}>Could not load totals. Pull down to retry.</Text>
        </View>
      ) : (
        <View style={totalsStyles.metricsRow}>
          <MetricBox
            emoji="👁️"
            label="Views"
            value={totalViews}
            isLoading={isLoading}
          />
          <View style={totalsStyles.metricDivider} />
          <MetricBox
            emoji="🔗"
            label="Link clicks"
            value={totalLinkClicks}
            isLoading={isLoading}
          />
          <View style={totalsStyles.metricDivider} />
          <MetricBox
            emoji="💾"
            label="Contact saves"
            value={totalContactSaves}
            isLoading={isLoading}
          />
        </View>
      )}
    </View>
  );
}

interface MetricBoxProps {
  emoji: string;
  label: string;
  value: number | undefined;
  isLoading: boolean;
}

function MetricBox({ emoji, label, value, isLoading }: MetricBoxProps) {
  return (
    <View
      style={totalsStyles.metricBox}
      accessible
      accessibilityLabel={`${label}: ${value ?? 'loading'}`}
    >
      <Text style={totalsStyles.metricEmoji}>{emoji}</Text>
      {isLoading || value === undefined ? (
        <Skeleton width={40} height={28} style={{ marginBottom: 4 }} />
      ) : (
        <Text style={totalsStyles.metricValue}>{value.toLocaleString()}</Text>
      )}
      <Text style={totalsStyles.metricLabel}>{label}</Text>
    </View>
  );
}

const totalsStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  metricsRow: {
    flexDirection: 'row',
    paddingVertical: 20,
    paddingHorizontal: 8,
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricEmoji: {
    fontSize: 22,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  metricLabel: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 4,
  },
  errorRow: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Per-link click list
// ---------------------------------------------------------------------------

interface LinkListCardProps {
  isLoading: boolean;
  isError: boolean;
  links?: LinkAnalytics[];
}

function LinkListCard({ isLoading, isError, links }: LinkListCardProps) {
  const hasLinks = (links?.length ?? 0) > 0;

  return (
    <View style={linkStyles.card}>
      <Text style={linkStyles.cardTitle}>Link clicks</Text>
      <View style={linkStyles.divider} />

      {isError && (
        <View style={linkStyles.emptyState}>
          <Text style={linkStyles.emptyText}>Could not load link stats. Pull down to retry.</Text>
        </View>
      )}

      {isLoading && !isError && (
        <View style={linkStyles.skeletonContainer}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={linkStyles.skeletonRow}>
              <Skeleton width="55%" height={14} />
              <Skeleton width={36} height={14} />
            </View>
          ))}
        </View>
      )}

      {!isLoading && !isError && !hasLinks && (
        <View style={linkStyles.emptyState} accessibilityLabel="No link clicks yet">
          <Text style={linkStyles.emptyEmoji}>🔗</Text>
          <Text style={linkStyles.emptyTitle}>No link clicks yet</Text>
          <Text style={linkStyles.emptyText}>
            Add links to your profile and share your card to track clicks here.
          </Text>
        </View>
      )}

      {!isLoading && !isError && hasLinks && (
        <View>
          {links!.map((link, index) => (
            <View
              key={link.linkId}
              style={[
                linkStyles.row,
                index < links!.length - 1 && linkStyles.rowBorder,
              ]}
              accessible
              accessibilityLabel={`${link.linkTitle}: ${link.clickCount} click${link.clickCount !== 1 ? 's' : ''}`}
            >
              <View style={linkStyles.rowLeft}>
                <Text style={linkStyles.modeBadge}>
                  {link.mode === 'work' ? '💼' : '🌴'}
                </Text>
                <Text style={linkStyles.linkTitle} numberOfLines={1}>
                  {link.linkTitle}
                </Text>
              </View>
              <View style={linkStyles.clickBadge}>
                <Text style={linkStyles.clickCount}>{link.clickCount.toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const linkStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 12,
  },
  modeBadge: {
    fontSize: 16,
  },
  linkTitle: {
    fontSize: 15,
    color: '#111827',
    flex: 1,
  },
  clickBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 36,
    alignItems: 'center',
  },
  clickCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066CC',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
});

// ---------------------------------------------------------------------------
// Recent events list
// ---------------------------------------------------------------------------

/** Human-readable labels for event types */
const EVENT_TYPE_LABEL: Record<RecentEvent['type'], string> = {
  view: 'Profile view',
  link_click: 'Link click',
  contact_save: 'Contact saved',
};

/** Emoji icon per event type */
const EVENT_TYPE_ICON: Record<RecentEvent['type'], string> = {
  view: '👁️',
  link_click: '🔗',
  contact_save: '💾',
};

/** Device type labels */
const DEVICE_LABEL: Record<NonNullable<RecentEvent['deviceType']>, string> = {
  ios: 'iOS',
  android: 'Android',
  desktop: 'Desktop',
  other: 'Other',
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  // Fall back to locale date
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface RecentEventsCardProps {
  isLoading: boolean;
  isError: boolean;
  events?: RecentEvent[];
}

function RecentEventsCard({ isLoading, isError, events }: RecentEventsCardProps) {
  const hasEvents = (events?.length ?? 0) > 0;

  return (
    <View style={recentStyles.card}>
      <Text style={recentStyles.cardTitle}>Recent activity</Text>
      <View style={recentStyles.divider} />

      {isError && (
        <View style={recentStyles.emptyState}>
          <Text style={recentStyles.emptyText}>
            Could not load recent activity. Pull down to retry.
          </Text>
        </View>
      )}

      {isLoading && !isError && (
        <View style={recentStyles.skeletonContainer}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={recentStyles.skeletonRow}>
              <Skeleton width={36} height={36} style={{ borderRadius: 18 }} />
              <View style={recentStyles.skeletonText}>
                <Skeleton width="60%" height={13} style={{ marginBottom: 6 }} />
                <Skeleton width="40%" height={11} />
              </View>
              <Skeleton width={48} height={11} />
            </View>
          ))}
        </View>
      )}

      {!isLoading && !isError && !hasEvents && (
        <View style={recentStyles.emptyState} accessibilityLabel="No activity yet">
          <Text style={recentStyles.emptyEmoji}>📊</Text>
          <Text style={recentStyles.emptyTitle}>No taps yet</Text>
          <Text style={recentStyles.emptyText}>
            Share your card to get started — activity will appear here.
          </Text>
        </View>
      )}

      {!isLoading && !isError && hasEvents && (
        <View>
          {events!.map((event, index) => {
            const metaParts: string[] = [];
            if (event.deviceType) metaParts.push(DEVICE_LABEL[event.deviceType]);
            if (event.country) metaParts.push(event.country);
            if (event.type === 'link_click' && event.linkTitle) {
              metaParts.unshift(event.linkTitle);
            }

            return (
              <View
                key={index}
                style={[
                  recentStyles.row,
                  index < events!.length - 1 && recentStyles.rowBorder,
                ]}
                accessible
                accessibilityLabel={[
                  EVENT_TYPE_LABEL[event.type],
                  event.mode === 'work' ? 'Work mode' : 'Casual mode',
                  formatRelativeTime(event.occurredAt),
                  ...metaParts,
                ].join(', ')}
              >
                {/* Icon */}
                <View style={recentStyles.iconWrapper}>
                  <Text style={recentStyles.icon}>{EVENT_TYPE_ICON[event.type]}</Text>
                </View>

                {/* Description */}
                <View style={recentStyles.details}>
                  <Text style={recentStyles.eventType}>
                    {EVENT_TYPE_LABEL[event.type]}
                  </Text>
                  <Text style={recentStyles.meta} numberOfLines={1}>
                    {event.mode === 'work' ? '💼 Work' : '🌴 Casual'}
                    {metaParts.length > 0 ? `  ·  ${metaParts.join(' · ')}` : ''}
                  </Text>
                </View>

                {/* Timestamp */}
                <Text style={recentStyles.time}>{formatRelativeTime(event.occurredAt)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const recentStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    minHeight: 60,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  icon: {
    fontSize: 16,
  },
  details: {
    flex: 1,
    gap: 2,
  },
  eventType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  meta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  time: {
    fontSize: 12,
    color: '#9CA3AF',
    flexShrink: 0,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  skeletonText: {
    flex: 1,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AnalyticsScreen() {
  useProtectedRoute();

  const [selectedRange, setSelectedRange] = useState<AnalyticsRange>('7d');
  const queryClient = useQueryClient();

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useAnalyticsSummary(selectedRange);

  const {
    data: links,
    isLoading: linksLoading,
    isError: linksError,
  } = useLinkAnalytics(selectedRange);

  const {
    data: events,
    isLoading: eventsLoading,
    isError: eventsError,
  } = useRecentEvents(RECENT_LIMIT);

  // ── Pull-to-refresh ──────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ANALYTICS_SUMMARY_QUERY_KEY(selectedRange) }),
      queryClient.invalidateQueries({ queryKey: LINK_ANALYTICS_QUERY_KEY(selectedRange) }),
      queryClient.invalidateQueries({ queryKey: RECENT_EVENTS_QUERY_KEY(RECENT_LIMIT) }),
    ]);
    setRefreshing(false);
  }, [queryClient, selectedRange]);

  // ── Range change: also invalidate link analytics immediately ─────────────
  const handleRangeChange = useCallback(
    (range: AnalyticsRange) => {
      setSelectedRange(range);
    },
    [],
  );

  const isFirstLoad = (summaryLoading && !summary) || (linksLoading && !links);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#0066CC"
            accessibilityLabel="Pull to refresh analytics"
          />
        }
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle} accessibilityRole="header">
            Analytics
          </Text>
          {isFirstLoad && (
            <ActivityIndicator size="small" color="#9CA3AF" />
          )}
        </View>

        {/* ── Range selector ───────────────────────────────────────────── */}
        <RangeSelector selected={selectedRange} onSelect={handleRangeChange} />

        {/* ── Totals card ──────────────────────────────────────────────── */}
        <TotalsCard
          isLoading={summaryLoading}
          isError={summaryError}
          totalViews={summary?.totalViews}
          totalLinkClicks={summary?.totalLinkClicks}
          totalContactSaves={summary?.totalContactSaves}
        />

        {/* ── Per-link click list ──────────────────────────────────────── */}
        <LinkListCard
          isLoading={linksLoading}
          isError={linksError}
          links={links}
        />

        {/* ── Recent events ────────────────────────────────────────────── */}
        <RecentEventsCard
          isLoading={eventsLoading}
          isError={eventsError}
          events={events}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
});
