/**
 * Custom Name screen
 *
 * Allows the Owner to claim, change or remove their vanity name
 * (`tapsync.app/p/{name}`).
 *
 * Key behaviours:
 * - Live availability check debounced 500 ms (green ✓ / red ✗)
 * - Format validation: /^[a-z0-9_-]{3,30}$/
 * - URL previews for both `/p/{name}` and `/c/{publicId}`
 * - Prominent note that cards use the permanent URL and never need reprogramming (Req 2.12)
 * - Remove with confirmation dialog; confirm dialog warns that the name keeps redirecting
 *
 * Requirements: 2.8–2.14
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUserProfile } from '../features/user/use-user-profile';
import { useCustomName } from '../features/user/use-custom-name';
import { ApiError } from '../lib/api';

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://tapsync-eosin.vercel.app';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a human-readable error message from an unknown error. */
function getErrorMessage(error: Error | null): string {
  if (!error) return '';
  if (error instanceof ApiError) {
    // 409 = name conflict; 422 = format/limit validation from server
    if (error.statusCode === 409) return 'That name is already taken.';
    if (error.statusCode === 422) return error.message;
    if (error.statusCode === 429) return 'You have reached the 3-change limit for this 30-day period.';
  }
  return error.message || 'An unexpected error occurred.';
}

// ─── Availability badge ───────────────────────────────────────────────────────

type BadgeProps = {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
  inputName: string;
  reason?: string | undefined;
};

function AvailabilityBadge({ status, inputName, reason }: BadgeProps) {
  if (!inputName || status === 'idle') return null;

  if (status === 'checking') {
    return (
      <View style={badgeStyles.row}>
        <ActivityIndicator size="small" color="#6B7280" />
        <Text style={badgeStyles.checking}>Checking availability…</Text>
      </View>
    );
  }

  if (status === 'available') {
    return (
      <View style={badgeStyles.row}>
        <Text style={badgeStyles.available}>✓  Available</Text>
      </View>
    );
  }

  if (status === 'taken') {
    return (
      <View style={badgeStyles.row}>
        <Text style={badgeStyles.unavailable}>✗  {reason || 'Already taken'}</Text>
      </View>
    );
  }

  if (status === 'invalid') {
    return (
      <View style={badgeStyles.row}>
        <Text style={badgeStyles.unavailable}>
          ✗  3–30 characters: letters, numbers, _ or -
        </Text>
      </View>
    );
  }

  return null;
}

const badgeStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  checking: {
    fontSize: 13,
    color: '#6B7280',
  },
  available: {
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '500',
  },
  unavailable: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '500',
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CustomNameScreen() {
  const router = useRouter();
  const { data: profile, isLoading: isProfileLoading } = useUserProfile();

  // DEBUG
  console.log('[CustomName] SCREEN MOUNTED AND RENDERING');

  const [inputName, setInputName] = useState('');

  const {
    currentName,
    checkAvailability,
    availabilityStatus,
    availabilityReason,
    claimOrChange,
    isClaiming,
    removeName,
    isRemoving,
    changeError,
    removeError,
  } = useCustomName({
    onClaimSuccess: () => {
      router.back();
    },
    onClaimError: (err) => {
      Alert.alert('Could not save name', getErrorMessage(err), [{ text: 'OK' }]);
    },
    onRemoveSuccess: () => {
      router.back();
    },
    onRemoveError: (err) => {
      Alert.alert('Could not remove name', getErrorMessage(err), [{ text: 'OK' }]);
    },
  });

  // Pre-fill input with the current custom name when profile loads.
  useEffect(() => {
    if (currentName) {
      setInputName(currentName);
    }
  }, [currentName]);

  // Run the availability check on every input change.
  const handleInputChange = useCallback(
    (text: string) => {
      // Force lowercase to match the allowed format.
      const lowered = text.toLowerCase();
      setInputName(lowered);
      // Don't bother checking if the value equals the current name.
      if (lowered === (currentName ?? '')) {
        // No change needed — treat as idle so the button stays disabled.
        return;
      }
      checkAvailability(lowered);
    },
    [checkAvailability, currentName],
  );

  // ── Button states ─────────────────────────────────────────────────────────
  const isCurrentName = inputName === (currentName ?? '');
  const canClaim =
    availabilityStatus === 'available' && !isCurrentName && !isClaiming && !isRemoving;

  const handleClaim = useCallback(() => {
    console.log('[CustomName] Claim pressed! canClaim:', canClaim, 'inputName:', inputName);
    if (!canClaim) return;
    claimOrChange(inputName);
  }, [canClaim, claimOrChange, inputName]);

  // ── Remove flow ───────────────────────────────────────────────────────────
  const handleRemove = useCallback(() => {
    Alert.alert(
      'Remove custom name?',
      `"${SITE_URL}/p/${currentName}" will keep redirecting to your profile, but you won't have a custom name anymore. You can always claim a new one.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeName(),
        },
      ],
    );
  }, [currentName, removeName]);

  const isBusy = isClaiming || isRemoving;

  // ── Derived display ───────────────────────────────────────────────────────
  const publicId = profile?.publicId;
  const permanentUrl = publicId ? `${SITE_URL}/c/${publicId}` : `${SITE_URL}/c/…`;
  const previewUrl =
    inputName && availabilityStatus !== 'invalid'
      ? `${SITE_URL}/p/${inputName}`
      : currentName
        ? `${SITE_URL}/p/${currentName}`
        : null;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isProfileLoading && !profile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066CC" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root} onStartShouldSetResponder={() => { console.log('[CustomName] ROOT VIEW TOUCHED'); return false; }}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={isBusy}
        >
          <Text style={[styles.headerBtnText, isBusy && styles.dimText]}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Custom Name</Text>

        {/* Right spacer to balance the back button */}
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Current name ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current custom name</Text>
          {currentName ? (
            <View style={styles.currentNameRow}>
              <Text style={styles.currentNameText}>
                {SITE_URL}/p/
                <Text style={styles.currentNameBold}>{currentName}</Text>
              </Text>
            </View>
          ) : (
            <Text style={styles.noNameText}>No custom name set yet.</Text>
          )}
        </View>

        {/* ── Claim / change ────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {currentName ? 'Change custom name' : 'Claim a custom name'}
          </Text>

          <Text style={styles.formatHint}>
            3–30 characters · lowercase letters, numbers, _ or -
          </Text>

          {/* Input */}
          <View style={styles.inputRow}>
            <Text style={styles.inputPrefix}>{SITE_URL}/p/</Text>
            <TextInput
              style={styles.nameInput}
              value={inputName}
              onChangeText={handleInputChange}
              onFocus={() => console.log('[CustomName] TextInput focused!')}
              onPressIn={() => console.log('[CustomName] TextInput pressed!')}
              placeholder="your-name"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              returnKeyType="done"
              maxLength={30}
              accessibilityLabel="Custom name input"
              accessibilityHint="Enter a custom name for your profile URL"
              editable={!isBusy}
            />
          </View>

          {/* Availability badge */}
          <AvailabilityBadge
            status={isCurrentName ? 'idle' : availabilityStatus}
            inputName={isCurrentName ? '' : inputName}
            reason={availabilityReason}
          />

          {/* Claim/Change button */}
          <TouchableOpacity
            style={[styles.claimButton, !canClaim && styles.claimButtonDisabled]}
            onPress={handleClaim}
            accessibilityRole="button"
            accessibilityLabel={currentName ? 'Change custom name' : 'Claim custom name'}
            accessibilityState={{ disabled: !canClaim }}
            disabled={!canClaim}
            activeOpacity={0.75}
          >
            {isClaiming ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.claimButtonText}>
                {currentName ? '🔁  Change Name' : '✅  Claim Name'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Inline error from the mutation (non-Alert errors) */}
          {changeError && !isClaiming ? (
            <Text style={styles.errorText}>{getErrorMessage(changeError)}</Text>
          ) : null}

          {/* Change limit note */}
          <Text style={styles.limitNote}>
            You can change your custom name up to 3 times per 30 days.
          </Text>
        </View>

        {/* ── URL previews ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your URLs</Text>

          {/* Custom URL preview (only shown if there's something to preview) */}
          {previewUrl ? (
            <View style={styles.urlRow}>
              <View style={styles.urlLabelRow}>
                <Text style={styles.urlBadge}>Custom</Text>
                {inputName && inputName !== currentName && availabilityStatus === 'available' && (
                  <Text style={styles.urlPreviewTag}>preview</Text>
                )}
              </View>
              <Text style={styles.urlValue}>{previewUrl}</Text>
            </View>
          ) : null}

          {/* Permanent URL — always shown */}
          <View style={[styles.urlRow, previewUrl ? styles.urlRowBorder : null]}>
            <View style={styles.urlLabelRow}>
              <Text style={styles.urlBadgePermanent}>Permanent</Text>
            </View>
            <Text style={styles.urlValue}>{permanentUrl}</Text>
          </View>
        </View>

        {/* ── NFC card note (Requirement 2.12) ──────────────────────── */}
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>📌 Your card never needs reprogramming</Text>
          <Text style={styles.noteBody}>
            Your NFC card always uses your permanent URL ({permanentUrl}). Changing
            or removing your custom name has no effect on your card — everyone who
            taps it will still reach your profile.
          </Text>
        </View>

        {/* ── Remove section ────────────────────────────────────────── */}
        {currentName ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Remove custom name</Text>
            <Text style={styles.removeHint}>
              `"${SITE_URL}/p/${currentName}" will keep redirecting to your profile
              and stay reserved so nobody else can claim it.
            </Text>

            <TouchableOpacity
              style={[styles.removeButton, isRemoving && styles.removeButtonBusy]}
              onPress={handleRemove}
              accessibilityRole="button"
              accessibilityLabel="Remove custom name"
              disabled={isBusy}
              activeOpacity={0.75}
            >
              {isRemoving ? (
                <ActivityIndicator color="#DC2626" />
              ) : (
                <Text style={styles.removeButtonText}>🗑  Remove Custom Name</Text>
              )}
            </TouchableOpacity>

            {removeError && !isRemoving ? (
              <Text style={styles.errorText}>{getErrorMessage(removeError)}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  // ── Loading ────────────────────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: {
    minWidth: 60,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerBtnText: {
    fontSize: 16,
    color: '#0066CC',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  headerSpacer: {
    minWidth: 60,
  },
  dimText: {
    opacity: 0.4,
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },

  // ── Shared card ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },

  // ── Current name ──────────────────────────────────────────────────────────
  currentNameRow: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  currentNameText: {
    fontSize: 14,
    color: '#374151',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  currentNameBold: {
    fontWeight: '700',
    color: '#0066CC',
  },
  noNameText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },

  // ── Input area ────────────────────────────────────────────────────────────
  formatHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: -4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    paddingLeft: 14,
    height: 48,
  },
  inputPrefix: {
    fontSize: 14,
    color: '#9CA3AF',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  nameInput: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: '#111827',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    paddingRight: 14,
  },

  // ── Claim button ──────────────────────────────────────────────────────────
  claimButton: {
    backgroundColor: '#0066CC',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#0066CC',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  claimButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  errorText: {
    fontSize: 13,
    color: '#DC2626',
    marginTop: -4,
  },
  limitNote: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: -2,
  },

  // ── URL previews ──────────────────────────────────────────────────────────
  urlRow: {
    gap: 4,
    paddingVertical: 4,
  },
  urlRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    marginTop: 2,
  },
  urlLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  urlBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0066CC',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  urlBadgePermanent: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  urlPreviewTag: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  urlValue: {
    fontSize: 13,
    color: '#374151',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },

  // ── NFC note card ─────────────────────────────────────────────────────────
  noteCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 16,
    gap: 8,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  noteBody: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 19,
  },

  // ── Remove section ────────────────────────────────────────────────────────
  removeHint: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  removeButton: {
    borderWidth: 1.5,
    borderColor: '#DC2626',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  removeButtonBusy: {
    opacity: 0.6,
  },
  removeButtonText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '600',
  },

  bottomPad: {
    height: 32,
  },
});
