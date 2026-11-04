/**
 * Links management screen
 *
 * Displays the Owner's profile links grouped by mode (Work / Casual).
 *
 * Modes:
 *  • Normal — each row shows the link icon, title, URL and an enable/disable
 *    switch. Tapping a row opens the edit modal.
 *  • Reorder — each row exposes a drag handle (≡) and ↑/↓ arrow buttons.
 *    Dragging or pressing arrows persists the new order via PUT /links/reorder
 *    with an optimistic update and rollback on failure (Requirement 3.4).
 *
 * Requirements:
 *   3.1  — links stored with category, icon and priority order
 *   3.4  — reorder persisted atomically
 *   3.5  — disabling a link excludes it from the public page
 *   3.8  — predefined categories and icons
 *   3.9  — per-mode limit of 30 links
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Mode, MAX_LINKS_PER_MODE } from '@tapsync/shared';
import { useProtectedRoute } from '../../features/auth';
import {
  useLinks,
  useToggleLink,
  useReorderLinks,
  DraggableLinkList,
  LinkFormModal,
  type Link,
} from '../../features/links';

// ---------------------------------------------------------------------------
// Mode selector (segmented control)
// ---------------------------------------------------------------------------

interface ModeSelectorProps {
  selectedMode: Mode;
  onSelectMode: (mode: Mode) => void;
}

function ModeSelector({ selectedMode, onSelectMode }: ModeSelectorProps) {
  return (
    <View style={modeStyles.container} accessibilityRole="radiogroup" accessibilityLabel="Filter links by mode">
      {([Mode.Work, Mode.Casual] as const).map((mode, index) => {
        const isActive = selectedMode === mode;
        return (
          <View
            key={mode}
            style={[
              modeStyles.segment,
              isActive && modeStyles.segmentActive,
              index === 0 ? modeStyles.segmentLeft : modeStyles.segmentRight,
            ]}
          >
            <Text
              style={[modeStyles.buttonText, isActive && modeStyles.buttonTextActive]}
              onPress={() => onSelectMode(mode)}
              accessibilityRole="button"
              accessibilityLabel={`${mode === Mode.Work ? 'Work' : 'Casual'} mode`}
              accessibilityState={{ selected: isActive }}
            >
              {mode === Mode.Work ? '💼' : '🌴'}{'  '}{mode === Mode.Work ? 'Work' : 'Casual'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const modeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentLeft: { marginRight: 2 },
  segmentRight: { marginLeft: 2 },
  segmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  buttonTextActive: {
    color: '#111827',
  },
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ mode }: { mode: Mode }) {
  return (
    <View style={emptyStyles.container} accessibilityLabel="No links yet">
      <Text style={emptyStyles.emoji}>🔗</Text>
      <Text style={emptyStyles.title}>No links yet</Text>
      <Text style={emptyStyles.subtitle}>
        Add a link to your {mode === Mode.Work ? 'work' : 'casual'} profile to share it with visitors.
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emoji: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function LinksScreen() {
  useProtectedRoute();

  const [selectedMode, setSelectedMode] = useState<Mode>(Mode.Work);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);

  const { data: links, isLoading } = useLinks(selectedMode);

  // Also fetch the opposite mode's link count so LinkFormModal can enforce
  // the per-mode limit when copying (Requirement 3.9).
  const oppositeMode = selectedMode === Mode.Work ? Mode.Casual : Mode.Work;
  const { data: oppositeLinks } = useLinks(oppositeMode);

  // ── toggle enable/disable ──────────────────────────────────────────────
  const { toggleLink, isToggling } = useToggleLink({
    onError: useCallback(() => {
      Alert.alert('Could not update link', 'Please check your connection and try again.');
    }, []),
  });

  const handleToggle = useCallback(
    (link: Link, isEnabled: boolean) => {
      toggleLink({ id: link._id, mode: link.mode, isEnabled });
    },
    [toggleLink],
  );

  // ── reorder ────────────────────────────────────────────────────────────
  const { reorderLinks: reorderLinksFn, isReordering } = useReorderLinks({
    onError: useCallback(() => {
      Alert.alert('Could not reorder links', 'Please check your connection and try again.');
    }, []),
  });

  /**
   * Called by DraggableLinkList after every drag-end or arrow-button press.
   * Forwards the new ordered IDs to the reorder mutation (optimistic update
   * already applied inside DraggableLinkList's local state).
   */
  const handleDragEnd = useCallback(
    (orderedIds: string[]) => {
      reorderLinksFn(selectedMode, orderedIds);
    },
    [selectedMode, reorderLinksFn],
  );

  // ── editing ────────────────────────────────────────────────────────────
  const handleEdit = useCallback((link: Link) => {
    setEditingLink(link);
    setModalVisible(true);
  }, []);

  const handleAdd = useCallback(() => {
    setEditingLink(null);
    setModalVisible(true);
  }, []);

  // ── mode selector ──────────────────────────────────────────────────────
  const handleSelectMode = useCallback((mode: Mode) => {
    setSelectedMode(mode);
    setIsReorderMode(false); // exit reorder mode when switching tabs
  }, []);

  // ── derived ────────────────────────────────────────────────────────────
  const linkCount = links?.length ?? 0;
  const isAtLimit = linkCount >= MAX_LINKS_PER_MODE;
  const canReorder = linkCount > 1;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        // Disable scroll while a drag is active so the PanResponder in
        // DraggableLinkList can claim the gesture first.
        scrollEnabled={!isReorderMode}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.screenTitle} accessibilityRole="header">
              Links
            </Text>
            <TouchableOpacity
              style={[styles.addButton, isAtLimit && styles.addButtonDisabled]}
              onPress={handleAdd}
              disabled={isAtLimit || isReorderMode}
              accessibilityRole="button"
              accessibilityLabel="Add link"
              accessibilityHint={
                isAtLimit
                  ? `Maximum of ${MAX_LINKS_PER_MODE} links per mode reached`
                  : 'Add a new link'
              }
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.addButtonText}>＋</Text>
            </TouchableOpacity>
          </View>

          <ModeSelector selectedMode={selectedMode} onSelectMode={handleSelectMode} />

          {!isLoading && linkCount > 0 && (
            <View style={styles.subHeader}>
              <Text style={styles.counter}>
                {linkCount} / {MAX_LINKS_PER_MODE} links
              </Text>
              {canReorder && (
                <TouchableOpacity
                  onPress={() => setIsReorderMode((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={isReorderMode ? 'Done reordering' : 'Reorder links'}
                  accessibilityHint={
                    isReorderMode
                      ? 'Exits reorder mode'
                      : 'Enter reorder mode to drag and rearrange your links'
                  }
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.reorderToggleText}>
                    {isReorderMode ? 'Done' : 'Reorder'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {isReorderMode && canReorder && (
            <Text style={styles.reorderHint}>
              Drag ≡ to rearrange. Changes save automatically.
            </Text>
          )}
        </View>

        {/* ── Loading ── */}
        {isLoading && (
          <ActivityIndicator style={styles.loadingSpinner} />
        )}

        {/* ── Empty state ── */}
        {!isLoading && linkCount === 0 && (
          <EmptyState mode={selectedMode} />
        )}

        {/* ── Link list (drag-to-reorder) ── */}
        {!isLoading && links && links.length > 0 && (
          <DraggableLinkList
            links={links}
            onDragEnd={handleDragEnd}
            isReordering={isReordering}
            onEdit={handleEdit}
            onToggle={handleToggle}
            isReorderMode={isReorderMode}
          />
        )}

        {/* ── In-flight indicator ── */}
        {(isToggling || isReordering) && (
          <ActivityIndicator style={styles.footerSpinner} />
        )}
      </ScrollView>

      {/* ── Add / edit modal ── */}
      <LinkFormModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        mode={selectedMode}
        editingLink={editingLink}
        targetModeLinkCount={oppositeLinks?.length}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  addButtonText: {
    fontSize: 22,
    fontWeight: '400',
    color: '#FFFFFF',
    lineHeight: 24,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  counter: {
    fontSize: 13,
    color: '#6B7280',
  },
  reorderToggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0066CC',
  },
  reorderHint: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  loadingSpinner: {
    paddingVertical: 48,
  },
  footerSpinner: {
    paddingVertical: 16,
  },
});
