/**
 * Category emoji helper
 *
 * Maps a link category key (from `LINK_CATEGORIES` in `packages/shared`) to an
 * emoji icon. The mobile app has no icon library installed, so emojis provide
 * a lightweight visual cue for link categories.
 *
 * Requirement 3.8 — predefined categories and icons.
 */

/**
 * Maps a link category key to an emoji icon.
 *
 * Keys correspond to the `category` field of each entry in `LINK_CATEGORIES`
 * (packages/shared/src/dto.ts).
 */
export const CATEGORY_EMOJI: Record<string, string> = {
  linkedin: '💼',
  github: '🐙',
  portfolio: '🌐',
  email: '✉️',
  calendar: '📅',
  company: '🏢',
  instagram: '📸',
  facebook: '👥',
  twitter: '🐦',
  gaming: '🎮',
  messaging: '💬',
  spotify: '🎵',
  custom: '🔗',
};

/**
 * Returns the emoji for a category key, falling back to the generic link emoji.
 */
export function getCategoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category] ?? '🔗';
}
