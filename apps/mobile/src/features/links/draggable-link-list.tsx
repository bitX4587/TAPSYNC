/**
 * DraggableLinkList
 *
 * A drag-to-reorder list of profile links built on React Native's built-in
 * PanResponder and Animated APIs — no extra native modules required.
 *
 * Interaction:
 *  - Press the grab handle (≡) on any row to start dragging.
 *  - Drag up or down; other rows shift aside to show where the item will land.
 *  - Release to drop. `onDragEnd` is fired with the new ID order, which the
 *    parent persists atomically via `PUT /links/reorder` (Requirement 3.4).
 *
 * Accessibility:
 *  - The drag handle has accessibilityRole="button", label and hint.
 *  - ↑/↓ arrow buttons remain visible for users who cannot perform drag
 *    gestures (minimum 44 px combined touch target).
 *
 * Requirements: 3.4 — persist new priorityOrder values atomically.
 */

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import {
  View,
  Text,
  PanResponder,
  Animated,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import type { Link } from './link.service';
import { getCategoryEmoji } from './category-emoji';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed height for every row in pixels — must equal rowStyles.container.height. */
const ROW_HEIGHT = 68;
/** Vertical gap between rows in pixels — must equal rowStyles.animatedWrapper.marginBottom. */
const ROW_GAP = 10;
/** Combined span of one slot. */
const SLOT_HEIGHT = ROW_HEIGHT + ROW_GAP;

/** Finger must travel this far before PanResponder claims the gesture. */
const DRAG_ACTIVATION_THRESHOLD = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraggableLinkListProps {
  links: Link[];
  /** Called when drag ends or an arrow button is used. Receives the new ID order. */
  onDragEnd: (orderedIds: string[]) => void;
  /** True while a reorder network request is in flight. Disables new gestures. */
  isReordering: boolean;
  /** Called when the user taps a row in normal (non-reorder) mode to edit it. */
  onEdit: (link: Link) => void;
  /** Called when the user toggles the enable/disable switch. */
  onToggle: (link: Link, isEnabled: boolean) => void;
  /**
   * When true, drag handles and arrow buttons are shown instead of the
   * enable/disable switch.
   */
  isReorderMode: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Reorder an array by moving the item at `from` to `to`, returning a new array.
 */
function reorder<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  if (item !== undefined) {
    next.splice(to, 0, item);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Single row component
// ---------------------------------------------------------------------------

interface RowProps {
  link: Link;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  translateY: Animated.Value;
  isDragging: boolean;
  isReorderMode: boolean;
  isReordering: boolean;
  onDragStart: (index: number) => void;
  onMoveUp: (link: Link) => void;
  onMoveDown: (link: Link) => void;
  onEdit: (link: Link) => void;
  onToggle: (link: Link, isEnabled: boolean) => void;
}

function LinkRow({
  link,
  isFirst,
  isLast,
  translateY,
  isDragging,
  isReorderMode,
  isReordering,
  index,
  onDragStart,
  onMoveUp,
  onMoveDown,
  onEdit,
  onToggle,
}: RowProps) {
  const innerContent = (
    <View
      style={[
        rowStyles.card,
        !link.isEnabled && rowStyles.cardDisabled,
        isDragging && rowStyles.cardDragging,
      ]}
      accessible={false}
    >
      {/* Category icon */}
      <View style={rowStyles.iconBox} accessible={false}>
        <Text style={rowStyles.iconText}>{getCategoryEmoji(link.category)}</Text>
      </View>

      {/* Title + URL */}
      <View style={rowStyles.textBox}>
        <Text
          style={[rowStyles.title, !link.isEnabled && rowStyles.titleMuted]}
          numberOfLines={1}
        >
          {link.title}
        </Text>
        <Text style={rowStyles.url} numberOfLines={1}>
          {formatUrl(link.url)}
        </Text>
        {!isReorderMode && !link.isEnabled && (
          <Text style={rowStyles.hiddenBadge}>Hidden from public page</Text>
        )}
      </View>

      {isReorderMode ? (
        /* ── Reorder controls ── */
        <View style={rowStyles.reorderControls}>
          {/* Arrow fallbacks (accessible for users who can't drag) */}
          <View style={rowStyles.arrows}>
            <TouchableOpacity
              onPress={() => onMoveUp(link)}
              disabled={isFirst || isReordering}
              accessibilityRole="button"
              accessibilityLabel={`Move ${link.title} up`}
              accessibilityHint="Moves this link one position higher"
              hitSlop={{ top: 6, bottom: 3, left: 8, right: 4 }}
              style={[rowStyles.arrowBtn, (isFirst || isReordering) && rowStyles.arrowDisabled]}
            >
              <Text style={rowStyles.arrowChar}>↑</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onMoveDown(link)}
              disabled={isLast || isReordering}
              accessibilityRole="button"
              accessibilityLabel={`Move ${link.title} down`}
              accessibilityHint="Moves this link one position lower"
              hitSlop={{ top: 3, bottom: 6, left: 8, right: 4 }}
              style={[rowStyles.arrowBtn, (isLast || isReordering) && rowStyles.arrowDisabled]}
            >
              <Text style={rowStyles.arrowChar}>↓</Text>
            </TouchableOpacity>
          </View>

          {/* Drag handle — press to initiate the drag gesture */}
          <TouchableOpacity
            onPressIn={() => !isReordering && onDragStart(index)}
            disabled={isReordering}
            accessibilityRole="button"
            accessibilityLabel={`Drag handle for ${link.title}`}
            accessibilityHint="Press and drag up or down to reorder this link"
            style={rowStyles.handle}
          >
            <Text
              style={[rowStyles.handleIcon, isReordering && rowStyles.handleIconMuted]}
              accessible={false}
            >
              ≡
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* ── Normal mode: enable/disable switch ── */
        <Switch
          value={link.isEnabled}
          onValueChange={(val) => onToggle(link, val)}
          accessibilityLabel={`Toggle ${link.title} visibility`}
          accessibilityHint="When on, this link appears on your public page"
        />
      )}
    </View>
  );

  if (isReorderMode) {
    return (
      <Animated.View
        style={[
          rowStyles.wrapper,
          { transform: [{ translateY }] },
          isDragging && rowStyles.wrapperDragging,
        ]}
      >
        {innerContent}
      </Animated.View>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => onEdit(link)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${link.title}, ${link.isEnabled ? 'visible' : 'hidden'}. Double-tap to edit.`}
      style={rowStyles.wrapperTouchable}
    >
      {innerContent}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  wrapper: {
    height: ROW_HEIGHT,
    marginBottom: ROW_GAP,
  },
  wrapperTouchable: {
    marginBottom: ROW_GAP,
  },
  wrapperDragging: {
    zIndex: 999,
    elevation: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    height: ROW_HEIGHT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  cardDragging: {
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 10,
    backgroundColor: '#EFF6FF',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 18,
  },
  textBox: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  titleMuted: {
    color: '#6B7280',
  },
  url: {
    fontSize: 13,
    color: '#6B7280',
  },
  hiddenBadge: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 2,
  },
  reorderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arrows: {
    flexDirection: 'column',
    gap: 2,
  },
  arrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowDisabled: {
    opacity: 0.3,
  },
  arrowChar: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    lineHeight: 16,
  },
  handle: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  handleIcon: {
    fontSize: 22,
    color: '#374151',
    fontWeight: '700',
  },
  handleIconMuted: {
    color: '#D1D5DB',
  },
});

// ---------------------------------------------------------------------------
// DraggableLinkList — the exported component
// ---------------------------------------------------------------------------

export function DraggableLinkList({
  links,
  onDragEnd,
  isReordering,
  onEdit,
  onToggle,
  isReorderMode,
}: DraggableLinkListProps) {
  // ------ ordered display list ------
  const [orderedLinks, setOrderedLinks] = useState<Link[]>(links);

  // Keep in sync when the parent list changes (mode switch, server refresh, etc.)
  useEffect(() => {
    setOrderedLinks(links);
  }, [links]);

  // ------ drag state (all via refs to avoid extra re-renders during gesture) ------
  const dragFromRef = useRef<number>(-1);

  // One Animated.Value per row slot.
  const animVals = useRef<Animated.Value[]>([]);
  // Ensure array length matches.
  const ensureAnimVals = (count: number) => {
    while (animVals.current.length < count) {
      animVals.current.push(new Animated.Value(0));
    }
    if (animVals.current.length > count) {
      animVals.current = animVals.current.slice(0, count);
    }
  };
  ensureAnimVals(orderedLinks.length);

  // ------ stable refs so PanResponder closure never goes stale ------
  const orderedLinksRef = useRef(orderedLinks);
  orderedLinksRef.current = orderedLinks;

  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  const isReorderingRef = useRef(isReordering);
  isReorderingRef.current = isReordering;

  // ------ visual state for dragging highlight ------
  const [activeDragIndex, setActiveDragIndex] = useState<number>(-1);

  // ------ reset all animated values ------
  const resetAll = useCallback(() => {
    animVals.current.forEach((v) => v.setValue(0));
  }, []);

  /**
   * Shift sibling rows so they visually make room for the dragged item.
   * Only accesses the stable `animVals.current` ref, not `orderedLinks`.
   */
  const shiftSiblings = useCallback((fromIdx: number, toIdx: number) => {
    const count = animVals.current.length;
    animVals.current.forEach((anim, i) => {
      if (i === fromIdx) return; // dragged row follows finger separately
      let target = 0;
      if (fromIdx < toIdx && i > fromIdx && i <= toIdx) {
        // Dragging DOWN — rows in range shift UP
        target = -SLOT_HEIGHT;
      } else if (fromIdx > toIdx && i >= toIdx && i < fromIdx) {
        // Dragging UP — rows in range shift DOWN
        target = SLOT_HEIGHT;
      }
      Animated.spring(anim, {
        toValue: target,
        useNativeDriver: true,
        speed: 30,
        bounciness: 0,
      }).start();
    });
    // satisfy the eslint no-unused-vars rule; `count` is only here for safety
    void count;
  }, []);

  // ------ PanResponder — created once, uses only stable refs ------
  const panResponder = useRef(
    PanResponder.create({
      // Only start tracking when the drag handle fires onPressIn (dragFromRef ≠ -1)
      // and the finger has moved enough to differentiate from a tap.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) => {
        if (dragFromRef.current === -1) return false;
        if (isReorderingRef.current) return false;
        return Math.abs(gs.dy) > DRAG_ACTIVATION_THRESHOLD;
      },
      onPanResponderGrant: () => {
        // Gesture claimed — nothing extra needed; dragFromRef is already set
        // by the handle's onPressIn.
      },
      onPanResponderMove: (_e, gs) => {
        const from = dragFromRef.current;
        if (from === -1) return;
        const count = animVals.current.length;
        const toIdx = clamp(from + Math.round(gs.dy / SLOT_HEIGHT), 0, count - 1);

        // Move the dragged row with the finger.
        animVals.current[from]?.setValue(gs.dy);

        // Shift siblings to show the insertion gap.
        shiftSiblings(from, toIdx);
      },
      onPanResponderRelease: (_e, gs) => {
        const from = dragFromRef.current;
        dragFromRef.current = -1;
        if (from === -1) return;

        const count = animVals.current.length;
        const to = clamp(from + Math.round(gs.dy / SLOT_HEIGHT), 0, count - 1);

        resetAll();
        setActiveDragIndex(-1);

        if (from !== to) {
          const next = reorder(orderedLinksRef.current, from, to);
          setOrderedLinks(next);
          onDragEndRef.current(next.map((l) => l._id));
        }
      },
      onPanResponderTerminate: () => {
        dragFromRef.current = -1;
        resetAll();
        setActiveDragIndex(-1);
      },
    }),
  ).current;

  // ------ arrow-button fallbacks ------
  const handleMoveUp = useCallback((link: Link) => {
    const idx = orderedLinksRef.current.findIndex((l) => l._id === link._id);
    if (idx <= 0) return;
    const next = reorder(orderedLinksRef.current, idx, idx - 1);
    setOrderedLinks(next);
    onDragEndRef.current(next.map((l) => l._id));
  }, []);

  const handleMoveDown = useCallback((link: Link) => {
    const idx = orderedLinksRef.current.findIndex((l) => l._id === link._id);
    if (idx < 0 || idx >= orderedLinksRef.current.length - 1) return;
    const next = reorder(orderedLinksRef.current, idx, idx + 1);
    setOrderedLinks(next);
    onDragEndRef.current(next.map((l) => l._id));
  }, []);

  // ------ drag-start callback given to each row's handle ------
  const handleDragStart = useCallback((index: number) => {
    if (isReorderingRef.current) return;
    dragFromRef.current = index;
    animVals.current[index]?.setValue(0);
    setActiveDragIndex(index);
  }, []);

  // ------ render ------
  ensureAnimVals(orderedLinks.length);

  return (
    <View {...(isReorderMode ? panResponder.panHandlers : {})}>
      {orderedLinks.map((link, index) => (
        <LinkRow
          key={link._id}
          link={link}
          index={index}
          isFirst={index === 0}
          isLast={index === orderedLinks.length - 1}
          translateY={animVals.current[index] ?? new Animated.Value(0)}
          isDragging={activeDragIndex === index}
          isReorderMode={isReorderMode}
          isReordering={isReordering}
          onDragStart={handleDragStart}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onEdit={onEdit}
          onToggle={onToggle}
        />
      ))}
    </View>
  );
}
