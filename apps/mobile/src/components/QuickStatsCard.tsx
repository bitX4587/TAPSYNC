/**
 * QuickStatsCard component
 *
 * Displays a quick summary of analytics metrics on the dashboard: total profile
 * views and total link clicks for a selectable date range (7d / 30d / All time).
 *
 * Requirements:
 *   8.4 — analytics totals (views, link clicks, contact saves) for selectable
 *          ranges (7 days, 30 days, all time).
 *   8.5 — per-link click counts and recent events (full detail is on the
 *          Analytics screen Task 21; this card shows the quick summary).
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAnalyticsSummary, type AnalyticsRange } from '../features/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RangeOption {
  label: string;
  value: AnalyticsRange;
}

const RANGE_OPTIONS: RangeOption[] = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'All time', value: 'all' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * A single metric box (label + number).
 */
function MetricBox({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
}) {
  return (
    <View style={metricStyles.box} accessible accessibilityLabel={`${label}: ${value ?? 'loading'}`}>
      {isLoading || value === undefined ? (
        <View style={metricStyles.skeletonValue} accessibilityElementsHidden />
      ) : (
        <Text style={metricStyles.value}>{value.toLocaleString()}</Text>
      )}
      <Text style={metricStyles.label}>{label}</Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  value: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
  },
  label: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  skeletonValue: {
    width: 48,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    marginBottom: 4,
  },
});

// ---------------------------------------------------------------------------
// QuickStatsCard
// ---------------------------------------------------------------------------

interface QuickStatsCardProps {
  /** Initially selected range. Defaults to '7d'. */
  initialRange?: AnalyticsRange;
}

export function QuickStatsCard({ initialRange = '7d' }: QuickStatsCardProps) {
  // Local range state — driven by the segmented control inside this card.
  // We don't lift this to the parent because the card manages its own range.
  const [selectedRange, setSelectedRange] = React.useState<AnalyticsRange>(initialRange);

  const { data, isLoading, isError } = useAnalyticsSummary(selectedRange);

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.header}>
        <Text style={styles.title}>Quick stats</Text>

        {/* Range selector */}
        <View style={styles.rangeRow} accessibilityRole="radiogroup" accessibilityLabel="Date range">
          {RANGE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.rangeButton,
                selectedRange === opt.value && styles.rangeButtonActive,
              ]}
              onPress={() => setSelectedRange(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: selectedRange === opt.value }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text
                style={[
                  styles.rangeButtonText,
                  selectedRange === opt.value && styles.rangeButtonTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Metric boxes */}
      {isError ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Could not load stats. Pull to refresh.</Text>
        </View>
      ) : (
        <View style={styles.metricsRow}>
          <MetricBox label="Views" value={data?.totalViews} isLoading={isLoading} />
          <View style={styles.metricDivider} />
          <MetricBox label="Link clicks" value={data?.totalLinkClicks} isLoading={isLoading} />
          <View style={styles.metricDivider} />
          <MetricBox label="Saves" value={data?.totalContactSaves} isLoading={isLoading} />
        </View>
      )}
    </View>
  );
}

// We need React in scope for useState
import React from 'react';

const styles = StyleSheet.create({
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Range selector
  rangeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  rangeButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'transparent',
    minHeight: 30,
    justifyContent: 'center',
  },
  rangeButtonActive: {
    backgroundColor: '#EFF6FF',
  },
  rangeButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  rangeButtonTextActive: {
    color: '#0066CC',
    fontWeight: '600',
  },

  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },

  // Metrics row
  metricsRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 4,
  },

  // Error
  errorState: {
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
