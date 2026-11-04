/**
 * Contact Detail screen — /network/[id]
 *
 * Shows the live profile (name, designation, company, bio, links), action
 * buttons (Save to phone contacts, Open in browser), a private note editor,
 * and a delete button.
 *
 * Route params:
 *   id       — the server contact id (used for delete / note update)
 *   publicId — the TapSync public id (used to fetch the live profile)
 *
 * Requirements: 12.3, 12.4, 13.1
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { PublicProfileDto } from '@tapsync/shared';
import { api } from '../../lib/api';
import { useNetworkContact, useNetworkDelete, useNetworkNote } from '../../features/network/use-network';
import { formatRelativeTime } from '../../features/network/formatRelativeTime';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PUBLIC_BASE_URL = 'https://tapsync.app';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.tapsync.app';

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
      <Text style={styles.initialsText} aria-hidden>
        {initials || '?'}
      </Text>
    </View>
  );
}

/**
 * Single link row.
 */
function LinkRow({ title, url }: { title: string; url: string }) {
  const handlePress = useCallback(() => {
    void Linking.openURL(url);
  }, [url]);

  return (
    <TouchableOpacity
      style={styles.linkRow}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint="Opens this link"
    >
      <Text style={styles.linkTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.linkChevron}>›</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ContactDetailScreen() {
  const router = useRouter();
  const { id, publicId } = useLocalSearchParams<{ id: string; publicId: string }>();

  // ── Contact from local cache / React Query ──────────────────────────────
  const { contact, isLoading: isContactLoading } = useNetworkContact(publicId);

  // ── Live profile fetch ───────────────────────────────────────────────────
  const {
    data: profile,
    isLoading: isProfileLoading,
  } = useQuery<PublicProfileDto>({
    queryKey: ['public-profile', publicId],
    queryFn: () => api.get<PublicProfileDto>(`/public/profiles/c/${publicId}`),
    enabled: Boolean(publicId),
    retry: 1,
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const { deleteContact, isPending: isDeleting } = useNetworkDelete();
  const { updateNote, isPending: isSavingNote } = useNetworkNote();

  // ── Note state ───────────────────────────────────────────────────────────
  const [noteText, setNoteText] = useState<string>(contact?.note ?? '');
  const [noteSaved, setNoteSaved] = useState(false);
  const noteChanged = noteText !== (contact?.note ?? '');

  const handleSaveNote = useCallback(async () => {
    if (!contact) return;
    try {
      await updateNote(contact.id, noteText);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch {
      Alert.alert('Error', 'Could not save note. Please try again.');
    }
  }, [contact, noteText, updateNote]);

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    if (!contact) return;
    Alert.alert(
      'Remove this contact?',
      'This will remove them from your My Network list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteContact(contact.id);
              router.back();
            } catch {
              Alert.alert('Error', 'Could not remove the contact. Please try again.');
            }
          },
        },
      ],
    );
  }, [contact, deleteContact, router]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (isContactLoading) {
    return (
      <View style={styles.centeredContainer}>
        <Stack.Screen options={{ title: 'Contact' }} />
        <ActivityIndicator size="large" color="#0066CC" accessibilityLabel="Loading contact" />
      </View>
    );
  }

  // ── Not found state ──────────────────────────────────────────────────────
  if (!contact) {
    return (
      <View style={styles.centeredContainer}>
        <Stack.Screen options={{ title: 'Contact' }} />
        <Text style={styles.notFoundText}>Contact not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Resolved display values ──────────────────────────────────────────────
  const displayName = profile?.fullName ?? contact.snapshot?.name ?? 'Unknown contact';
  const designation = profile?.designation ?? contact.snapshot?.designation;
  const company = profile?.company;
  const bio = profile?.bio;
  const avatarUrl = profile?.avatarUrl ?? contact.snapshot?.avatarUrl;
  const links = profile?.links ?? [];
  const isUnavailable = contact.status === 'unavailable';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Stack screen options — title + delete in header */}
      <Stack.Screen
        options={{
          title: displayName,
          headerRight: () => (
            <TouchableOpacity
              onPress={handleDelete}
              disabled={isDeleting}
              accessibilityRole="button"
              accessibilityLabel="Delete contact"
              style={styles.headerDeleteButton}
            >
              <Text style={styles.headerDeleteText}>
                {isDeleting ? 'Removing…' : 'Delete'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />

      {/* ── Unavailable banner ─────────────────────────────────────────── */}
      {isUnavailable && (
        <View style={styles.unavailableBanner} accessibilityRole="alert">
          <Text style={styles.unavailableBannerText}>
            This profile is no longer available. You can still keep the contact or remove them.
          </Text>
        </View>
      )}

      {/* ── Profile section ───────────────────────────────────────────── */}
      <View style={styles.profileSection}>
        {/* Avatar */}
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={styles.avatar}
            accessibilityLabel={`${displayName}'s avatar`}
          />
        ) : (
          <InitialsAvatar name={displayName} />
        )}

        {/* Name */}
        <Text style={styles.displayName} accessibilityRole="header">
          {displayName}
        </Text>

        {/* Designation · Company */}
        {(designation || company) && (
          <Text style={styles.subheading}>
            {[designation, company].filter(Boolean).join(' · ')}
          </Text>
        )}

        {/* Bio */}
        {bio ? <Text style={styles.bio}>{bio}</Text> : null}

        {/* Profile loading indicator */}
        {isProfileLoading && (
          <ActivityIndicator
            size="small"
            color="#9CA3AF"
            style={styles.profileSpinner}
            accessibilityLabel="Loading live profile"
          />
        )}
      </View>

      {/* ── Links section ─────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>LINKS</Text>
        <View style={styles.card}>
          {links.length === 0 ? (
            <Text style={styles.emptyLinksText}>No links in this profile</Text>
          ) : (
            links.map((link, idx) => (
              <View key={link.id}>
                {idx > 0 && <View style={styles.hairline} />}
                <LinkRow title={link.title} url={link.url} />
              </View>
            ))
          )}
        </View>
      </View>

      {/* ── Action buttons ─────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ACTIONS</Text>
        <View style={styles.card}>
          {/* Save to phone contacts */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() =>
              void Linking.openURL(
                `${API_BASE_URL}/public/profiles/c/${publicId}/vcard`,
              )
            }
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Save to phone contacts"
            accessibilityHint="Downloads the contact card and opens the save-to-contacts flow"
          >
            <Text style={styles.actionIcon}>📥</Text>
            <Text style={styles.actionText}>Save to phone contacts</Text>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.hairline} />

          {/* Open in browser */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() =>
              void Linking.openURL(`${PUBLIC_BASE_URL}/c/${publicId}`)
            }
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open in browser"
            accessibilityHint="Opens this TapSync profile in the browser"
          >
            <Text style={styles.actionIcon}>🌐</Text>
            <Text style={styles.actionText}>Open in browser</Text>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Private note section ───────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PRIVATE NOTE</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.noteInput}
            value={noteText}
            onChangeText={(t) => {
              setNoteText(t);
              setNoteSaved(false);
            }}
            placeholder="Add a private note about this contact…"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            accessibilityLabel="Private note"
          />
          <View style={styles.hairline} />
          <View style={styles.noteFooter}>
            {noteSaved && (
              <Text style={styles.noteSavedText} accessibilityRole="alert">
                Note saved ✓
              </Text>
            )}
            <TouchableOpacity
              style={[styles.saveNoteButton, (!noteChanged || isSavingNote) && styles.saveNoteButtonDisabled]}
              onPress={() => void handleSaveNote()}
              disabled={!noteChanged || isSavingNote}
              accessibilityRole="button"
              accessibilityLabel="Save note"
              accessibilityState={{ disabled: !noteChanged || isSavingNote }}
            >
              <Text
                style={[
                  styles.saveNoteButtonText,
                  (!noteChanged || isSavingNote) && styles.saveNoteButtonTextDisabled,
                ]}
              >
                {isSavingNote ? 'Saving…' : 'Save note'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Meta info section ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DETAILS</Text>
        <View style={styles.card}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Tapped</Text>
            <Text style={styles.metaValue}>{formatRelativeTime(contact.lastTappedAt)}</Text>
          </View>
          <View style={styles.hairline} />
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>First saved</Text>
            <Text style={styles.metaValue}>{formatRelativeTime(contact.firstSavedAt)}</Text>
          </View>
          <View style={styles.hairline} />
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Source</Text>
            <Text style={styles.metaValue}>{contact.source}</Text>
          </View>
          {contact.tapCount > 1 && (
            <>
              <View style={styles.hairline} />
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Times tapped</Text>
                <Text style={styles.metaValue}>{contact.tapCount}</Text>
              </View>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  contentContainer: {
    paddingBottom: 40,
  },

  // Loading / not-found
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    gap: 16,
  },
  notFoundText: {
    fontSize: 17,
    color: '#6B7280',
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0066CC',
  },

  // Header delete button
  headerDeleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerDeleteText: {
    fontSize: 15,
    color: '#DC2626',
    fontWeight: '500',
  },

  // Unavailable banner
  unavailableBanner: {
    margin: 16,
    marginBottom: 0,
    padding: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  unavailableBannerText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },

  // Profile section
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    gap: 6,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
  },
  initialsAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  initialsText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  subheading: {
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
  profileSpinner: {
    marginTop: 8,
  },

  // Sections
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
    gap: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },

  // Hairline divider inside cards
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginLeft: 16,
  },

  // Links
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    gap: 8,
  },
  linkTitle: {
    flex: 1,
    fontSize: 15,
    color: '#0066CC',
  },
  linkChevron: {
    fontSize: 20,
    color: '#9CA3AF',
    lineHeight: 22,
  },
  emptyLinksText: {
    fontSize: 14,
    color: '#9CA3AF',
    padding: 16,
    textAlign: 'center',
  },

  // Action rows
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    gap: 12,
  },
  actionIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },

  // Private note
  noteInput: {
    padding: 14,
    fontSize: 15,
    color: '#111827',
    minHeight: 96,
    lineHeight: 22,
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 12,
    gap: 10,
  },
  noteSavedText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
  },
  saveNoteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0066CC',
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  saveNoteButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  saveNoteButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveNoteButtonTextDisabled: {
    color: '#9CA3AF',
  },

  // Meta info rows
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  metaLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  metaValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 16,
  },
});
