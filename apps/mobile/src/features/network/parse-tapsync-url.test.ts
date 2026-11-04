/**
 * Tests for the parseTapSyncUrl utility.
 *
 * Validates that all supported TapSync URL formats are correctly parsed, and
 * that unrecognized or empty input returns null.
 *
 * Requirements: 12.1, 13.1
 */

import { parseTapSyncUrl } from './parse-tapsync-url';

describe('parseTapSyncUrl', () => {
  // ── Deep-link scheme ───────────────────────────────────────────────────────

  describe('tapsync://c/{publicId}', () => {
    it('parses a deep-link publicId URL', () => {
      const result = parseTapSyncUrl('tapsync://c/abcdefghjk');
      expect(result).toEqual({ type: 'publicId', value: 'abcdefghjk' });
    });

    it('parses with uppercase scheme (case-insensitive)', () => {
      const result = parseTapSyncUrl('TAPSYNC://c/abcdefghjk');
      expect(result).toEqual({ type: 'publicId', value: 'abcdefghjk' });
    });

    it('parses and ignores query string', () => {
      const result = parseTapSyncUrl('tapsync://c/abcdefghjk?ref=share');
      expect(result).toEqual({ type: 'publicId', value: 'abcdefghjk' });
    });

    it('parses and ignores fragment', () => {
      const result = parseTapSyncUrl('tapsync://c/abcdefghjk#section');
      expect(result).toEqual({ type: 'publicId', value: 'abcdefghjk' });
    });
  });

  describe('tapsync://p/{customName}', () => {
    it('parses a deep-link custom name URL', () => {
      const result = parseTapSyncUrl('tapsync://p/janedoe');
      expect(result).toEqual({ type: 'customName', value: 'janedoe' });
    });

    it('parses a custom name with hyphens and underscores', () => {
      const result = parseTapSyncUrl('tapsync://p/jane_doe-123');
      expect(result).toEqual({ type: 'customName', value: 'jane_doe-123' });
    });
  });

  // ── HTTPS URLs ─────────────────────────────────────────────────────────────

  describe('https://tapsync.app/c/{publicId}', () => {
    it('parses an HTTPS publicId URL', () => {
      const result = parseTapSyncUrl('https://tapsync.app/c/abcdefghjk');
      expect(result).toEqual({ type: 'publicId', value: 'abcdefghjk' });
    });

    it('parses with www prefix', () => {
      const result = parseTapSyncUrl('https://www.tapsync.app/c/abcdefghjk');
      expect(result).toEqual({ type: 'publicId', value: 'abcdefghjk' });
    });

    it('parses with http (non-TLS)', () => {
      const result = parseTapSyncUrl('http://tapsync.app/c/abcdefghjk');
      expect(result).toEqual({ type: 'publicId', value: 'abcdefghjk' });
    });

    it('parses and ignores query string', () => {
      const result = parseTapSyncUrl('https://tapsync.app/c/abcdefghjk?utm_source=card');
      expect(result).toEqual({ type: 'publicId', value: 'abcdefghjk' });
    });

    it('parses and ignores fragment', () => {
      const result = parseTapSyncUrl('https://tapsync.app/c/abcdefghjk#links');
      expect(result).toEqual({ type: 'publicId', value: 'abcdefghjk' });
    });
  });

  describe('https://tapsync.app/p/{customName}', () => {
    it('parses an HTTPS custom name URL', () => {
      const result = parseTapSyncUrl('https://tapsync.app/p/janedoe');
      expect(result).toEqual({ type: 'customName', value: 'janedoe' });
    });

    it('parses a custom name URL with numbers', () => {
      const result = parseTapSyncUrl('https://tapsync.app/p/jane123');
      expect(result).toEqual({ type: 'customName', value: 'jane123' });
    });
  });

  // ── Unrecognized / invalid inputs ──────────────────────────────────────────

  describe('null cases', () => {
    it('returns null for an empty string', () => {
      expect(parseTapSyncUrl('')).toBeNull();
    });

    it('returns null for a whitespace-only string', () => {
      expect(parseTapSyncUrl('   ')).toBeNull();
    });

    it('returns null for a random URL', () => {
      expect(parseTapSyncUrl('https://example.com/c/abcdefghjk')).toBeNull();
    });

    it('returns null for a tapsync URL with unknown path segment', () => {
      expect(parseTapSyncUrl('tapsync://x/abcdefghjk')).toBeNull();
    });

    it('returns null for a non-URL string', () => {
      expect(parseTapSyncUrl('abcdefghjk')).toBeNull();
    });

    it('returns null for a TapSync URL with a missing value segment', () => {
      // "tapsync://c/" with nothing after — the regex requires at least 1 char
      expect(parseTapSyncUrl('tapsync://c/')).toBeNull();
    });

    it('returns null for an https URL from a different tapsync subdomain', () => {
      expect(parseTapSyncUrl('https://api.tapsync.app/c/abcdefghjk')).toBeNull();
    });
  });

  // ── Whitespace trimming ───────────────────────────────────────────────────

  it('trims leading and trailing whitespace before parsing', () => {
    const result = parseTapSyncUrl('  https://tapsync.app/c/abcdefghjk  ');
    expect(result).toEqual({ type: 'publicId', value: 'abcdefghjk' });
  });

  // ── URL decoding ──────────────────────────────────────────────────────────

  it('URL-decodes percent-encoded characters in the value', () => {
    const result = parseTapSyncUrl('https://tapsync.app/p/jane%5Fdoe');
    expect(result).toEqual({ type: 'customName', value: 'jane_doe' });
  });
});
