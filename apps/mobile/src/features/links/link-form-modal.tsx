/**
 * LinkFormModal component
 *
 * A modal-based form for creating or editing a profile link. Provides:
 * - Title input (required, max 100 chars)
 * - URL input (required, validated against allowed schemes)
 * - Category picker from the predefined `LINK_CATEGORIES` registry
 * - The icon is auto-determined from the selected category's `defaultIcon`
 * - Save (create via POST /links, or update via PATCH /links/:id)
 * - Delete (when editing) with a confirmation alert (Requirement 3.6)
 * - Move to other mode (when editing) — updates the link's mode (Requirement 3.7)
 * - Copy to other mode (when editing) — duplicates the link (Requirement 3.7)
 *
 * Requirements:
 *   3.1 — create link with title, URL, mode, category, icon
 *   3.2 — reject URLs that don't use https, http, mailto or tel
 *   3.3 — persist edits
 *   3.6 — delete a link
 *   3.7 — move or copy link between modes
 *   3.8 — predefined categories and icons
 *   3.9 — per-mode limit of 30 links (enforced for copy)
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Mode,
  LINK_CATEGORIES,
  ALLOWED_LINK_SCHEMES,
  MAX_LINKS_PER_MODE,
  type AllowedLinkScheme,
  type LinkCategory,
} from '@tapsync/shared';
import { getCategoryEmoji } from './category-emoji';
import { useCreateLink, useUpdateLink, useDeleteLink, useMoveLink, useCopyLink } from './use-links';
import type { Link } from './link.service';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LinkFormModalProps {
  /** Whether the modal is visible. */
  visible: boolean;
  /** Called to close the modal. */
  onClose: () => void;
  /** The mode the new link will be created in (inherited from the parent screen). */
  mode: Mode;
  /** When provided, the form is in edit mode and pre-fills from this link. */
  editingLink?: Link | null;
  /**
   * Number of links already in the target mode (the mode opposite to
   * `editingLink.mode`). Used to enforce the per-mode limit when copying.
   * If not provided, the copy action relies on the server's own enforcement.
   */
  targetModeLinkCount?: number | undefined;
}

// ---------------------------------------------------------------------------
// URL validation (Requirement 3.2)
// ---------------------------------------------------------------------------

/**
 * Validate a link URL against the allowed schemes.
 *
 * Requirement 3.2 — IF a link URL does not use `https`, `http`, `mailto` or
 * `tel` THEN the system SHALL reject it.
 *
 * @returns An error message if invalid, or `null` if the URL is acceptable.
 */
export function validateLinkUrl(url: string): string | null {
  const trimmed = url.trim();

  if (!trimmed) {
    return 'URL is required';
  }

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_LINK_SCHEMES.includes(parsed.protocol as AllowedLinkScheme)) {
      const allowed = ALLOWED_LINK_SCHEMES.map((s) => s.replace(':', '')).join(', ');
      return `URL must use one of: ${allowed}`;
    }
    return null;
  } catch {
    return 'Invalid URL format';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Title length cap (matches the API's max length). */
const TITLE_MAX_LENGTH = 100;

/**
 * Returns the `defaultIcon` for a category key from the `LINK_CATEGORIES`
 * registry, falling back to the generic `'link'` icon.
 */
function getCategoryDefaultIcon(category: string): string {
  const meta = LINK_CATEGORIES.find((c) => c.category === category);
  return meta?.defaultIcon ?? 'link';
}

/** The first category in the registry, used as the default selection. */
const DEFAULT_CATEGORY: LinkCategory = LINK_CATEGORIES[0]?.category ?? 'custom';

// ---------------------------------------------------------------------------
// Category picker
// ---------------------------------------------------------------------------

interface CategoryPickerProps {
  selected: string;
  onSelect: (category: LinkCategory) => void;
}

function CategoryPicker({ selected, onSelect }: CategoryPickerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={pickerStyles.scroll}
      contentContainerStyle={pickerStyles.content}
      accessibilityRole="radiogroup"
      accessibilityLabel="Link category"
    >
      {LINK_CATEGORIES.map((meta) => {
        const isSelected = meta.category === selected;
        return (
          <TouchableOpacity
            key={meta.category}
            style={[
              pickerStyles.chip,
              isSelected && pickerStyles.chipSelected,
            ]}
            onPress={() => onSelect(meta.category)}
            accessibilityRole="button"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: isSelected }}
            activeOpacity={0.7}
          >
            <Text style={pickerStyles.emoji}>{getCategoryEmoji(meta.category)}</Text>
            <Text
              style={[pickerStyles.label, isSelected && pickerStyles.labelSelected]}
            >
              {meta.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const pickerStyles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    minHeight: 44,
  },
  chipSelected: {
    backgroundColor: '#0066CC',
  },
  emoji: {
    fontSize: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  labelSelected: {
    color: '#FFFFFF',
  },
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/**
 * Modal form for creating or editing a link.
 *
 * When `editingLink` is provided the form is pre-filled and a Delete button is
 * shown. Otherwise it creates a new link in the given `mode`.
 */
export function LinkFormModal({
  visible,
  onClose,
  mode,
  editingLink,
  targetModeLinkCount,
}: LinkFormModalProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<LinkCategory>(DEFAULT_CATEGORY);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Pre-fill the form whenever the modal opens or the editing target changes.
  useEffect(() => {
    if (!visible) return;

    if (editingLink) {
      setTitle(editingLink.title);
      setUrl(editingLink.url);
      setCategory(editingLink.category as LinkCategory);
    } else {
      setTitle('');
      setUrl('');
      setCategory(DEFAULT_CATEGORY);
    }
    setTitleError(null);
    setUrlError(null);
    setShowMoreOptions(false);
  }, [visible, editingLink]);

  const isEditing = Boolean(editingLink);

  const createMutation = useCreateLink({
    onSuccess: () => onClose(),
    onError: (err) =>
      Alert.alert('Could not save link', err.message, [{ text: 'OK' }]),
  });

  const updateMutation = useUpdateLink({
    onSuccess: () => onClose(),
    onError: (err) =>
      Alert.alert('Could not save link', err.message, [{ text: 'OK' }]),
  });

  const deleteMutation = useDeleteLink({
    onSuccess: () => onClose(),
    onError: (err) =>
      Alert.alert('Could not delete link', err.message, [{ text: 'OK' }]),
  });

  const moveMutation = useMoveLink({
    onSuccess: () => onClose(),
    onError: (err) =>
      Alert.alert('Could not move link', err.message, [{ text: 'OK' }]),
  });

  const copyMutation = useCopyLink({
    onSuccess: () => onClose(),
    onError: (err) =>
      Alert.alert('Could not copy link', err.message, [{ text: 'OK' }]),
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isAnyPending =
    isSubmitting ||
    deleteMutation.isPending ||
    moveMutation.isPending ||
    copyMutation.isPending;

  /** The other mode, shown in move/copy button labels. */
  const targetMode = editingLink?.mode === Mode.Work ? Mode.Casual : Mode.Work;
  const targetModeLabel = targetMode === Mode.Work ? 'Work' : 'Casual';
  const targetModeEmoji = targetMode === Mode.Work ? '💼' : '🌴';

  const handleSave = useCallback(() => {
    const trimmedTitle = title.trim();

    // Validate title (required, max 100).
    let hasError = false;
    if (!trimmedTitle) {
      setTitleError('Title is required');
      hasError = true;
    } else if (trimmedTitle.length > TITLE_MAX_LENGTH) {
      setTitleError(`Title must be ${TITLE_MAX_LENGTH} characters or fewer`);
      hasError = true;
    } else {
      setTitleError(null);
    }

    // Validate URL (required, allowed scheme).
    const err = validateLinkUrl(url);
    setUrlError(err);
    if (err) hasError = true;

    if (hasError) return;

    const trimmedUrl = url.trim();
    const icon = getCategoryDefaultIcon(category);

    if (editingLink) {
      updateMutation.mutate({
        id: editingLink._id,
        dto: { title: trimmedTitle, url: trimmedUrl, category, icon },
      });
    } else {
      createMutation.mutate({
        title: trimmedTitle,
        url: trimmedUrl,
        mode,
        category,
        icon,
      });
    }
  }, [title, url, category, editingLink, mode, createMutation, updateMutation]);

  const handleDelete = useCallback(() => {
    if (!editingLink) return;

    Alert.alert(
      'Delete link',
      'Are you sure you want to delete this link? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(editingLink._id),
        },
      ],
    );
  }, [editingLink, deleteMutation]);

  const handleMove = useCallback(() => {
    if (!editingLink) return;

    Alert.alert(
      `Move to ${targetModeLabel}`,
      `This link will be removed from ${editingLink.mode === Mode.Work ? 'Work' : 'Casual'} and added to ${targetModeLabel}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Move to ${targetModeLabel}`,
          onPress: () =>
            moveMutation.mutate({ id: editingLink._id, dto: { targetMode } }),
        },
      ],
    );
  }, [editingLink, targetMode, targetModeLabel, moveMutation]);

  const handleCopy = useCallback(() => {
    if (!editingLink) return;

    // Enforce per-mode limit client-side before hitting the API (Req 3.9).
    if (targetModeLinkCount !== undefined && targetModeLinkCount >= MAX_LINKS_PER_MODE) {
      Alert.alert(
        'Limit reached',
        `Your ${targetModeLabel} profile already has the maximum of ${MAX_LINKS_PER_MODE} links.`,
        [{ text: 'OK' }],
      );
      return;
    }

    Alert.alert(
      `Copy to ${targetModeLabel}`,
      `A copy of this link will be added to your ${targetModeLabel} profile. The original stays in ${editingLink.mode === Mode.Work ? 'Work' : 'Casual'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Copy to ${targetModeLabel}`,
          onPress: () =>
            copyMutation.mutate({ id: editingLink._id, dto: { targetMode } }),
        },
      ],
    );
  }, [editingLink, targetMode, targetModeLabel, targetModeLinkCount, copyMutation]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {isEditing ? 'Edit link' : 'Add link'}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title */}
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={[styles.input, titleError && styles.inputError]}
              value={title}
              onChangeText={setTitle}
              placeholder="Link title"
              placeholderTextColor="#9CA3AF"
              maxLength={TITLE_MAX_LENGTH}
              accessibilityLabel="Link title"
              accessibilityHint="Required, up to 100 characters"
            />
            {titleError && (
              <Text
                style={styles.errorText}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                {titleError}
              </Text>
            )}

            {/* URL */}
            <Text style={styles.fieldLabel}>URL</Text>
            <TextInput
              style={[styles.input, urlError && styles.inputError]}
              value={url}
              onChangeText={setUrl}
              placeholder="https://example.com"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel="Link URL"
              accessibilityHint="Required. Must use https, http, mailto or tel"
            />
            {urlError && (
              <Text
                style={styles.errorText}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                {urlError}
              </Text>
            )}

            {/* Category picker */}
            <Text style={styles.fieldLabel}>Category</Text>
            <CategoryPicker selected={category} onSelect={setCategory} />
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            {isEditing && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDelete}
                disabled={isAnyPending}
                accessibilityRole="button"
                accessibilityLabel="Delete link"
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={styles.deleteText}>Delete</Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.saveButton,
                isEditing && styles.saveButtonWithDelete,
              ]}
              onPress={handleSave}
              disabled={isAnyPending}
              accessibilityRole="button"
              accessibilityLabel={isEditing ? 'Save changes' : 'Add link'}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>
                  {isEditing ? 'Save' : 'Add link'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Move / Copy actions — only shown when editing */}
          {isEditing && (
            <>
              <TouchableOpacity
                style={styles.moreOptionsToggle}
                onPress={() => setShowMoreOptions((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showMoreOptions ? 'Hide more options' : 'Show more options'}
                accessibilityState={{ expanded: showMoreOptions }}
                disabled={isAnyPending}
              >
                <Text style={styles.moreOptionsToggleText}>
                  {showMoreOptions ? 'Hide options ▲' : `More options ▼`}
                </Text>
              </TouchableOpacity>

              {showMoreOptions && (
                <View style={styles.moreOptionsPanel}>
                  {/* Move to other mode */}
                  <TouchableOpacity
                    style={[styles.moreOptionButton, isAnyPending && styles.moreOptionButtonDisabled]}
                    onPress={handleMove}
                    disabled={isAnyPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Move to ${targetModeLabel} mode`}
                    accessibilityHint={`Removes this link from its current mode and adds it to ${targetModeLabel}`}
                  >
                    {moveMutation.isPending ? (
                      <ActivityIndicator size="small" color="#0066CC" />
                    ) : (
                      <>
                        <Text style={styles.moreOptionEmoji}>{targetModeEmoji}</Text>
                        <Text style={styles.moreOptionText}>
                          Move to {targetModeLabel}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Copy to other mode */}
                  <TouchableOpacity
                    style={[
                      styles.moreOptionButton,
                      (isAnyPending ||
                        (targetModeLinkCount !== undefined &&
                          targetModeLinkCount >= MAX_LINKS_PER_MODE)) &&
                        styles.moreOptionButtonDisabled,
                    ]}
                    onPress={handleCopy}
                    disabled={
                      isAnyPending ||
                      (targetModeLinkCount !== undefined &&
                        targetModeLinkCount >= MAX_LINKS_PER_MODE)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Copy to ${targetModeLabel} mode`}
                    accessibilityHint={`Keeps this link and adds a copy to ${targetModeLabel}`}
                  >
                    {copyMutation.isPending ? (
                      <ActivityIndicator size="small" color="#0066CC" />
                    ) : (
                      <>
                        <Text style={styles.moreOptionEmoji}>{targetModeEmoji}</Text>
                        <Text style={styles.moreOptionText}>
                          Copy to {targetModeLabel}
                          {targetModeLinkCount !== undefined &&
                            targetModeLinkCount >= MAX_LINKS_PER_MODE &&
                            ' (limit reached)'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeText: {
    fontSize: 20,
    color: '#6B7280',
    paddingHorizontal: 4,
  },
  body: {
    padding: 16,
  },
  bodyContent: {
    gap: 4,
    paddingBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    minHeight: 48,
  },
  inputError: {
    borderColor: '#DC2626',
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    marginTop: 6,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#0066CC',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonWithDelete: {
    flex: 2,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deleteButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  deleteText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
  },
  moreOptionsToggle: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  moreOptionsToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  moreOptionsPanel: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  moreOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  moreOptionButtonDisabled: {
    opacity: 0.45,
  },
  moreOptionEmoji: {
    fontSize: 18,
  },
  moreOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0066CC',
    flex: 1,
  },
});
