/**
 * Tests for formatRelativeTime utility.
 *
 * Each test fixes `Date.now()` via jest.spyOn so the output is deterministic.
 */

import { formatRelativeTime } from './formatRelativeTime';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return an ISO string that is `ms` milliseconds before `now`. */
function msAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function secondsAgo(s: number): string {
  return msAgo(s * 1000);
}

function minutesAgo(m: number): string {
  return msAgo(m * 60 * 1000);
}

function hoursAgo(h: number): string {
  return msAgo(h * 60 * 60 * 1000);
}

function daysAgo(d: number): string {
  return msAgo(d * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formatRelativeTime', () => {
  describe('< 1 minute ago', () => {
    it('returns "Just now" for 0 seconds ago', () => {
      expect(formatRelativeTime(secondsAgo(0))).toBe('Just now');
    });

    it('returns "Just now" for 30 seconds ago', () => {
      expect(formatRelativeTime(secondsAgo(30))).toBe('Just now');
    });

    it('returns "Just now" for 59 seconds ago', () => {
      expect(formatRelativeTime(secondsAgo(59))).toBe('Just now');
    });
  });

  describe('< 1 hour ago', () => {
    it('returns "1 minute ago" for exactly 1 minute ago', () => {
      expect(formatRelativeTime(minutesAgo(1))).toBe('1 minute ago');
    });

    it('returns "5 minutes ago" for 5 minutes ago', () => {
      expect(formatRelativeTime(minutesAgo(5))).toBe('5 minutes ago');
    });

    it('returns "59 minutes ago" for 59 minutes ago', () => {
      expect(formatRelativeTime(minutesAgo(59))).toBe('59 minutes ago');
    });
  });

  describe('< 24 hours ago', () => {
    it('returns "1 hour ago" for exactly 1 hour ago', () => {
      expect(formatRelativeTime(hoursAgo(1))).toBe('1 hour ago');
    });

    it('returns "3 hours ago" for 3 hours ago', () => {
      expect(formatRelativeTime(hoursAgo(3))).toBe('3 hours ago');
    });

    it('returns "23 hours ago" for 23 hours ago', () => {
      expect(formatRelativeTime(hoursAgo(23))).toBe('23 hours ago');
    });
  });

  describe('< 7 days ago', () => {
    it('returns "1 day ago" for exactly 1 day ago', () => {
      expect(formatRelativeTime(daysAgo(1))).toBe('1 day ago');
    });

    it('returns "3 days ago" for 3 days ago', () => {
      expect(formatRelativeTime(daysAgo(3))).toBe('3 days ago');
    });

    it('returns "6 days ago" for 6 days ago', () => {
      expect(formatRelativeTime(daysAgo(6))).toBe('6 days ago');
    });
  });

  describe('>= 7 days ago', () => {
    it('returns abbreviated date for 7 days ago (same year)', () => {
      // Pin the current date to something stable so we can predict the output.
      // Use a fixed "now" in 2024 and a date 10 days before it.
      const fixedNow = new Date('2024-08-20T12:00:00.000Z').getTime();
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

      const tenDaysAgo = new Date(fixedNow - 10 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(tenDaysAgo);
      // 2024-08-10 → "Aug 10" (same year as 2024)
      expect(result).toBe('Aug 10');

      dateSpy.mockRestore();
    });

    it('includes the year when the date is from a previous year', () => {
      const fixedNow = new Date('2024-03-01T12:00:00.000Z').getTime();
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

      // A date in a previous year
      const oldDate = new Date('2022-12-25T00:00:00.000Z').toISOString();
      const result = formatRelativeTime(oldDate);
      expect(result).toBe('Dec 25, 2022');

      dateSpy.mockRestore();
    });

    it('returns "Jan 15" format for same-year dates older than 7 days', () => {
      const fixedNow = new Date('2024-06-01T12:00:00.000Z').getTime();
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

      const oldDate = new Date('2024-01-15T10:00:00.000Z').toISOString();
      expect(formatRelativeTime(oldDate)).toBe('Jan 15');

      dateSpy.mockRestore();
    });
  });
});
