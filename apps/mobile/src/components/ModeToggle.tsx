/**
 * ModeToggle component
 *
 * A prominent Casual / Work toggle displayed on the dashboard home screen.
 * Visually highlights the active mode and provides accessible touch targets.
 *
 * Requirements: 4.7 — the mobile app SHALL expose the mode toggle on the
 * dashboard home screen.
 *
 * Accessibility: each button has an accessibilityRole of "button" and an
 * accessibilityState.selected so screen readers announce which mode is active.
 * Touch targets are at least 44px tall (Requirement 5.9 for public page, applied
 * here by good practice).
 */

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { Mode } from '../features/user';

interface ModeToggleProps {
  /** The currently active mode (may be undefined while loading). */
  activeMode: Mode | undefined;
  /** Whether a toggle request is currently in flight. */
  isToggling: boolean;
  /** Called when the user presses one of the mode buttons. */
  onToggle: (mode: Mode) => void;
}

/**
 * Renders a segmented control with a "Casual" and a "Work" button.
 * The active segment is highlighted; the inactive segment is muted.
 * A spinner overlays the control while a toggle request is in flight.
 */
export function ModeToggle({ activeMode, isToggling, onToggle }: ModeToggleProps) {
  return (
    <View style={styles.wrapper} accessibilityRole="radiogroup" accessibilityLabel="Active mode">
      <Text style={styles.label}>Active mode</Text>

      <View style={styles.segmentedControl}>
        {/* Casual button */}
        <TouchableOpacity
          style={[
            styles.segment,
            styles.segmentLeft,
            activeMode === 'casual' && styles.segmentActive,
          ]}
          onPress={() => onToggle('casual')}
          disabled={isToggling}
          accessibilityRole="button"
          accessibilityLabel="Casual mode"
          accessibilityState={{ selected: activeMode === 'casual' }}
          activeOpacity={0.8}
        >
          <Text style={styles.modeEmoji}>🌴</Text>
          <Text
            style={[
              styles.segmentText,
              activeMode === 'casual' && styles.segmentTextActive,
            ]}
          >
            Casual
          </Text>
        </TouchableOpacity>

        {/* Work button */}
        <TouchableOpacity
          style={[
            styles.segment,
            styles.segmentRight,
            activeMode === 'work' && styles.segmentActive,
          ]}
          onPress={() => onToggle('work')}
          disabled={isToggling}
          accessibilityRole="button"
          accessibilityLabel="Work mode"
          accessibilityState={{ selected: activeMode === 'work' }}
          activeOpacity={0.8}
        >
          <Text style={styles.modeEmoji}>💼</Text>
          <Text
            style={[
              styles.segmentText,
              activeMode === 'work' && styles.segmentTextActive,
            ]}
          >
            Work
          </Text>
        </TouchableOpacity>

        {/* Loading overlay */}
        {isToggling && (
          <View style={styles.loadingOverlay} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color="#0066CC" />
          </View>
        )}
      </View>

      {/* Active mode description */}
      <Text style={styles.description}>
        {activeMode === 'work'
          ? 'Visitors see your work links'
          : activeMode === 'casual'
          ? 'Visitors see your casual links'
          : 'Loading…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    width: '100%',
    maxWidth: 320,
    position: 'relative',
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 52, // ≥ 44px touch target
  },
  segmentLeft: {
    marginRight: 2,
  },
  segmentRight: {
    marginLeft: 2,
  },
  segmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modeEmoji: {
    fontSize: 20,
  },
  segmentText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  segmentTextActive: {
    color: '#111827',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: 'rgba(243, 244, 246, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  description: {
    marginTop: 10,
    fontSize: 13,
    color: '#6B7280',
  },
});
