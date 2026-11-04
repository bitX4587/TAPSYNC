/**
 * Profile Edit screen
 *
 * Allows the Owner to update:
 *   - Full name, designation, company, bio (text fields)
 *   - Phone and public email (with hidden-field toggles)
 *   - Profile avatar (tap to pick from library and upload)
 *
 * Requirements:
 *   2.4 — WHEN an Owner updates full name, bio, designation, phone, public
 *          email or company THEN the system SHALL validate and persist the changes.
 *   2.5 — Avatar upload: JPEG/PNG/WebP ≤ 5 MB, resize, CDN URL.
 *   2.6 — WHEN an Owner updates their profile THEN the system SHALL invalidate
 *          the cached public page (the PATCH /user/me endpoint triggers this).
 *   2.7 — Owner can mark phone / publicEmail as hidden from the public page.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUserProfile } from '../features/user/use-user-profile';
import { useUpdateProfile } from '../features/user/use-update-profile';
import { useAvatarUpload } from '../features/user/use-avatar-upload';
import type { UpdateProfileDto } from '../features/user/user.service';

// ─── Field length limits (mirror API validation) ─────────────────────────────
const MAX_FULL_NAME = 100;
const MAX_DESIGNATION = 100;
const MAX_COMPANY = 100;
const MAX_BIO = 280;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Trim a string; return null if blank so the API treats it as a field removal. */
function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface LabeledFieldProps {
  label: string;
  children: React.ReactNode;
  hint?: string;
}

function LabeledField({ label, children, hint }: LabeledFieldProps) {
  return (
    <View style={fieldStyles.container}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
      {hint ? <Text style={fieldStyles.hint}>{hint}</Text> : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProfileEditScreen() {
  const router = useRouter();
  const { data: profile, isLoading: isProfileLoading } = useUserProfile();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [company, setCompany] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [publicEmail, setPublicEmail] = useState('');

  // Hidden-field toggles (true = hidden from public page)
  const [phoneHidden, setPhoneHidden] = useState(false);
  const [emailHidden, setEmailHidden] = useState(false);

  // Initialise form fields from the current profile (run once when loaded).
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName ?? '');
    setDesignation(profile.designation ?? '');
    setCompany(profile.company ?? '');
    setBio(profile.bio ?? '');
    setPhone(profile.phone ?? '');
    setPublicEmail(profile.publicEmail ?? '');
    setPhoneHidden(profile.hiddenFields.includes('phone'));
    setEmailHidden(profile.hiddenFields.includes('publicEmail'));
  }, [profile]);

  // ── Avatar upload ──────────────────────────────────────────────────────────
  const { pickAndUpload, isUploading, previewUri, error: avatarError } = useAvatarUpload();

  // Show avatar errors as an alert when they surface.
  useEffect(() => {
    if (avatarError) {
      Alert.alert('Avatar upload failed', avatarError.message, [{ text: 'OK' }]);
    }
  }, [avatarError]);

  // ── Profile update mutation ────────────────────────────────────────────────
  const { updateProfile, isUpdating } = useUpdateProfile({
    onSuccess: () => {
      router.back();
    },
    onError: (err) => {
      Alert.alert(
        'Could not save changes',
        err.message || 'An unexpected error occurred. Please try again.',
        [{ text: 'OK' }],
      );
    },
  });

  // ── Save handler ───────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    // Basic client-side validation.
    if (bio.length > MAX_BIO) {
      Alert.alert('Bio too long', `Bio must be ${MAX_BIO} characters or fewer.`, [{ text: 'OK' }]);
      return;
    }

    const hiddenFields: ('phone' | 'publicEmail')[] = [
      ...(phoneHidden ? (['phone'] as const) : []),
      ...(emailHidden ? (['publicEmail'] as const) : []),
    ];

    const dto: UpdateProfileDto = {
      fullName: toNullable(fullName),
      designation: toNullable(designation),
      company: toNullable(company),
      bio: toNullable(bio),
      phone: toNullable(phone),
      publicEmail: toNullable(publicEmail),
      hiddenFields,
    };

    updateProfile(dto);
  }, [
    bio,
    company,
    designation,
    emailHidden,
    fullName,
    phone,
    phoneHidden,
    publicEmail,
    updateProfile,
  ]);

  // ── Avatar display ─────────────────────────────────────────────────────────
  // Prefer the local preview URI during upload, then the CDN URL, then initials.
  const avatarSource = previewUri ?? profile?.avatarUrl;
  const displayName = profile?.fullName?.trim() || 'TapSync user';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => (p[0] ?? '').toUpperCase())
    .join('') || 'T';

  const isBusy = isUpdating || isUploading;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isProfileLoading && !profile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066CC" />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel and go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={isBusy}
        >
          <Text style={[styles.headerBtnText, isBusy && styles.disabledText]}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Edit Profile</Text>

        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save profile changes"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={isBusy}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color="#0066CC" />
          ) : (
            <Text style={[styles.headerBtnText, styles.saveText, isBusy && styles.disabledText]}>
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar picker ────────────────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={pickAndUpload}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            accessibilityHint="Opens photo library to select a new avatar"
            disabled={isUploading}
          >
            {avatarSource ? (
              <Image
                source={{ uri: avatarSource }}
                style={styles.avatar}
                accessibilityLabel="Profile photo preview"
              />
            ) : (
              <View style={styles.initialsAvatar}>
                <Text style={styles.initialsText}>{initials}</Text>
              </View>
            )}

            {/* Overlay while uploading */}
            {isUploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            )}

            {/* Camera badge */}
            <View style={styles.cameraBadge} accessibilityElementsHidden>
              <Text style={styles.cameraBadgeText}>📷</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.avatarHint}>Tap to change photo</Text>
          <Text style={styles.avatarSubhint}>JPEG, PNG or WebP · max 5 MB</Text>
        </View>

        {/* ── Profile fields ───────────────────────────────────────────── */}
        <View style={styles.card}>
          <LabeledField label="Full name">
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
              placeholderTextColor="#9CA3AF"
              maxLength={MAX_FULL_NAME}
              autoCapitalize="words"
              returnKeyType="next"
              accessibilityLabel="Full name"
            />
          </LabeledField>

          <LabeledField label="Designation">
            <TextInput
              style={styles.input}
              value={designation}
              onChangeText={setDesignation}
              placeholder="e.g. Software Engineer"
              placeholderTextColor="#9CA3AF"
              maxLength={MAX_DESIGNATION}
              autoCapitalize="words"
              returnKeyType="next"
              accessibilityLabel="Designation or job title"
            />
          </LabeledField>

          <LabeledField label="Company">
            <TextInput
              style={styles.input}
              value={company}
              onChangeText={setCompany}
              placeholder="e.g. Acme Inc."
              placeholderTextColor="#9CA3AF"
              maxLength={MAX_COMPANY}
              autoCapitalize="words"
              returnKeyType="next"
              accessibilityLabel="Company or organisation"
            />
          </LabeledField>

          <LabeledField
            label={`Bio (${bio.length}/${MAX_BIO})`}
            hint="Shown on your public profile page"
          >
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="A short description about yourself"
              placeholderTextColor="#9CA3AF"
              maxLength={MAX_BIO}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              accessibilityLabel="Bio"
            />
          </LabeledField>
        </View>

        {/* ── Contact fields + hidden-field switches ───────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contact details</Text>

          {/* Phone */}
          <LabeledField label="Phone">
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+63 912 345 6789"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              returnKeyType="next"
              accessibilityLabel="Phone number"
            />
          </LabeledField>

          <View style={styles.switchRow}>
            <View style={styles.switchLabelGroup}>
              <Text style={styles.switchLabel}>Hide phone on public page</Text>
              <Text style={styles.switchHint}>
                Excluded from the profile page and vCard when hidden
              </Text>
            </View>
            <Switch
              value={phoneHidden}
              onValueChange={setPhoneHidden}
              trackColor={{ false: '#D1D5DB', true: '#BFDBFE' }}
              thumbColor={phoneHidden ? '#0066CC' : '#F3F4F6'}
              ios_backgroundColor="#D1D5DB"
              accessibilityLabel="Hide phone number"
              accessibilityRole="switch"
            />
          </View>

          <View style={styles.divider} />

          {/* Public email */}
          <LabeledField label="Public email">
            <TextInput
              style={styles.input}
              value={publicEmail}
              onChangeText={setPublicEmail}
              placeholder="hello@example.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="done"
              accessibilityLabel="Public email address"
            />
          </LabeledField>

          <View style={styles.switchRow}>
            <View style={styles.switchLabelGroup}>
              <Text style={styles.switchLabel}>Hide email on public page</Text>
              <Text style={styles.switchHint}>
                Excluded from the profile page and vCard when hidden
              </Text>
            </View>
            <Switch
              value={emailHidden}
              onValueChange={setEmailHidden}
              trackColor={{ false: '#D1D5DB', true: '#BFDBFE' }}
              thumbColor={emailHidden ? '#0066CC' : '#F3F4F6'}
              ios_backgroundColor="#D1D5DB"
              accessibilityLabel="Hide email address"
              accessibilityRole="switch"
            />
          </View>
        </View>

        {/* ── Save button (bottom of scroll) ───────────────────────────── */}
        <TouchableOpacity
          style={[styles.saveButton, isBusy && styles.saveButtonDisabled]}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save profile"
          disabled={isBusy}
          activeOpacity={0.75}
        >
          {isUpdating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        {/* Bottom padding for safe area */}
        <View style={styles.bottomPad} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  // Loading state
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
    alignItems: 'center',
  },
  headerBtnText: {
    fontSize: 16,
    color: '#0066CC',
  },
  saveText: {
    fontWeight: '600',
  },
  disabledText: {
    opacity: 0.4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },

  // ── Avatar section ────────────────────────────────────────────────────────
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  avatarWrapper: {
    position: 'relative',
    width: 96,
    height: 96,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E5E7EB',
  },
  initialsAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  cameraBadgeText: {
    fontSize: 16,
  },
  avatarHint: {
    fontSize: 14,
    color: '#0066CC',
    fontWeight: '500',
  },
  avatarSubhint: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // ── Card container ────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },

  // ── Text inputs ───────────────────────────────────────────────────────────
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  bioInput: {
    height: 100,
    paddingTop: 12,
    paddingBottom: 12,
  },

  // ── Hidden-field switches ─────────────────────────────────────────────────
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: 12,
    marginBottom: 4,
  },
  switchLabelGroup: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 15,
    color: '#111827',
  },
  switchHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 12,
  },

  // ── Save button ───────────────────────────────────────────────────────────
  saveButton: {
    backgroundColor: '#0066CC',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0066CC',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  bottomPad: {
    height: 32,
  },
});
