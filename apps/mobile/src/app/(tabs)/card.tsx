/**
 * NFC Card programming and management screen
 *
 * Two views within the same tab:
 *   1. ProgramCardView  — guidance + animated waiting state + success/error
 *   2. CardListView     — list of bound cards, label edit, unassign
 *
 * Program flow (Tasks 20.3 + 20.4):
 *   a. Fetch program-payload URL from API
 *   b. Call startWrite(url) → useNfcWriter drives the state machine
 *   c. On 'success', call bindCard(uid) via useBindCard
 *   d. Handle ALREADY_BOUND gracefully (own card = ok, other account = error)
 *   e. After first card bind, call checkFirstCardProgrammed() (Req 1.9)
 *   f. Navigate to the card list view
 *
 * Requirements: 7.1–7.12
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useSecurityWarning } from '../../features/auth';
import {
  useCardProgramPayload,
  useCards,
  useBindCard,
  useUnassignCard,
  useLabelCard,
  type NfcCard,
} from '../../features/cards';
import { useNfcWriter } from '../../features/nfc';

// ─── Screen-level state ───────────────────────────────────────────────────────

type Screen = 'list' | 'program';

// ─────────────────────────────────────────────────────────────────────────────
// Main exported screen
// ─────────────────────────────────────────────────────────────────────────────

export default function CardScreen() {
  const [screen, setScreen] = useState<Screen>('list');

  // After a successful bind we navigate back to the list and refresh it.
  const handleProgramSuccess = useCallback(() => {
    setScreen('list');
  }, []);

  if (screen === 'program') {
    return (
      <ProgramCardView
        onBack={() => setScreen('list')}
        onSuccess={handleProgramSuccess}
      />
    );
  }

  return (
    <CardListView onProgramNew={() => setScreen('program')} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CardListView
// ─────────────────────────────────────────────────────────────────────────────

interface CardListViewProps {
  onProgramNew: () => void;
}

function CardListView({ onProgramNew }: CardListViewProps) {
  const { data: cards, isLoading, refetch } = useCards();
  const { mutateAsync: unassign, isPending: isUnassigning } = useUnassignCard();
  const { mutateAsync: saveLabel, isPending: isSavingLabel } = useLabelCard();

  // DEBUG: Log the cards data structure
  useEffect(() => {
    if (cards && cards.length > 0) {
      console.log('[DEBUG] Cards data:', JSON.stringify(cards[0], null, 2));
      console.log('[DEBUG] First card keys:', Object.keys(cards[0]));
    }
  }, [cards]);

  // Track which card is currently being label-edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  const handleStartEdit = (card: NfcCard) => {
    const cardId = (card as any)._id || card.id;
    setEditingId(cardId);
    setLabelDraft(card.label ?? '');
  };

  const handleSaveLabel = async (card: NfcCard) => {
    const cardId = (card as any)._id || card.id;
    const trimmed = labelDraft.trim();
    try {
      await saveLabel({ id: cardId, label: trimmed });
    } catch {
      Alert.alert('Error', 'Could not save the label. Please try again.');
    } finally {
      setEditingId(null);
    }
  };

  const handleUnassign = (card: NfcCard) => {
    const cardId = (card as any)._id || card.id;
    Alert.alert(
      'Remove card?',
      `This will unassign the card${card.label ? ` "${card.label}"` : ''} from your account. The card can be re-programmed later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[DEBUG] Attempting to unassign card:', cardId);
              await unassign(cardId);
              console.log('[DEBUG] Card unassigned successfully');
            } catch (error) {
              console.error('[ERROR] Failed to unassign card:', error);
              console.error('[ERROR] Card ID:', cardId);
              console.error('[ERROR] Error details:', JSON.stringify(error, null, 2));
              Alert.alert('Error', 'Could not remove the card. Please try again.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Cards</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={onProgramNew}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Program a new NFC card"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.centeredFeedback}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.feedbackText}>Loading cards…</Text>
          </View>
        ) : !cards || cards.length === 0 ? (
          <EmptyCardList onProgramNew={onProgramNew} />
        ) : (
          cards.map((card, index) => {
            // Ensure we have a unique string key
            const cardId = card._id?.toString() || card.id?.toString() || '';
            const uniqueKey = cardId || `card-${card.uid}-${index}`;
            
            return (
            <View key={uniqueKey} style={styles.cardItem}>
              {/* UID + status badge */}
              <View style={styles.cardItemHeader}>
                <Text style={styles.cardUid} numberOfLines={1}>
                  {formatUid(card.uid)}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    card.status === 'active'
                      ? styles.statusBadgeActive
                      : styles.statusBadgeUnassigned,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      card.status === 'active'
                        ? styles.statusBadgeTextActive
                        : styles.statusBadgeTextUnassigned,
                    ]}
                  >
                    {card.status}
                  </Text>
                </View>
              </View>

              {/* Label row or edit field */}
              {editingId === ((card as any)._id || card.id) ? (
                <View style={styles.labelEditRow}>
                  <TextInput
                    style={styles.labelInput}
                    value={labelDraft}
                    onChangeText={setLabelDraft}
                    placeholder="e.g. Wallet, Keychain…"
                    placeholderTextColor="#9CA3AF"
                    maxLength={40}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => handleSaveLabel(card)}
                    accessibilityLabel="Card label"
                  />
                  <TouchableOpacity
                    style={styles.labelSaveButton}
                    onPress={() => handleSaveLabel(card)}
                    disabled={isSavingLabel}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Save label"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {isSavingLabel ? (
                      <ActivityIndicator size="small" color="#3B82F6" />
                    ) : (
                      <Text style={styles.labelSaveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.labelCancelButton}
                    onPress={() => setEditingId(null)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel editing label"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.labelCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.labelRow}>
                  <Text style={styles.cardLabel} numberOfLines={1}>
                    {card.label ? card.label : 'No label'}
                  </Text>
                  <TouchableOpacity
                    style={styles.editLabelButton}
                    onPress={() => handleStartEdit(card)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Edit card label"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.editLabelButtonText}>Edit label</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Last programmed date */}
              {card.lastProgrammedAt ? (
                <Text style={styles.cardMeta}>
                  Last programmed{' '}
                  {new Date(card.lastProgrammedAt).toLocaleDateString()}
                </Text>
              ) : null}

              {/* Unassign */}
              <TouchableOpacity
                style={styles.unassignButton}
                onPress={() => handleUnassign(card)}
                disabled={isUnassigning}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Remove this card"
              >
                <Text style={styles.unassignButtonText}>Remove card</Text>
              </TouchableOpacity>
            </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function EmptyCardList({ onProgramNew }: { onProgramNew: () => void }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>💳</Text>
      <Text style={styles.emptyStateTitle}>No cards yet</Text>
      <Text style={styles.emptyStateBody}>
        Program an NTAG215 NFC card with your profile URL so anyone can tap it
        and instantly see your links.
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onProgramNew}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Program your first NFC card"
      >
        <Text style={styles.primaryButtonText}>Program a card</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProgramCardView
// ─────────────────────────────────────────────────────────────────────────────

interface ProgramCardViewProps {
  onBack: () => void;
  onSuccess: () => void;
}

function ProgramCardView({ onBack, onSuccess }: ProgramCardViewProps) {
  const router = useRouter();
  const { checkFirstCardProgrammed } = useSecurityWarning();
  const { data: payload, isLoading: isLoadingPayload, error: payloadError } =
    useCardProgramPayload();
  const { state, startWrite, cancel, reset } = useNfcWriter();
  const { mutateAsync: bindCardMutation, isPending: isBinding } = useBindCard();

  // Pulsing animation for the waiting/writing/verifying state.
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  // Track whether we've already initiated the bind to avoid double-binding.
  const hasBound = useRef(false);

  const isInProgress =
    state.status === 'waiting' ||
    state.status === 'writing' ||
    state.status === 'verifying';

  // ── Pulse animation ────────────────────────────────────────────────────────

  useEffect(() => {
    if (isInProgress) {
      // Start looping pulse.
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.18,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
    }

    return () => {
      pulseRef.current?.stop();
    };
  }, [isInProgress, pulseAnim]);

  // ── Bind after verified write ──────────────────────────────────────────────
  // Req 7.5: after a verified write, call the API to bind the card UID.

  useEffect(() => {
    if (state.status !== 'success' || hasBound.current) return;

    hasBound.current = true;

    (async () => {
      try {
        const result = await bindCardMutation(state.uid);

        if (result.alreadyBound) {
          // Card already belongs to this user — treat as success but note it.
          // We still call checkFirstCardProgrammed in case this is relevant.
        }

        // Req 1.9: re-show security warning after first card if unsecured.
        await checkFirstCardProgrammed();

        // Navigate back to the card list.
        onSuccess();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Could not register the card. Please try again.';

        Alert.alert('Card not registered', message, [
          {
            text: 'OK',
            onPress: () => {
              // Let the user retry the whole flow.
              hasBound.current = false;
              reset();
            },
          },
        ]);
      }
    })();
  }, [
    state,
    bindCardMutation,
    checkFirstCardProgrammed,
    onSuccess,
    reset,
  ]);

  // Reset hasBound when state goes back to idle/error so retries work.
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'error') {
      hasBound.current = false;
    }
  }, [state.status]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    if (!payload?.url) return;
    startWrite(payload.url);
  }, [payload, startWrite]);

  const handleCancel = useCallback(async () => {
    await cancel();
  }, [cancel]);

  const handleRetry = useCallback(() => {
    reset();
  }, [reset]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  // ── Payload loading error ──────────────────────────────────────────────────

  if (payloadError) {
    return (
      <SafeAreaWrapper>
        <BackButton onPress={onBack} />
        <View style={styles.feedbackContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.feedbackTitle}>Could not load profile URL</Text>
          <Text style={styles.feedbackBody}>
            Check your connection and try again.
          </Text>
        </View>
      </SafeAreaWrapper>
    );
  }

  // ── NFC unsupported ────────────────────────────────────────────────────────
  // Req 7.2: clear message and disable the write flow.

  if (state.status === 'unsupported') {
    return (
      <SafeAreaWrapper>
        <BackButton onPress={onBack} />
        <View style={styles.feedbackContainer}>
          <Text style={styles.errorIcon}>📵</Text>
          <Text style={styles.feedbackTitle}>NFC not supported</Text>
          <Text style={styles.feedbackBody}>
            Your device does not have NFC hardware, so you cannot program cards.
          </Text>
        </View>
      </SafeAreaWrapper>
    );
  }

  // ── NFC disabled ───────────────────────────────────────────────────────────
  // Req 7.1: guide the Owner to enable NFC if off.

  if (state.status === 'disabled') {
    return (
      <SafeAreaWrapper>
        <BackButton onPress={onBack} />
        <View style={styles.feedbackContainer}>
          <Text style={styles.errorIcon}>📴</Text>
          <Text style={styles.feedbackTitle}>NFC is turned off</Text>
          <Text style={styles.feedbackBody}>
            Enable NFC in your device settings to program a card.
          </Text>
          {Platform.OS === 'android' && (
            <TouchableOpacity
              style={[styles.primaryButton, styles.settingsButton]}
              onPress={handleOpenSettings}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Open device settings to enable NFC"
            >
              <Text style={styles.primaryButtonText}>Open Settings</Text>
            </TouchableOpacity>
          )}
          {Platform.OS === 'ios' && (
            <Text style={styles.iosSettingsNote}>
              On iPhone, go to Settings → NFC to enable it.
            </Text>
          )}
        </View>
      </SafeAreaWrapper>
    );
  }

  return (
    <SafeAreaWrapper>
      <BackButton onPress={onBack} />

      <ScrollView
        contentContainerStyle={styles.programContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title and guidance */}
        <Text style={styles.programTitle}>Program a card</Text>
        <Text style={styles.programSubtitle}>
          Hold an NTAG215 NFC card flat against the back of your phone.
        </Text>

        {/* Animated NFC area */}
        <View style={styles.nfcAnimationArea}>
          {/* Outer ring (always visible) */}
          <View style={styles.nfcRingOuter} />

          {/* Pulsing inner circle */}
          <Animated.View
            style={[
              styles.nfcRingInner,
              { transform: [{ scale: pulseAnim }] },
              isInProgress && styles.nfcRingInnerActive,
              state.status === 'success' && styles.nfcRingInnerSuccess,
              state.status === 'error' && styles.nfcRingInnerError,
            ]}
          >
            <NfcStatusIcon status={state.status} isBinding={isBinding} />
          </Animated.View>
        </View>

        {/* Status label */}
        <NfcStatusLabel
          status={state.status}
          isBinding={isBinding}
          isLoadingPayload={isLoadingPayload}
        />

        {/* Error detail for specific error codes */}
        {state.status === 'error' && (
          <View style={styles.errorDetailBox}>
            <Text style={styles.errorDetailText}>
              {getErrorDetail(state.code)}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {/* Idle: Start button */}
          {state.status === 'idle' && (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!payload || isLoadingPayload) && styles.primaryButtonDisabled,
              ]}
              onPress={handleStart}
              disabled={!payload || isLoadingPayload}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Start programming the NFC card"
            >
              {isLoadingPayload ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Start</Text>
              )}
            </TouchableOpacity>
          )}

          {/* In-progress: Cancel button */}
          {isInProgress && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancel NFC programming"
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}

          {/* Binding: spinner, no action available */}
          {state.status === 'success' && isBinding && (
            <View style={styles.bindingRow}>
              <ActivityIndicator color="#3B82F6" />
              <Text style={styles.bindingText}>Registering card…</Text>
            </View>
          )}

          {/* Error: Retry button */}
          {state.status === 'error' && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleRetry}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Retry programming the NFC card"
            >
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Guidance steps */}
        {state.status === 'idle' && !isLoadingPayload && payload && (
          <View style={styles.guidanceBox}>
            <Text style={styles.guidanceTitle}>How it works</Text>
            <GuidanceStep
              number={1}
              text={'Tap "Start" — your phone will listen for an NFC card.'}
            />
            <GuidanceStep
              number={2}
              text="Hold the card flat against the back of your phone."
            />
            <GuidanceStep
              number={3}
              text={'Keep it steady until you see "Card programmed successfully!"'}
            />
            <GuidanceStep
              number={4}
              text="Anyone who taps your card will see your profile instantly."
            />
          </View>
        )}

        {/* Help link — Requirements 11.1–11.5, 7.12 */}
        <TouchableOpacity
          style={styles.helpLink}
          onPress={() => router.push('/nfc-help')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Learn how tapping works"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.helpLinkText}>How does tapping work?</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SafeAreaWrapper({ children }: { children: React.ReactNode }) {
  return <View style={styles.container}>{children}</View>;
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.backButton}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Go back to card list"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.backButtonText}>‹ Cards</Text>
    </TouchableOpacity>
  );
}

function GuidanceStep({ number, text }: { number: number; text: string }) {
  return (
    <View style={styles.guidanceStep}>
      <View style={styles.guidanceStepNumber}>
        <Text style={styles.guidanceStepNumberText}>{number}</Text>
      </View>
      <Text style={styles.guidanceStepText}>{text}</Text>
    </View>
  );
}

type AnyStatus = ReturnType<typeof useNfcWriter>['state']['status'];

function NfcStatusIcon({
  status,
  isBinding,
}: {
  status: AnyStatus;
  isBinding: boolean;
}) {
  if (status === 'success' && isBinding) {
    return <ActivityIndicator size="large" color="#3B82F6" />;
  }
  if (status === 'success') {
    return <Text style={styles.nfcIconText}>✓</Text>;
  }
  if (status === 'error') {
    return <Text style={styles.nfcIconText}>✕</Text>;
  }
  if (
    status === 'waiting' ||
    status === 'writing' ||
    status === 'verifying'
  ) {
    return <Text style={styles.nfcIconTextWaiting}>📶</Text>;
  }
  // idle / unsupported / disabled
  return <Text style={styles.nfcIconTextIdle}>📱</Text>;
}

function NfcStatusLabel({
  status,
  isBinding,
  isLoadingPayload,
}: {
  status: AnyStatus;
  isBinding: boolean;
  isLoadingPayload: boolean;
}) {
  if (isLoadingPayload && status === 'idle') {
    return (
      <Text style={styles.statusLabel}>Preparing…</Text>
    );
  }

  const labels: Partial<Record<AnyStatus, string>> = {
    idle: 'Ready to program',
    waiting: 'Hold card steady…',
    writing: 'Writing to card…',
    verifying: 'Verifying write…',
    success: isBinding ? 'Registering card…' : 'Card programmed successfully!',
    error: 'Something went wrong',
  };

  const label = labels[status] ?? '';
  const isSuccess = status === 'success' && !isBinding;
  const isError = status === 'error';

  return (
    <Text
      style={[
        styles.statusLabel,
        isSuccess && styles.statusLabelSuccess,
        isError && styles.statusLabelError,
      ]}
    >
      {label}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Human-readable detail for each NfcErrorCode.
 * Requirements: 7.6, 7.7
 */
function getErrorDetail(code: string): string {
  switch (code) {
    case 'NOT_WRITABLE':
      return 'This card is read-only and cannot be programmed. Please use a new NTAG215 card.';
    case 'TOO_SMALL':
      return 'This card does not have enough memory. Please use an NTAG215 card.';
    case 'TAG_LOST':
      return 'The card was moved away too soon. Hold it firmly against the back of your phone and try again.';
    case 'TIMEOUT':
      return 'No card was detected in time. Make sure the card is flat against the back of your phone.';
    case 'USER_CANCELLED':
      return 'The operation was cancelled. Tap "Try again" when you\'re ready.';
    case 'VERIFY_FAILED':
      return 'The card was written but the data could not be verified. Try again with the same card.';
    case 'ALREADY_BOUND':
      return 'This card is already registered to another account.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/** Show UID as uppercase hex groups: "04:AB:12:…" */
function formatUid(uid: string): string {
  const upper = uid.toUpperCase().replace(/[^0-9A-F]/g, '');
  // Group into pairs
  const pairs = upper.match(/.{1,2}/g) ?? [upper];
  return pairs.join(':');
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const BLUE = '#3B82F6';
const BLUE_LIGHT = '#EFF6FF';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#F0FDF4';
const RED = '#DC2626';
const RED_LIGHT = '#FEF2F2';
const GRAY_50 = '#F9FAFB';
const GRAY_100 = '#F3F4F6';
const GRAY_200 = '#E5E7EB';
const GRAY_400 = '#9CA3AF';
const GRAY_600 = '#4B5563';
const GRAY_700 = '#374151';
const GRAY_900 = '#111827';

const styles = StyleSheet.create({
  // ── Layout ────────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: GRAY_50,
  },
  scrollView: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  programContent: {
    padding: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: GRAY_200,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: GRAY_900,
  },
  headerButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: BLUE,
  },

  // ── Back button ───────────────────────────────────────────────────────────
  backButton: {
    minHeight: 44,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 16,
    color: BLUE,
    fontWeight: '500',
  },

  // ── Card item ─────────────────────────────────────────────────────────────
  cardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    gap: 8,
  },
  cardItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardUid: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: GRAY_900,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  statusBadgeActive: {
    backgroundColor: GREEN_LIGHT,
  },
  statusBadgeUnassigned: {
    backgroundColor: GRAY_100,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statusBadgeTextActive: {
    color: GREEN,
  },
  statusBadgeTextUnassigned: {
    color: GRAY_600,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardLabel: {
    flex: 1,
    fontSize: 14,
    color: GRAY_600,
  },
  editLabelButton: {
    minHeight: 44,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  editLabelButtonText: {
    fontSize: 14,
    color: BLUE,
    fontWeight: '500',
  },
  labelEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  labelInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: BLUE,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: GRAY_900,
    backgroundColor: '#FFFFFF',
  },
  labelSaveButton: {
    height: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 8,
  },
  labelSaveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  labelCancelButton: {
    height: 44,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  labelCancelButtonText: {
    color: GRAY_600,
    fontSize: 14,
  },
  cardMeta: {
    fontSize: 12,
    color: GRAY_400,
  },
  unassignButton: {
    marginTop: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  unassignButtonText: {
    fontSize: 14,
    color: RED,
    fontWeight: '500',
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyStateIcon: {
    fontSize: 56,
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: GRAY_900,
    textAlign: 'center',
  },
  emptyStateBody: {
    fontSize: 15,
    color: GRAY_600,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Program card view ─────────────────────────────────────────────────────
  programTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: GRAY_900,
    textAlign: 'center',
    marginBottom: 8,
  },
  programSubtitle: {
    fontSize: 15,
    color: GRAY_600,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
    paddingHorizontal: 16,
  },

  // ── NFC animation ─────────────────────────────────────────────────────────
  nfcAnimationArea: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  nfcRingOuter: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: GRAY_200,
    backgroundColor: 'transparent',
  },
  nfcRingInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: BLUE_LIGHT,
    borderWidth: 3,
    borderColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nfcRingInnerActive: {
    backgroundColor: BLUE_LIGHT,
    borderColor: BLUE,
  },
  nfcRingInnerSuccess: {
    backgroundColor: GREEN_LIGHT,
    borderColor: GREEN,
  },
  nfcRingInnerError: {
    backgroundColor: RED_LIGHT,
    borderColor: RED,
  },
  nfcIconText: {
    fontSize: 48,
    fontWeight: '700',
    color: GREEN,
  },
  nfcIconTextWaiting: {
    fontSize: 44,
  },
  nfcIconTextIdle: {
    fontSize: 44,
  },

  // ── Status label ──────────────────────────────────────────────────────────
  statusLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: GRAY_700,
    textAlign: 'center',
    marginBottom: 12,
  },
  statusLabelSuccess: {
    color: GREEN,
  },
  statusLabelError: {
    color: RED,
  },

  // ── Error detail box ──────────────────────────────────────────────────────
  errorDetailBox: {
    backgroundColor: RED_LIGHT,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    width: '100%',
  },
  errorDetailText: {
    fontSize: 14,
    color: RED,
    lineHeight: 20,
    textAlign: 'center',
  },

  // ── Action row ────────────────────────────────────────────────────────────
  actionRow: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  bindingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bindingText: {
    fontSize: 15,
    color: BLUE,
    fontWeight: '500',
  },

  // ── Guidance box ──────────────────────────────────────────────────────────
  guidanceBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  guidanceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: GRAY_900,
    marginBottom: 4,
  },
  guidanceStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  guidanceStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  guidanceStepNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guidanceStepText: {
    flex: 1,
    fontSize: 14,
    color: GRAY_700,
    lineHeight: 20,
  },

  // ── Feedback screens (unsupported / disabled / error) ─────────────────────
  feedbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  errorIcon: {
    fontSize: 56,
    marginBottom: 4,
  },
  feedbackTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: GRAY_900,
    textAlign: 'center',
  },
  feedbackBody: {
    fontSize: 15,
    color: GRAY_600,
    textAlign: 'center',
    lineHeight: 22,
  },
  centeredFeedback: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  feedbackText: {
    fontSize: 15,
    color: GRAY_600,
  },
  iosSettingsNote: {
    fontSize: 14,
    color: GRAY_600,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  settingsButton: {
    marginTop: 8,
  },

  // ── Buttons ───────────────────────────────────────────────────────────────
  primaryButton: {
    height: 52,
    minWidth: 200,
    backgroundColor: BLUE,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  primaryButtonDisabled: {
    backgroundColor: GRAY_400,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    height: 52,
    minWidth: 200,
    backgroundColor: GRAY_100,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: GRAY_700,
  },
  // ── Help link ─────────────────────────────────────────────────────────────
  helpLink: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  helpLinkText: {
    fontSize: 14,
    color: BLUE,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
