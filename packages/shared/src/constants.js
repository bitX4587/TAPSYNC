"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BIO_MAX_LENGTH = exports.NETWORK_SYNC_MAX_ENTRIES = exports.PROFILE_NAME_PLACEHOLDER = exports.VCARD_VERSION = exports.DEFAULT_MODE = exports.AVATAR_ACCEPTED_MIME_TYPES = exports.AVATAR_MAX_BYTES = exports.RECOVERY_CODE_LENGTH = exports.CUSTOM_NAME_CHANGE_WINDOW_DAYS = exports.CUSTOM_NAME_CHANGE_LIMIT = exports.CUSTOM_NAME_REGEX = exports.CUSTOM_NAME_MAX_LENGTH = exports.CUSTOM_NAME_MIN_LENGTH = exports.MAX_CARDS_PER_USER = exports.MAX_LINKS_PER_MODE = exports.PUBLIC_ID_LENGTH = exports.PUBLIC_ID_ALPHABET = void 0;
/**
 * Alphabet used to generate Public IDs.
 * Excludes look-alike characters (0/O, 1/l/I) for readability.
 */
exports.PUBLIC_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
/** Length of a generated Public ID (gives ~50 bits of entropy). */
exports.PUBLIC_ID_LENGTH = 10;
/** Maximum number of links an owner can have per mode. */
exports.MAX_LINKS_PER_MODE = 30;
/** Maximum number of NFC cards bound to a single account. */
exports.MAX_CARDS_PER_USER = 3;
/** Custom name: minimum length. */
exports.CUSTOM_NAME_MIN_LENGTH = 3;
/** Custom name: maximum length. */
exports.CUSTOM_NAME_MAX_LENGTH = 30;
/** Custom name: allowed character pattern (lowercase letters, digits, _ and -). */
exports.CUSTOM_NAME_REGEX = /^[a-z0-9_-]+$/;
/** Maximum number of custom name changes allowed within the rolling window. */
exports.CUSTOM_NAME_CHANGE_LIMIT = 3;
/** Rolling window in days for custom name change limit. */
exports.CUSTOM_NAME_CHANGE_WINDOW_DAYS = 30;
/** Recovery code length (characters). */
exports.RECOVERY_CODE_LENGTH = 20;
/** Avatar upload: maximum file size in bytes (5 MB). */
exports.AVATAR_MAX_BYTES = 5 * 1024 * 1024;
/** Avatar upload: accepted MIME types. */
exports.AVATAR_ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Default active mode for new profiles. */
exports.DEFAULT_MODE = 'work';
/** vCard version emitted by the vCard builder. */
exports.VCARD_VERSION = '3.0';
/** Placeholder name shown on the public page when no name is set. */
exports.PROFILE_NAME_PLACEHOLDER = 'TapSync user';
/** Max bulk entries per /network/sync request. */
exports.NETWORK_SYNC_MAX_ENTRIES = 100;
/** Bio maximum character count. */
exports.BIO_MAX_LENGTH = 280;
//# sourceMappingURL=constants.js.map