/**
 * Utility for formatting a past ISO 8601 timestamp as a human-readable
 * relative time string.
 *
 * Examples:
 *   "Just now"        — < 1 minute ago
 *   "5 minutes ago"   — < 1 hour ago
 *   "2 hours ago"     — < 24 hours ago
 *   "3 days ago"      — < 7 days ago
 *   "Jan 15"          — older, same year
 *   "Jan 15, 2022"    — older, different year
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format an ISO 8601 date string as a relative or short absolute time.
 *
 * @param isoString — ISO 8601 date string (e.g. "2024-03-15T10:00:00.000Z")
 * @returns Human-readable relative time string
 */
export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const past = new Date(isoString).getTime();
  const diffMs = now - past;

  // < 1 minute
  if (diffMs < MINUTE_MS) {
    return 'Just now';
  }

  // < 1 hour → "X minutes ago"
  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  // < 24 hours → "X hours ago"
  if (diffMs < DAY_MS) {
    const hours = Math.floor(diffMs / HOUR_MS);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }

  // < 7 days → "X days ago"
  if (diffMs < 7 * DAY_MS) {
    const days = Math.floor(diffMs / DAY_MS);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }

  // ≥ 7 days — abbreviated date
  const date = new Date(isoString);
  const month = SHORT_MONTHS[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const currentYear = new Date(Date.now()).getFullYear();

  if (year === currentYear) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${year}`;
}
