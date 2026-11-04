/**
 * NFC types for TapSync mobile app
 * Matches the interface specified in design.md
 */

/**
 * NFC write state machine states
 */
export type NfcWriteState =
  | { status: 'idle' }
  | { status: 'unsupported' }
  | { status: 'disabled' }
  | { status: 'waiting' } // awaiting tag
  | { status: 'writing' }
  | { status: 'verifying' }
  | { status: 'success'; uid: string }
  | { status: 'error'; code: NfcErrorCode; message: string };

/**
 * NFC error codes
 */
export type NfcErrorCode =
  | 'TIMEOUT'
  | 'TAG_LOST'
  | 'NOT_WRITABLE'
  | 'TOO_SMALL'
  | 'VERIFY_FAILED'
  | 'USER_CANCELLED'
  | 'ALREADY_BOUND'
  | 'UNKNOWN';

/**
 * NFC write options
 */
export interface NfcWriteOptions {
  /** Timeout in milliseconds (default: 20000) */
  timeoutMs?: number;
}

/**
 * NFC service interface as defined in design.md
 */
export interface NfcServiceInterface {
  isSupported(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  writeProfileUrl(url: string, opts?: NfcWriteOptions): Promise<{ uid: string }>;
  readTag(opts?: NfcWriteOptions): Promise<{ url: string }>;
  cancel(): Promise<void>;
}
