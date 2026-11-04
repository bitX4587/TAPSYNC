/**
 * NFC service for reading and writing NTAG215 cards.
 * Implements the interface specified in design.md.
 *
 * Platform notes:
 *   iOS  – requires NFCReaderUsageDescription in Info.plist,
 *           NFC Tag Reading capability, and the
 *           com.apple.developer.nfc.readersession.formats entitlement.
 *   Android – requires android.permission.NFC.
 */

import NfcManager, { Ndef, NfcTech, NdefStatus } from 'react-native-nfc-manager';
import { Platform } from 'react-native';
import type { NfcErrorCode, NfcServiceInterface, NfcWriteOptions } from './types';

export type { NfcWriteState, NfcErrorCode, NfcWriteOptions, NfcServiceInterface } from './types';

/** Default write timeout: 20 s (per design.md). */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Structured error thrown by NfcService methods.
 */
export class NfcError extends Error {
  constructor(
    message: string,
    public readonly code: NfcErrorCode,
  ) {
    super(message);
    this.name = 'NfcError';
  }
}

class NfcService implements NfcServiceInterface {
  private initialized = false;

  // ─── Initialization ──────────────────────────────────────────────────────────

  /**
   * Start the NfcManager once.  Subsequent calls are no-ops.
   */
  private async ensureStarted(): Promise<void> {
    if (this.initialized) return;
    try {
      await NfcManager.start();
      this.initialized = true;
    } catch {
      throw new NfcError('Failed to initialize NFC manager', 'UNKNOWN');
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /** Returns true if the device has NFC hardware. */
  async isSupported(): Promise<boolean> {
    try {
      await this.ensureStarted();
      return await NfcManager.isSupported();
    } catch {
      return false;
    }
  }

  /** Returns true if NFC is currently enabled in device settings. */
  async isEnabled(): Promise<boolean> {
    try {
      await this.ensureStarted();
      return await NfcManager.isEnabled();
    } catch {
      return false;
    }
  }

  /**
   * Write `url` as a single NDEF URI record to an NTAG215 tag, then read it
   * back to verify the payload.  Returns the tag UID on success.
   *
   * The timeout timer is started synchronously (before any await) so that
   * jest fake timers can advance it while the write operation is in-flight.
   *
   * Error codes:
   *   UNSUPPORTED    – device has no NFC hardware
   *   DISABLED       – NFC is off in device settings
   *   TIMEOUT        – operation exceeded `timeoutMs`
   *   TAG_LOST       – tag removed mid-operation or not detected
   *   NOT_WRITABLE   – tag is read-only
   *   TOO_SMALL      – tag capacity is insufficient for the URL
   *   VERIFY_FAILED  – read-back URI did not match the written URL
   *   USER_CANCELLED – user dismissed the iOS system prompt or cancelled
   *   UNKNOWN        – any other error
   */
  async writeProfileUrl(
    url: string,
    { timeoutMs = DEFAULT_TIMEOUT_MS }: NfcWriteOptions = {},
  ): Promise<{ uid: string }> {
    // Register the timeout BEFORE any awaits so Jest fake timers work correctly.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new NfcError('NFC write operation timed out', 'TIMEOUT'));
      }, timeoutMs);
    });

    try {
      await this.ensureStarted();

      const supported = await NfcManager.isSupported();
      if (!supported) {
        throw new NfcError('NFC is not supported on this device', 'UNSUPPORTED' as NfcErrorCode);
      }

      const enabled = await NfcManager.isEnabled();
      if (!enabled) {
        throw new NfcError('NFC is not enabled on this device', 'DISABLED' as NfcErrorCode);
      }

      // Race the write operation against the timeout.
      return await Promise.race([this._performWrite(url), timeoutPromise]);
    } catch (err) {
      if (err instanceof NfcError) throw err;

      const msg = (err as Error)?.message ?? String(err);

      if (msg.includes('cancelled') || msg.includes('cancel')) {
        throw new NfcError('NFC operation was cancelled by the user', 'USER_CANCELLED');
      }
      if (msg.includes('timeout')) {
        throw new NfcError('NFC operation timed out', 'TIMEOUT');
      }
      if (msg.includes('lost') || msg.includes('removed')) {
        throw new NfcError('NFC tag was removed during the operation', 'TAG_LOST');
      }
      if (msg.includes('read-only') || msg.includes('not writable')) {
        throw new NfcError('NFC tag is read-only', 'NOT_WRITABLE');
      }

      throw new NfcError(`NFC operation failed: ${msg}`, 'UNKNOWN');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Read a TapSync profile URL from an NDEF NFC tag.
   *
   * Requests `NfcTech.Ndef`, reads the first URI record from the tag's NDEF
   * message, and returns the decoded URL.  Always releases the technology in
   * the `finally` block.
   *
   * Error codes:
   *   UNSUPPORTED    – device has no NFC hardware
   *   DISABLED       – NFC is off in device settings
   *   TIMEOUT        – operation exceeded `timeoutMs`
   *   TAG_LOST       – tag not found or removed mid-operation
   *   USER_CANCELLED – user dismissed the iOS system prompt
   *   UNKNOWN        – any other error (includes missing / unreadable NDEF data)
   */
  async readTag({ timeoutMs = DEFAULT_TIMEOUT_MS }: NfcWriteOptions = {}): Promise<{ url: string }> {
    // Register the timeout BEFORE any awaits so Jest fake timers work correctly.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new NfcError('NFC read operation timed out', 'TIMEOUT'));
      }, timeoutMs);
    });

    try {
      await this.ensureStarted();

      const supported = await NfcManager.isSupported();
      if (!supported) {
        throw new NfcError('NFC is not supported on this device', 'UNSUPPORTED' as NfcErrorCode);
      }

      const enabled = await NfcManager.isEnabled();
      if (!enabled) {
        throw new NfcError('NFC is not enabled on this device', 'DISABLED' as NfcErrorCode);
      }

      return await Promise.race([this._performRead(), timeoutPromise]);
    } catch (err) {
      if (err instanceof NfcError) throw err;

      const msg = (err as Error)?.message ?? String(err);

      if (msg.includes('cancelled') || msg.includes('cancel')) {
        throw new NfcError('NFC operation was cancelled by the user', 'USER_CANCELLED');
      }
      if (msg.includes('timeout')) {
        throw new NfcError('NFC operation timed out', 'TIMEOUT');
      }
      if (msg.includes('lost') || msg.includes('removed')) {
        throw new NfcError('NFC tag was removed during the operation', 'TAG_LOST');
      }

      throw new NfcError(`NFC read failed: ${msg}`, 'UNKNOWN');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Cancel the active NFC session.  Safe to call when no session is open. */
  async cancel(): Promise<void> {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // Ignore – the session may already be closed.
    }
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  /**
   * Acquire the NDEF technology, write the URI record, read back and verify,
   * then release the technology.
   *
   * Uses NfcManager.ndefHandler for write/read as required by the library API.
   */
  private async _performWrite(url: string): Promise<{ uid: string }> {
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        ...(Platform.OS === 'ios' && {
          alertMessage: 'Hold your phone near the NFC card',
        }),
      });

      // ── Read tag metadata ──────────────────────────────────────────────────
      const tag = await NfcManager.getTag();

      if (!tag) {
        throw new NfcError('No NFC tag detected', 'TAG_LOST');
      }

      // tag.id is a string (hex) on both platforms.
      const uid = tag.id ?? '';
      if (!uid) {
        throw new NfcError('Could not read the tag UID', 'UNKNOWN');
      }

      // Check writability and capacity via the NDEF handler.
      const { status: ndefStatusCode, capacity } =
        await NfcManager.ndefHandler.getNdefStatus();

      if (ndefStatusCode === NdefStatus.ReadOnly) {
        throw new NfcError('The NFC tag is read-only', 'NOT_WRITABLE');
      }

      // Rough capacity check: NDEF overhead is ~8 bytes.
      if (capacity > 0 && capacity < url.length + 8) {
        throw new NfcError(
          `Tag capacity (${capacity} bytes) is too small for this URL`,
          'TOO_SMALL',
        );
      }

      // ── Write ──────────────────────────────────────────────────────────────
      // Build a URI record and encode it to a flat byte array.
      // Use the https:// URI prefix byte (0x04) for compact NDEF encoding.
      const uriRecord = Ndef.uriRecord(url);
      const bytes = Ndef.encodeMessage([uriRecord]);
      await NfcManager.ndefHandler.writeNdefMessage(bytes);

      // ── Read-back verification ─────────────────────────────────────────────
      const readTag = await NfcManager.ndefHandler.getNdefMessage();
      const ndefMessage = readTag?.ndefMessage;

      if (!ndefMessage || ndefMessage.length === 0) {
        throw new NfcError(
          'Verification failed: could not read NDEF data after writing',
          'VERIFY_FAILED',
        );
      }

      // Decode the first record and compare.
      const writtenUrl = ndefMessage
        .map((record) => {
          try {
            return Ndef.uri.decodePayload(Uint8Array.from(record.payload as number[]));
          } catch {
            return null;
          }
        })
        .find((decoded) => decoded === url);

      if (!writtenUrl) {
        throw new NfcError(
          'Verification failed: the written URL does not match the expected value',
          'VERIFY_FAILED',
        );
      }

      return { uid };
    } finally {
      // Always release the NFC technology, even on error.
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
  /**
   * Acquire the NDEF technology, read the first URI record from the tag,
   * then release the technology.
   */
  private async _performRead(): Promise<{ url: string }> {
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        ...(Platform.OS === 'ios' && {
          alertMessage: 'Hold your phone near the NFC card',
        }),
      });

      // ── Read tag ───────────────────────────────────────────────────────
      const tag = await NfcManager.getTag();
      if (!tag) {
        throw new NfcError('No NFC tag detected', 'TAG_LOST');
      }

      const readTag = await NfcManager.ndefHandler.getNdefMessage();
      const ndefMessage = readTag?.ndefMessage;

      if (!ndefMessage || ndefMessage.length === 0) {
        throw new NfcError('No NDEF data found on this tag', 'UNKNOWN');
      }

      // Decode the first URI record.
      let decodedUrl: string | null = null;
      for (const record of ndefMessage) {
        try {
          const decoded = Ndef.uri.decodePayload(Uint8Array.from(record.payload as number[]));
          if (decoded) {
            decodedUrl = decoded;
            break;
          }
        } catch {
          // Skip undecodable records
        }
      }

      if (!decodedUrl) {
        throw new NfcError('Could not decode a URL from this tag', 'UNKNOWN');
      }

      return { url: decodedUrl };
    } finally {
      // Always release the NFC technology, even on error.
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}

/** Singleton instance — import this in hooks and screens. */
export const nfcService = new NfcService();
