/**
 * Profile & Settings screen
 *
 * Displays:
 * - The Owner's current profile card (avatar, name, designation, company, bio)
 * - Hidden-field indicators (phone/email visibility status)
 * - "Edit Profile" button navigating to /profile-edit
 * - "Custom Name" navigation (Task 18.4)
 * - Security settings
 * - Sign-out action
 *
 * Requirements:
 *   1.9  — security warning banner
 *   2.4  — profile fields are editable
 *   2.7  — hidden-field indicators
 */

import { Image, View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SecurityWarningBanner } from '../../components';
import { useSecurityWarning } from '../../features/auth';
import { useUserProfile } from '../../features/user';

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://tapsync-eosin.vercel.app';

export default function ProfileScreen() {
  const router = useRouter();
  const { showBanner, dismissBanner } = useSecurityWarning();
  const { data: profile, isLoading } = useUserProfile();

  const handleSecureAccount = () => {
    router.push('/secure-account');
  };

  const handleEditProfile = () => {
    router.push('/profile-edit');
  };

  // ── Derived display values ────────────────────────────────────────────────
  const displayName = profile?.fullName?.trim() || 'TapSync user';
  const isPlaceholder = !profile?.fullName?.trim();
  const initials = (isPlaceholder ? 'TapSync' : displayName)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => (p[0] ?? '').toUpperCase())
    .join('') || 'T';

  const phoneHidden = profile?.hiddenFields?.includes('phone');
  const emailHidden = profile?.hiddenFields?.includes('publicEmail');

  return (
    <View style={styles.container}>
      <SecurityWarningBanner visible={showBanner} onDismiss={dismissBanner} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile card ────────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          {/* Avatar */}
          {profile?.avatarUrl ? (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={styles.avatar}
              accessibilityLabel={`${displayName}'s profile photo`}
            />
          ) : (
            <View style={styles.initialsAvatar}>
              <Text style={styles.initialsText}>{initials}</Text>
            </View>
          )}

          {/* Name */}
          <Text
            style={[styles.displayName, isPlaceholder && styles.namePlaceholder]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {displayName}
          </Text>

          {/* Designation and company */}
          {profile?.designation ? (
            <Text style={styles.subtext} numberOfLines={1}>
              {profile.designation}
              {profile.company ? ` · ${profile.company}` : ''}
            </Text>
          ) : profile?.company ? (
            <Text style={styles.subtext} numberOfLines={1}>
              {profile.company}
            </Text>
          ) : null}

          {/* Bio */}
          {profile?.bio ? (
            <Text style={styles.bio} numberOfLines={3}>
              {profile.bio}
            </Text>
          ) : null}

          {/* Contact visibility indicators */}
          {(profile?.phone || profile?.publicEmail) && (
            <View style={styles.contactRow}>
              {profile.phone ? (
                <View style={styles.contactChip}>
                  <Text style={styles.contactChipText}>
                    📞 {phoneHidden ? 'Phone (hidden)' : 'Phone'}
                  </Text>
                </View>
              ) : null}
              {profile.publicEmail ? (
                <View style={styles.contactChip}>
                  <Text style={styles.contactChipText}>
                    ✉️ {emailHidden ? 'Email (hidden)' : 'Email'}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Edit button */}
          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEditProfile}
            accessibilityRole="button"
            accessibilityLabel="Edit your profile"
            activeOpacity={0.75}
          >
            <Text style={styles.editButtonText}>✏️  Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ── Custom Name ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Public URL</Text>
          <View style={styles.menuCard}>
            {/* Custom name URL */}
            {profile?.customName ? (
              <View style={styles.urlRow}>
                <Text style={styles.urlLabel}>Custom URL</Text>
                <Text style={styles.urlValue} numberOfLines={1}>
                  {SITE_URL}/p/{profile.customName}
                </Text>
              </View>
            ) : null}
            {/* Permanent URL */}
            {profile?.publicId ? (
              <View style={styles.urlRow}>
                <Text style={styles.urlLabel}>Permanent URL</Text>
                <Text style={styles.urlValue} numberOfLines={1}>
                  {SITE_URL}/c/{profile.publicId}
                </Text>
              </View>
            ) : null}
            {/* Custom Name action – Task 18.4 */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push('/custom-name')}
              accessibilityRole="button"
              accessibilityLabel="Manage custom name"
            >
              <Text style={styles.menuIcon}>🔖</Text>
              <Text style={styles.menuText}>
                {profile?.customName ? 'Change Custom Name' : 'Claim Custom Name'}
              </Text>
              <Text style={styles.menuChevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Security ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleSecureAccount}
              accessibilityRole="button"
              accessibilityLabel="Secure your account"
            >
              <Text style={styles.menuIcon}>🔐</Text>
              <Text style={styles.menuText}>Secure Your Account</Text>
              <Text style={styles.menuChevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Legal ────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => Linking.openURL(`${SITE_URL}/privacy`)}
              accessibilityRole="link"
              accessibilityLabel="View Privacy Policy"
            >
              <Text style={styles.menuIcon}>🔒</Text>
              <Text style={styles.menuText}>Privacy Policy</Text>
              <Text style={styles.menuChevron}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              onPress={() => Linking.openURL(`${SITE_URL}/terms`)}
              accessibilityRole="link"
              accessibilityLabel="View Terms of Service"
            >
              <Text style={styles.menuIcon}>📄</Text>
              <Text style={styles.menuText}>Terms of Service</Text>
              <Text style={styles.menuChevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },

  // ── Profile card ──────────────────────────────────────────────────────────
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5E7EB',
    marginBottom: 4,
  },
  initialsAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  initialsText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  namePlaceholder: {
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  subtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  bio: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  contactChip: {
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  contactChipText: {
    fontSize: 12,
    color: '#1D4ED8',
  },
  editButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    backgroundColor: '#0066CC',
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    minHeight: 56,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  menuItemBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  menuIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  menuChevron: {
    fontSize: 22,
    color: '#9CA3AF',
  },

  // ── URL display ───────────────────────────────────────────────────────────
  urlRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  urlLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  urlValue: {
    fontSize: 13,
    color: '#374151',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
});
