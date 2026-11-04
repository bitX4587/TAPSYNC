/**
 * TapSync URL parsing helper.
 *
 * Recognizes the following URL formats and extracts the routing segment:
 *
 *   tapsync://c/{publicId}              → { type: 'publicId', value }
 *   tapsync://p/{customName}            → { type: 'customName', value }
 *   https://tapsync.app/c/{publicId}   → { type: 'publicId', value }
 *   https://tapsync.app/p/{customName} → { type: 'customName', value }
 *
 * Returns `null` for any unrecognized or empty input.
 *
 * Requirements: 12.1, 13.1
 */

export type ParsedTapSyncUrl =
  | { type: 'publicId'; value: string }
  | { type: 'customName'; value: string };

/**
 * Parse a TapSync URL string into a typed result object.
 *
 * @param url - Raw URL string from user input, deep link, or NFC read.
 * @returns A parsed result with `type` and `value`, or `null` when the URL
 *          is empty, malformed, or does not match any known TapSync format.
 */
export function parseTapSyncUrl(url: string): ParsedTapSyncUrl | null {
  if (!url || !url.trim()) {
    return null;
  }

  const trimmed = url.trim();

  // ── Deep-link scheme: tapsync://c/{value} or tapsync://p/{value} ────────
  const deepLinkMatch = trimmed.match(
    /^tapsync:\/\/([cp])\/([^/?#]+)/i,
  );
  if (deepLinkMatch) {
    const segment = deepLinkMatch[1].toLowerCase();
    const value = decodeURIComponent(deepLinkMatch[2]);
    if (!value) return null;
    return segment === 'c'
      ? { type: 'publicId', value }
      : { type: 'customName', value };
  }

  // ── HTTPS URL: https://tapsync.app/c/{value} or /p/{value} ─────────────
  const httpsMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?tapsync\.app\/([cp])\/([^/?#]+)/i,
  );
  if (httpsMatch) {
    const segment = httpsMatch[1].toLowerCase();
    const value = decodeURIComponent(httpsMatch[2]);
    if (!value) return null;
    return segment === 'c'
      ? { type: 'publicId', value }
      : { type: 'customName', value };
  }

  return null;
}
