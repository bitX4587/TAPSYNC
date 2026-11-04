/**
 * Add Contact screen — /network/add
 *
 * Three capture modes selectable via a segmented control:
 *   NFC  — tap an NFC card to read the profile URL, then save
 *   QR   — enter / paste the profile URL shown by a QR code
 *   Link — paste any tapsync:// or https://tapsync.app/ link
 *
 * After a successful save the user is navigated back to My Network with
 * the new contact highlighted.  Offline saves show the list without a
 * highlight (pending sync).  Own-card taps show an inline message without
 * saving.
 *
 * Requirements: 12.1, 12.4, 12.5, 13.1
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { nfcService, NfcError } from '../../features/nfc/nfc.service';
import type { NfcErrorCode } from '../../features/nfc/types';
import { useNetworkUpsert } from '../../features/network/use-network';
import {
  validatePublicId,
  resolveCustomNameToPublicId,
  validateCustomName,
} from '../../features/network/network-save';
import { parseTapSyncUrl } from '../../features/network/parse-tapsync-url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CaptureMode = 'nfc' | 'qr' | 'link';

type NfcReadState =
  | { status: 'idle' }
  | { status: 'unsupported' }
  | { status: 'disabled' }
  | { status: 'scanning' }
  | { status: 'saving' }
  | { status: 'success' }
  | { status: 'own-card' }
  | { status: 'error'; code: NfcErrorCode; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Human-readable description for NFC error codes.
 */
function nfcErrorLabel(code: NfcErrorCode): string {
  switch (code) {
    case 'TIMEOUT':
      return 'No card detected. Hold the phone closer and try again.';
    case 'TAG_LOST':
      return 'Card lost during scan. Keep the card still and try again.';
    case 'NOT_WRITABLE':
      return 'This card cannot be read.';
    case 'USER_CANCELLED':
      return 'Scan cancelled.';
    case 'UNSUPPORTED':
      return 'NFC is not supported on this device.';
    case 'DISABLED':
      return 'NFC is turned off. Enable it in Settings and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

// ---------------------------------------------------------------------------
// NFC Tab
// ---------------------------------------------------------------------------

interface NfcTabProps {
  onSaveSuccess: (publicId: string) => void;
  onSavePending: () => void;
  onOwnCard: () => void;
}

function NfcTab({ onSaveSuccess, onSavePending, onOwnCard }: NfcTabProps) {
  const [nfcState, setNfcState] = useState<NfcReadState>({ status: 'idle' });
  const { saveContact } = useNetworkUpsert();
  const isActiveRef = useRef(true);

  // Cancel any in-progress NFC session on unmount
  useEffect(() => {
    isActiveRef.current = true;
    return () => {
      isActiveRef.current = false;
      nfcService.cancel().catch(() => {
        // Ignore cleanup errors
      });
    };
  }, []);

  const handleScan = useCallback(async () => {
    if (nfcState.status === 'scanning') return;
    setNfcState({ status: 'scanning' });

    try {
      const { url } = await nfcService.readTag();

      if (!isActiveRef.current) return;

      // Parse the URL from the tag
      const parsed = parseTapSyncUrl(url);
      if (!parsed) {
        setNfcState({
          status: 'error',
          code: 'UNKNOWN',
          message: 'This card doesn\'t contain a TapSync profile.',
        });
        return;
      }

      // Resolve publicId (may need custom-name lookup)
      let publicId: string;
      if (parsed.type === 'customName') {
        const nameError = validateCustomName(parsed.value);
        if (nameError) {
          setNfcState({ status: 'error', code: 'UNKNOWN', message: nameError });
          return;
        }
        try {
          publicId = await resolveCustomNameToPublicId(parsed.value);
        } catch {
          if (!isActiveRef.current) return;
          setNfcState({
            status: 'error',
            code: 'UNKNOWN',
            message: 'Could not find the profile on this card.',
          });
          return;
        }
      } else {
        const idError = validatePublicId(parsed.value);
        if (idError) {
          setNfcState({ status: 'error', code: 'UNKNOWN', message: idError });
          return;
        }
        publicId = parsed.value;
      }

      if (!isActiveRef.current) return;
      setNfcState({ status: 'saving' });

      const result = await saveContact(publicId, 'nfc');

      if (!isActiveRef.current) return;

      if (result.pending) {
        onSavePending();
      } else {
        setNfcState({ status: 'success' });
        onSaveSuccess(publicId);
      }
    } catch (err) {
      if (!isActiveRef.current) return;

      if (err instanceof NfcError) {
        if (err.code === ('UNSUPPORTED' as NfcErrorCode)) {
          setNfcState({ status: 'unsupported' });
        } else if (err.code === ('DISABLED' as NfcErrorCode)) {
          setNfcState({ status: 'disabled' });
        } else {
          setNfcState({ status: 'error', code: err.code, message: err.message });
        }
      } else if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'OWN_CARD'
      ) {
        setNfcState({ status: 'own-card' });
        onOwnCard();
      } else {
        setNfcState({
          status: 'error',
          code: 'UNKNOWN',
          message: (err as Error)?.message ?? 'Unexpected error',
        });
      }
    }
  }, [nfcState.status, saveContact, onSaveSuccess, onSavePending, onOwnCard]);

  const handleCancel = useCallback(async () => {
    await nfcService.cancel();
    setNfcState({ status: 'idle' });
  }, []);

  const handleReset = useCallback(() => {
    setNfcState({ status: 'idle' });
  }, []);

  // ── Render by state ──────────────────────────────────────────────────────

  if (nfcState.status === 'unsupported') {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.modeIcon}>📵</Text>
        <Text style={styles.modeTitle}>NFC Not Available</Text>
        <Text style={styles.modeDescription}>
          This device does not support NFC.{'\n'}Use the Link tab to add a contact manually.
        </Text>
      </View>
    );
  }

  if (nfcState.status === 'disabled') {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.modeIcon}>📴</Text>
        <Text style={styles.modeTitle}>NFC Turned Off</Text>
        <Text style={styles.modeDescription}>
          Enable NFC in your device Settings, then come back.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleReset}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (nfcState.status === 'scanning') {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator
          size="large"
          color="#0066CC"
          accessibilityLabel="Scanning for NFC card"
        />
        <Text style={styles.modeTitle}>Ready to Scan</Text>
        <Text style={styles.modeDescription}>
          Hold your phone near the back of the TapSync card
        </Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => void handleCancel()}
          accessibilityRole="button"
          accessibilityLabel="Cancel NFC scan"
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (nfcState.status === 'saving') {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator
          size="large"
          color="#0066CC"
          accessibilityLabel="Saving contact"
        />
        <Text style={styles.modeTitle}>Saving…</Text>
      </View>
    );
  }

  if (nfcState.status === 'own-card') {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.modeIcon}>🪪</Text>
        <Text style={styles.modeTitle}>That's Your Card</Text>
        <Text style={styles.modeDescription}>
          You can't add yourself to your own network.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleReset}
          accessibilityRole="button"
          accessibilityLabel="Try scanning a different card"
        >
          <Text style={styles.primaryButtonText}>Scan Another Card</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (nfcState.status === 'error') {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.modeIcon}>⚠️</Text>
        <Text style={styles.modeTitle}>Scan Failed</Text>
        <Text style={styles.modeDescription}>
          {nfcErrorLabel(nfcState.code)}
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleReset}
          accessibilityRole="button"
          accessibilityLabel="Try NFC scan again"
        >
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // idle / success (success is transient — navigation happens immediately)
  return (
    <View style={styles.centerContent}>
      <Text style={styles.modeIcon}>📱</Text>
      <Text style={styles.modeTitle}>Scan a Card</Text>
      <Text style={styles.modeDescription}>
        Tap the button below, then hold your phone near{'\n'}the back of the TapSync card
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => void handleScan()}
        accessibilityRole="button"
        accessibilityLabel="Start NFC scan"
        accessibilityHint="Activates NFC to read a TapSync card"
      >
        <Text style={styles.primaryButtonText}>Start Scan</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// QR Tab
// ---------------------------------------------------------------------------

interface QrTabProps {
  onSaveSuccess: (publicId: string) => void;
  onSavePending: () => void;
  onOwnCard: () => void;
}

function QrTab({ onSaveSuccess, onSavePending, onOwnCard }: QrTabProps) {
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { saveContact } = useNetworkUpsert();

  const handleSave = useCallback(async () => {
    setErrorMsg(null);
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a profile URL.');
      return;
    }

    const parsed = parseTapSyncUrl(trimmed);
    if (!parsed) {
      setErrorMsg(
        'Unrecognized URL. Use a tapsync:// link or https://tapsync.app/c/… address.',
      );
      return;
    }

    let publicId: string;
    if (parsed.type === 'customName') {
      const nameError = validateCustomName(parsed.value);
      if (nameError) {
        setErrorMsg(nameError);
        return;
      }
      setIsSaving(true);
      try {
        publicId = await resolveCustomNameToPublicId(parsed.value);
      } catch {
        setIsSaving(false);
        setErrorMsg('Could not find this profile. Check the URL and try again.');
        return;
      }
    } else {
      const idError = validatePublicId(parsed.value);
      if (idError) {
        setErrorMsg(idError);
        return;
      }
      publicId = parsed.value;
      setIsSaving(true);
    }

    try {
      const result = await saveContact(publicId, 'qr');
      if (result.pending) {
        onSavePending();
      } else {
        onSaveSuccess(publicId);
      }
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'OWN_CARD'
      ) {
        onOwnCard();
        setIsSaving(false);
        return;
      }
      setErrorMsg((err as Error)?.message ?? 'Could not save contact. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [urlInput, saveContact, onSaveSuccess, onSavePending, onOwnCard]);

  return (
    <ScrollView
      style={styles.tabScrollView}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.modeTitle}>Scan QR Code</Text>
      <Text style={styles.modeDescription}>
        Scan the TapSync QR code with your phone's camera app, then paste the link below.
      </Text>

      <View style={styles.cameraNotice} accessibilityRole="note">
        <Text style={styles.cameraNoticeText}>
          📷  In-app QR scanning is not available in this build.{'\n'}
          Use your phone's native camera to scan the QR code, then paste the URL here.
        </Text>
      </View>

      <Text style={styles.inputLabel}>Profile URL from QR code</Text>
      <TextInput
        style={[styles.urlInput, errorMsg ? styles.urlInputError : null]}
        value={urlInput}
        onChangeText={(t) => {
          setUrlInput(t);
          setErrorMsg(null);
        }}
        placeholder="https://tapsync.app/c/…"
        placeholderTextColor="#9CA3AF"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={() => void handleSave()}
        accessibilityLabel="Profile URL from QR code"
        editable={!isSaving}
      />
      {errorMsg ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {errorMsg}
        </Text>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
        onPress={() => void handleSave()}
        disabled={isSaving}
        accessibilityRole="button"
        accessibilityLabel="Save contact from QR URL"
        accessibilityState={{ disabled: isSaving }}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Save Contact</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Link Tab
// ---------------------------------------------------------------------------

interface LinkTabProps {
  onSaveSuccess: (publicId: string) => void;
  onSavePending: () => void;
  onOwnCard: () => void;
}

function LinkTab({ onSaveSuccess, onSavePending, onOwnCard }: LinkTabProps) {
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { saveContact } = useNetworkUpsert();

  const handleSave = useCallback(async () => {
    setErrorMsg(null);
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setErrorMsg('Please paste a TapSync link.');
      return;
    }

    const parsed = parseTapSyncUrl(trimmed);
    if (!parsed) {
      setErrorMsg(
        'Unrecognized link. Try tapsync://c/… or https://tapsync.app/c/…',
      );
      return;
    }

    let publicId: string;
    if (parsed.type === 'customName') {
      const nameError = validateCustomName(parsed.value);
      if (nameError) {
        setErrorMsg(nameError);
        return;
      }
      setIsSaving(true);
      try {
        publicId = await resolveCustomNameToPublicId(parsed.value);
      } catch {
        setIsSaving(false);
        setErrorMsg('Could not find this profile. The link may be invalid or expired.');
        return;
      }
    } else {
      const idError = validatePublicId(parsed.value);
      if (idError) {
        setErrorMsg(idError);
        return;
      }
      publicId = parsed.value;
      setIsSaving(true);
    }

    try {
      const result = await saveContact(publicId, 'link');
      if (result.pending) {
        onSavePending();
      } else {
        onSaveSuccess(publicId);
      }
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'OWN_CARD'
      ) {
        onOwnCard();
        setIsSaving(false);
        return;
      }
      setErrorMsg((err as Error)?.message ?? 'Could not save contact. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [urlInput, saveContact, onSaveSuccess, onSavePending, onOwnCard]);

  return (
    <ScrollView
      style={styles.tabScrollView}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.modeTitle}>Paste a Link</Text>
      <Text style={styles.modeDescription}>
        Paste a TapSync link shared by someone else to add them to your network.
      </Text>

      <Text style={styles.inputLabel}>TapSync link</Text>
      <TextInput
        style={[styles.urlInput, errorMsg ? styles.urlInputError : null]}
        value={urlInput}
        onChangeText={(t) => {
          setUrlInput(t);
          setErrorMsg(null);
        }}
        placeholder="tapsync://c/… or https://tapsync.app/c/…"
        placeholderTextColor="#9CA3AF"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={() => void handleSave()}
        accessibilityLabel="TapSync link"
        editable={!isSaving}
      />
      {errorMsg ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {errorMsg}
        </Text>
      ) : null}

      <View style={styles.linkFormats} accessibilityRole="note">
        <Text style={styles.linkFormatsTitle}>Accepted formats</Text>
        <Text style={styles.linkFormatsItem}>• tapsync://c/{'{publicId}'}</Text>
        <Text style={styles.linkFormatsItem}>• tapsync://p/{'{name}'}</Text>
        <Text style={styles.linkFormatsItem}>• https://tapsync.app/c/{'{publicId}'}</Text>
        <Text style={styles.linkFormatsItem}>• https://tapsync.app/p/{'{name}'}</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
        onPress={() => void handleSave()}
        disabled={isSaving}
        accessibilityRole="button"
        accessibilityLabel="Save contact from link"
        accessibilityState={{ disabled: isSaving }}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>Save Contact</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AddContactScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<CaptureMode>('nfc');
  const [ownCardMsg, setOwnCardMsg] = useState(false);

  const handleSaveSuccess = useCallback(
    (publicId: string) => {
      router.replace({
        pathname: '/(tabs)/network',
        params: { highlight: publicId },
      });
    },
    [router],
  );

  const handleSavePending = useCallback(() => {
    router.replace('/(tabs)/network' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleOwnCard = useCallback(() => {
    setOwnCardMsg(true);
    // Auto-dismiss after 3 s
    setTimeout(() => setOwnCardMsg(false), 3000);
  }, []);

  const handleModeChange = useCallback((newMode: CaptureMode) => {
    setMode(newMode);
    setOwnCardMsg(false);
  }, []);

  const modeButtons: { id: CaptureMode; label: string; accessibilityHint: string }[] = [
    { id: 'nfc', label: 'NFC Card', accessibilityHint: 'Scan a TapSync NFC card' },
    { id: 'qr', label: 'QR Code', accessibilityHint: 'Scan or paste a QR code URL' },
    { id: 'link', label: 'Link', accessibilityHint: 'Paste a TapSync link' },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Add Contact',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {/* ── Mode selector ───────────────────────────────────────────── */}
      <View style={styles.modeSelector} accessibilityRole="tablist">
        {modeButtons.map(({ id, label, accessibilityHint }) => (
          <TouchableOpacity
            key={id}
            style={[
              styles.modeButton,
              mode === id && styles.modeButtonActive,
            ]}
            onPress={() => handleModeChange(id)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ selected: mode === id }}
          >
            <Text
              style={[
                styles.modeButtonText,
                mode === id && styles.modeButtonTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Own-card inline message ─────────────────────────────────── */}
      {ownCardMsg && (
        <View style={styles.ownCardBanner} accessibilityRole="alert">
          <Text style={styles.ownCardBannerText}>
            🪪  This is your own card — you can't add yourself.
          </Text>
        </View>
      )}

      {/* ── Tab content ─────────────────────────────────────────────── */}
      <View style={styles.tabContent}>
        {mode === 'nfc' && (
          <NfcTab
            onSaveSuccess={handleSaveSuccess}
            onSavePending={handleSavePending}
            onOwnCard={handleOwnCard}
          />
        )}
        {mode === 'qr' && (
          <QrTab
            onSaveSuccess={handleSaveSuccess}
            onSavePending={handleSavePending}
            onOwnCard={handleOwnCard}
          />
        )}
        {mode === 'link' && (
          <LinkTab
            onSaveSuccess={handleSaveSuccess}
            onSavePending={handleSavePending}
            onOwnCard={handleOwnCard}
          />
        )}
      </View>
    </View>
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

  // Header close button
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Mode selector (tab bar)
  modeSelector: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modeButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  modeButtonTextActive: {
    color: '#111827',
    fontWeight: '600',
  },

  // Own-card banner
  ownCardBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  ownCardBannerText: {
    fontSize: 14,
    color: '#C2410C',
    fontWeight: '500',
    textAlign: 'center',
  },

  // Tab content area
  tabContent: {
    flex: 1,
  },

  // Centered content (used by NFC idle/error/scanning states)
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },

  // Scroll-based tab content (QR and Link tabs)
  tabScrollView: {
    flex: 1,
  },
  tabScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 12,
  },

  // Mode content typography
  modeIcon: {
    fontSize: 56,
    lineHeight: 64,
  },
  modeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  modeDescription: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Camera notice (QR tab)
  cameraNotice: {
    padding: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 4,
  },
  cameraNoticeText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },

  // URL input
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 4,
  },
  urlInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    color: '#111827',
    minHeight: 48,
  },
  urlInputError: {
    borderColor: '#DC2626',
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    marginTop: -4,
  },

  // Link formats hint (Link tab)
  linkFormats: {
    padding: 14,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 4,
  },
  linkFormatsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  linkFormatsItem: {
    fontSize: 12,
    color: '#1D4ED8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  // Buttons
  primaryButton: {
    backgroundColor: '#0066CC',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginTop: 4,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
});
