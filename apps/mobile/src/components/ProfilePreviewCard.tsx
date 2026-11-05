/**
 * ProfilePreviewCard component
 *
 * Shown on the dashboard home screen. Displays the Owner's avatar, name,
 * designation, and a "View public page" button that opens their profile URL
 * in the system browser.
 *
 * Requirements:
 *   2.3  — profile shows "TapSync user" placeholder when fullName is not set.
 *   4.4  — WHEN the app is reopened it SHALL display the Active Mode as stored
 *           on the server (indirectly: profile data comes from the server).
 */

import { View, Text, Image, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import type { UserProfile } from '../features/user';

const PUBLIC_BASE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://tapsync-eosin.vercel.app';

interface ProfilePreviewCardProps {
  /** User profile data. Pass `undefined` while loading to show the skeleton. */
  profile: UserProfile | undefined;
  /** Whether the profile query is still loading. */
  isLoading?: boolean;
}

/**
 * Renders a single-line text placeholder for skeleton loading state.
 */
function SkeletonLine({ width, height = 14 }: { width: number | `${number}%`; height?: number }) {
  return (
    <View
      style={[styles.skeletonLine, { width, height, borderRadius: height / 2 }]}
      accessibilityElementsHidden
    />
  );
}

/**
 * Initials avatar shown when no avatarUrl is set.
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
      <Text style={styles.initialsText} aria-hidden>
        {initials || 'T'}
      </Text>
    </View>
  );
}

/**
 * Opens the Owner's permanent public profile URL in the system browser.
 */
async function openPublicPage(publicId: string) {
  const url = `${PUBLIC_BASE_URL}/c/${publicId}`;
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}

export function ProfilePreviewCard({ profile, isLoading }: ProfilePreviewCardProps) {
  const displayName = profile?.fullName?.trim() || 'TapSync user';
  const isPlaceholder = !profile?.fullName?.trim();

  if (isLoading && !profile) {
    // Loading skeleton
    return (
      <View style={styles.card} accessibilityLabel="Loading profile">
        <View style={styles.row}>
          <View style={[styles.avatar, styles.skeletonAvatar]} accessibilityElementsHidden />
          <View style={styles.textBlock}>
            <SkeletonLine width="60%" height={16} />
            <SkeletonLine width="40%" />
          </View>
        </View>
        <View style={[styles.button, styles.skeletonButton]} accessibilityElementsHidden />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {/* Avatar */}
        {profile?.avatarUrl ? (
          <Image
            source={{ uri: profile.avatarUrl }}
            style={styles.avatar}
            accessibilityLabel={`${displayName}'s avatar`}
          />
        ) : (
          <InitialsAvatar name={isPlaceholder ? 'TapSync' : displayName} />
        )}

        {/* Name and designation */}
        <View style={styles.textBlock}>
          <Text
            style={[styles.name, isPlaceholder && styles.namePlaceholder]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {displayName}
          </Text>
          {profile?.designation ? (
            <Text style={styles.designation} numberOfLines={1}>
              {profile.designation}
            </Text>
          ) : null}
          {profile?.company && !profile?.designation ? (
            <Text style={styles.designation} numberOfLines={1}>
              {profile.company}
            </Text>
          ) : null}
        </View>
      </View>

      {/* "View public page" button */}
      {profile?.publicId ? (
        <TouchableOpacity
          style={styles.button}
          onPress={() => openPublicPage(profile.publicId)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="View public page"
          accessibilityHint="Opens your TapSync profile in the browser"
        >
          <Text style={styles.buttonText}>View public page →</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  // Avatar
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E5E7EB',
  },
  initialsAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Text
  textBlock: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  namePlaceholder: {
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  designation: {
    fontSize: 13,
    color: '#6B7280',
  },

  // CTA button
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    // Ensure ≥ 44px touch target height
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },

  // Skeleton
  skeletonLine: {
    backgroundColor: '#E5E7EB',
  },
  skeletonAvatar: {
    backgroundColor: '#E5E7EB',
  },
  skeletonButton: {
    width: 160,
    height: 38,
    backgroundColor: '#E5E7EB',
  },
});
