/**
 * NFC Help screen — "How tapping works"
 *
 * Explains to the Owner (and indirectly guides them on setting expectations
 * for Visitors):
 *   - What the card contains and what happens when tapped
 *   - Internet requirement for the public page (Req 11.1, 11.2)
 *   - That the OS — not TapSync — controls the tap prompt (Req 11.3)
 *   - iPhone NFC compatibility notes (Req 11.4)
 *   - Android NFC compatibility notes (Req 11.4)
 *   - No app or sign-in required for visitors (Req 11.5)
 *
 * Requirements: 11.1–11.5, 7.12
 */

import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

// ─── Section data ─────────────────────────────────────────────────────────────

interface HelpSection {
  emoji: string;
  title: string;
  body: string;
  bullets?: string[];
}

const SECTIONS: HelpSection[] = [
  {
    emoji: '📇',
    title: 'How it works',
    body: 'Your TapSync card holds a single permanent URL — your profile address. When someone holds any NFC-enabled phone near the card, the phone reads that URL and opens your profile page in their browser automatically.',
  },
  {
    emoji: '🌐',
    title: 'Requires an internet connection',
    body: 'The card only stores a URL. Once the phone reads it, the browser still needs internet to load your profile page and any links on it.',
    bullets: [
      'If the visitor is offline, the phone reads the URL but the page will not open.',
      'There is no offline mode for the public profile page.',
      'All links on the page also require internet to follow.',
    ],
  },
  {
    emoji: '❓',
    title: 'What happens when someone taps',
    body: "Whether the phone shows a confirmation prompt or opens the page directly is decided by the visitor's operating system and their settings — TapSync cannot control this.",
    bullets: [
      'iPhone XS / XR and newer show a banner at the top of the screen. The visitor taps the banner to open the page.',
      'Android behavior varies by brand and settings. Many phones open the page immediately; some ask first.',
      "This is normal. It is not a bug in the card or TapSync's software.",
    ],
  },
  {
    emoji: '🍎',
    title: 'iPhone compatibility',
    body: 'Here is what each iPhone model can do with NFC tags:',
    bullets: [
      'iPhone XS, XR and newer — reads NFC tags automatically in the background. No extra steps needed.',
      'iPhone 7, 8, X — can read tags but needs the NFC reader app or the Control Center tile. Writing cards requires iPhone 7 or newer on iOS 13 or later.',
      'iPhone 6s and older — NFC is not supported for reading tags.',
      'Writing NFC cards (to program your TapSync card) requires iPhone 7 or newer running iOS 13 or later.',
    ],
  },
  {
    emoji: '🤖',
    title: 'Android compatibility',
    body: 'Most modern Android phones support NFC, but there are a few things to keep in mind:',
    bullets: [
      'NFC must be turned on. Go to Settings → Connected devices (or similar) → NFC.',
      'Nearly all mid-range and flagship Android phones from 2016 onward have NFC.',
      'Some budget phones and tablets do not include NFC hardware.',
      'Behavior after a tap varies by manufacturer — some open the page instantly, others show a notification.',
    ],
  },
  {
    emoji: '👤',
    title: 'No app required for visitors',
    body: 'Visitors do not need to install TapSync or sign in to view your profile. The page works in any mobile browser.',
    bullets: [
      'The "Save to My Network" button on your profile page lets visitors save your contact if they have the TapSync app.',
      'A "Get the app" link is shown next to it for visitors who do not have the app yet.',
      'You never need to ask anyone to install anything just to share your details.',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function NfcHelpScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      {/* ── Back button ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page header ─────────────────────────────────────────────── */}
        <Text style={styles.pageTitle}>How tapping works</Text>
        <Text style={styles.pageSubtitle}>
          Everything you need to know about sharing your TapSync card.
        </Text>

        {/* ── Help sections ───────────────────────────────────────────── */}
        {SECTIONS.map((section) => (
          <HelpCard key={section.title} section={section} />
        ))}

        {/* Bottom padding */}
        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HelpCard sub-component
// ─────────────────────────────────────────────────────────────────────────────

function HelpCard({ section }: { section: HelpSection }) {
  return (
    <View style={styles.card}>
      {/* Card header row */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji} accessibilityElementsHidden>
          {section.emoji}
        </Text>
        <Text style={styles.cardTitle}>{section.title}</Text>
      </View>

      {/* Body paragraph */}
      <Text style={styles.cardBody}>{section.body}</Text>

      {/* Optional bullet list */}
      {section.bullets && section.bullets.length > 0 && (
        <View style={styles.bulletList}>
          {section.bullets.map((bullet, index) => (
            <View key={index} style={styles.bulletRow}>
              <Text style={styles.bulletDot} accessibilityElementsHidden>
                •
              </Text>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const BLUE = '#3B82F6';
const GRAY_50 = '#F9FAFB';
const GRAY_200 = '#E5E7EB';
const GRAY_600 = '#4B5563';
const GRAY_700 = '#374151';
const GRAY_900 = '#111827';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: GRAY_50,
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

  // ── Scroll ────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },

  // ── Page header ───────────────────────────────────────────────────────────
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: GRAY_900,
    marginBottom: 6,
  },
  pageSubtitle: {
    fontSize: 15,
    color: GRAY_600,
    lineHeight: 22,
    marginBottom: 8,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  cardEmoji: {
    fontSize: 26,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: GRAY_900,
    flexShrink: 1,
  },
  cardBody: {
    fontSize: 14,
    color: GRAY_700,
    lineHeight: 21,
  },

  // ── Bullet list ───────────────────────────────────────────────────────────
  bulletList: {
    gap: 6,
    marginTop: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    fontSize: 14,
    color: BLUE,
    lineHeight: 21,
    marginTop: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: GRAY_700,
    lineHeight: 21,
  },

  // ── Bottom padding ────────────────────────────────────────────────────────
  bottomPad: {
    height: 16,
  },

  // ── Divider (unused, kept for extensibility) ──────────────────────────────
  divider: {
    height: 1,
    backgroundColor: GRAY_200,
    marginVertical: 4,
  },
});
