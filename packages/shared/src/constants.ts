/**
 * Alphabet used to generate Public IDs.
 * Excludes look-alike characters (0/O, 1/l/I) for readability.
 */
export const PUBLIC_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/** Length of a generated Public ID (gives ~50 bits of entropy). */
export const PUBLIC_ID_LENGTH = 10;

/** Maximum number of links an owner can have per mode. */
export const MAX_LINKS_PER_MODE = 30;

/** Maximum number of NFC cards bound to a single account. */
export const MAX_CARDS_PER_USER = 3;

/** Custom name: minimum length. */
export const CUSTOM_NAME_MIN_LENGTH = 3;

/** Custom name: maximum length. */
export const CUSTOM_NAME_MAX_LENGTH = 30;

/** Custom name: allowed character pattern (lowercase letters, digits, _ and -). */
export const CUSTOM_NAME_REGEX = /^[a-z0-9_-]+$/;

/** Maximum number of custom name changes allowed within the rolling window. */
export const CUSTOM_NAME_CHANGE_LIMIT = 3;

/** Rolling window in days for custom name change limit. */
export const CUSTOM_NAME_CHANGE_WINDOW_DAYS = 30;

/** Recovery code length (characters). */
export const RECOVERY_CODE_LENGTH = 20;

/** Avatar upload: maximum file size in bytes (5 MB). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Avatar upload: accepted MIME types. */
export const AVATAR_ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Default active mode for new profiles. */
export const DEFAULT_MODE = 'work';

/** vCard version emitted by the vCard builder. */
export const VCARD_VERSION = '3.0';

/** Placeholder name shown on the public page when no name is set. */
export const PROFILE_NAME_PLACEHOLDER = 'TapSync user';

/** Max bulk entries per /network/sync request. */
export const NETWORK_SYNC_MAX_ENTRIES = 100;

/** Bio maximum character count. */
export const BIO_MAX_LENGTH = 280;
