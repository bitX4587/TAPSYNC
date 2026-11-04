/**
 * ContactRow — a single row in the My Network list.
 *
 * Displays avatar (photo or initials), name, designation, last-tapped time,
 * status badges (unavailable / pending), and a "New" highlight badge.
 *
 * Requirements: 12.3, 13.1
 */

import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import type { NetworkContactDto } from '@tapsync/shared';
import { formatRelativeTime } from './formatRelativeTime';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContactRowProps {
  contact: NetworkContactDto;
  /** Show blue highlight + "New" badge for a newly-added contact. */
  isNew?: boolean;
  /** Show the "Pending sync" badge (passed from the parent list). */
  isPending?: boolean;
  onPress: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Initials circle — shown when no avatarUrl is available.
 */
function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  return (
    <View style={styles.initialsAvatar} accessible={false}>
      <Text style={styles.initialsText} aria-hidden testID="contact-initials">
        {initials || '?'}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ContactRow
// ---------------------------------------------------------------------------

export function ContactRow({ contact, isNew, isPending, onPress }: ContactRowProps) {
  const displayName = contact.snapshot?.name ?? 'Unknown contact';
  const hasName = Boolean(contact.snapshot?.name);
  const isUnavailable = contact.status === 'unavailable';

  return (
    <TouchableOpacity
      style={[styles.row, isNew && styles.rowNew]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${contact.snapshot?.designation ?? ''}`}
      accessibilityHint="Opens contact details"
    >
      {/* New contact — left accent border */}
      {isNew && <View style={styles.newAccent} accessibilityElementsHidden />}

      {/* Avatar */}
      {contact.snapshot?.avatarUrl ? (
        <Image
          source={{ uri: contact.snapshot.avatarUrl }}
          style={styles.avatar}
          accessibilityLabel={`${displayName}'s avatar`}
        />
      ) : (
        <InitialsAvatar name={hasName ? displayName : 'Unknown'} />
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* Top row: name + badges */}
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.badges}>
            {isNew && (
              <View style={styles.badgeNew} accessibilityLabel="New contact">
                <Text style={styles.badgeNewText}>New</Text>
              </View>
            )}
            {isUnavailable && (
              <View style={styles.badgeUnavailable} accessibilityLabel="Profile removed">
                <Text style={styles.badgeUnavailableText}>Profile removed</Text>
              </View>
            )}
            {isPending && (
              <View style={styles.badgePending} accessibilityLabel="Pending sync">
                <Text style={styles.badgePendingText}>Pending sync</Text>
              </View>
            )}
          </View>
        </View>

        {/* Designation */}
        {contact.snapshot?.designation ? (
          <Text style={styles.designation} numberOfLines={1}>
            {contact.snapshot.designation}
          </Text>
        ) : null}

        {/* Last tapped */}
        <Text style={styles.lastTapped} numberOfLines={1}>
          Tapped {formatRelativeTime(contact.lastTappedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 72,
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  rowNew: {
    backgroundColor: '#EFF6FF',
  },

  // New contact left accent
  newAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#0066CC',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },

  // Avatar
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E5E7EB',
    flexShrink: 0,
  },
  initialsAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  initialsText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Content
  content: {
    flex: 1,
    gap: 2,
    minWidth: 0, // allow text truncation
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    flexShrink: 1,
  },
  designation: {
    fontSize: 13,
    color: '#6B7280',
  },
  lastTapped: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Badges container
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },

  // "New" badge — blue
  badgeNew: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: '#0066CC',
  },
  badgeNewText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // "Profile removed" badge — gray
  badgeUnavailable: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: '#F3F4F6',
  },
  badgeUnavailableText: {
    fontSize: 11,
    color: '#6B7280',
  },

  // "Pending sync" badge — orange tint
  badgePending: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: '#FFF7ED',
  },
  badgePendingText: {
    fontSize: 11,
    color: '#C2410C',
  },
});
