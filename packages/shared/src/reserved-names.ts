/**
 * Custom names that are permanently reserved and cannot be claimed by any user.
 *
 * These cover route segments used by the web app, common admin paths, and
 * words that could be misleading if used as a vanity name.
 */
export const RESERVED_CUSTOM_NAMES: ReadonlySet<string> = new Set([
  // Core route segments (web app)
  'c',
  'p',
  'r',

  // Auth / account
  'login',
  'logout',
  'signup',
  'register',
  'auth',
  'oauth',
  'restore',
  'recover',
  'reset',
  'verify',

  // Admin / system
  'admin',
  'administrator',
  'api',
  'internal',
  'system',
  'root',
  'support',
  'help',
  'status',
  'health',
  'ping',

  // App pages / navigation
  'home',
  'dashboard',
  'settings',
  'profile',
  'account',
  'security',
  'privacy',
  'terms',
  'about',
  'contact',
  'faq',
  'pricing',
  'blog',
  'press',
  'legal',
  'jobs',
  'careers',

  // File / storage paths
  'static',
  'public',
  'assets',
  'media',
  'uploads',
  'files',
  'cdn',

  // Common vanity name squatting risks
  'tapsync',
  'test',
  'demo',
  'example',
  'null',
  'undefined',
  'anonymous',
  'user',
  'guest',
]);

/**
 * Returns true if the given name is reserved and cannot be claimed.
 * Comparison is case-insensitive (names are always stored lowercased).
 */
export function isReservedCustomName(name: string): boolean {
  return RESERVED_CUSTOM_NAMES.has(name.toLowerCase());
}
