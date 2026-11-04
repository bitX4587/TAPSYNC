/**
 * Dashboard / Home screen
 *
 * Displays:
 * - Security warning banner (if account not secured)
 * - "Add your name" prompt on first open if name not set
 * - Profile preview card (avatar, name, designation, view public page)
 * - Mode toggle: Casual / Work, prominent, with optimistic update + rollback
 * - Quick stats card (views, link clicks, contact saves for selectable range)
 *
 * Requirements:
 *   1.9  — security warning banner
 *   2.3  — add name prompt; "TapSync user" placeholder on public page
 *   4.2  — mode toggle updates Active Mode
 *   4.4  — app reopened → displays Active Mode as stored on server
 *   4.5  — network failure reverts optimistic state and shows error message
 *   4.7  — mode toggle is exposed on the dashboard home screen
 *   8.4  — analytics totals for selectable ranges (quick stats card)
 *   8.5  — per-link click counts (summary surfaced on dashboard)
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import {
  SecurityWarningBanner,
  AddNamePrompt,
  ModeToggle,
  ProfilePreviewCard,
  QuickStatsCard,
} from '../../components';
import { useSecurityWarning, useProtectedRoute } from '../../features/auth';
import { useUserProfile, useModeToggle, type Mode } from '../../features/user';

export default function HomeScreen() {
  useProtectedRoute();

  const { showBanner, dismissBanner } = useSecurityWarning();

  // Fetch the user profile (provides the server-side activeMode).
  // Requirements: 4.4 — reopening the app displays the mode stored on the server.
  const { data: profile, isLoading: isProfileLoading } = useUserProfile();

  /**
   * Error handler for Requirement 4.5:
   * IF toggle fails due to network error THEN the mobile app SHALL revert
   * the optimistic UI state and show an error message.
   */
  const handleToggleError = useCallback((_error: Error) => {
    Alert.alert(
      'Mode not updated',
      'Could not update the active mode. Please check your connection and try again.',
      [{ text: 'OK' }],
    );
  }, []);

  const { activeMode, isToggling, toggle } = useModeToggle({
    onError: handleToggleError,
  });

  /**
   * Resolve the displayed mode:
   * - useModeToggle reads from the React Query cache, so it reflects
   *   the optimistic value during a pending request and the confirmed
   *   server value once the request resolves.
   * - Falls back to the query result while the cache is empty on first load.
   */
  const displayedMode: Mode | undefined = activeMode ?? profile?.activeMode;

  return (
    <View style={styles.container}>
      {/* Persistent security warning — dismissed by user (Req 1.9) */}
      <SecurityWarningBanner visible={showBanner} onDismiss={dismissBanner} />

      {/* One-time "add your name" prompt (Req 2.3) */}
      <AddNamePrompt />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Profile Preview (Req 2.3, 4.4) ──────────────────────── */}
        <ProfilePreviewCard profile={profile} isLoading={isProfileLoading} />

        {/* ─── Mode Toggle (Req 4.7) ────────────────────────────────── */}
        <View style={styles.card}>
          <ModeToggle
            activeMode={isProfileLoading && !displayedMode ? undefined : displayedMode}
            isToggling={isToggling}
            onToggle={toggle}
          />
        </View>

        {/* ─── Quick Stats (Req 8.4, 8.5) ──────────────────────────── */}
        <QuickStatsCard />
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

  // Mode toggle card wrapper
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
});
