/**
 * Unit tests for useNfcWriter hook
 *
 * Tests cover:
 *  - Mount: NFC support/enabled checks drive initial state
 *  - startWrite: state machine transitions (idle → waiting → writing → verifying → success)
 *  - startWrite: error transitions for all NfcErrorCodes
 *  - startWrite: guard against concurrent writes
 *  - cancel: returns to idle and cancels the NFC session
 *  - reset: returns to idle from error and success
 *  - Unmount: cancel is called if a write is in-progress
 *
 * Requirements: 7.1–7.12
 */

import { act, renderHook } from '@testing-library/react-native';

// ─── Mock nfcService ──────────────────────────────────────────────────────────
//
// Jest hoists jest.mock() calls to the top of the file before any variable
// declarations, so the factory CANNOT reference variables declared outside it.
// The only exception is variables whose names begin with "mock" (case-insensitive).
//
// Strategy:
//  - Define NfcError and the service mock fns inside the factory with a "mock" prefix.
//  - Re-export them through the module so tests can import them.

jest.mock('./nfc.service', () => {
  // This class must live entirely inside the factory so that instanceof checks
  // in the hook work correctly against the same class that the factory exposes.
  class MockNfcError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'NfcError';
      this.code = code;
    }
  }

  return {
    __esModule: true,
    NfcError: MockNfcError,
    nfcService: {
      isSupported: jest.fn(),
      isEnabled: jest.fn(),
      writeProfileUrl: jest.fn(),
      cancel: jest.fn(),
    },
  };
});

// Import after the mock is registered so we get the mocked versions.
import { NfcError, nfcService } from './nfc.service';
import { useNfcWriter } from './useNfcWriter';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_URL = 'https://tapsync.app/c/testid123';
const TEST_UID = '04AABBCCDD1234';

// Typed references to the mock fns so TypeScript is happy.
const mockIsSupported = nfcService.isSupported as jest.Mock;
const mockIsEnabled = nfcService.isEnabled as jest.Mock;
const mockWriteProfileUrl = nfcService.writeProfileUrl as jest.Mock;
const mockCancel = nfcService.cancel as jest.Mock;

/** Set up the nfcService mock for a successful write scenario. */
function setupHappyPath() {
  mockIsSupported.mockResolvedValue(true);
  mockIsEnabled.mockResolvedValue(true);
  mockWriteProfileUrl.mockResolvedValue({ uid: TEST_UID });
  mockCancel.mockResolvedValue(undefined);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useNfcWriter', () => {
  beforeEach(() => {
    mockIsSupported.mockReset();
    mockIsEnabled.mockReset();
    mockWriteProfileUrl.mockReset();
    mockCancel.mockReset();
  });

  // ── Mount behaviour ────────────────────────────────────────────────────────

  describe('mount: NFC availability check', () => {
    it('starts with idle state before async checks complete', () => {
      // Make checks hang so we can inspect the pre-resolution state.
      mockIsSupported.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useNfcWriter());
      expect(result.current.state.status).toBe('idle');
    });

    it('stays idle when NFC is supported and enabled', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockIsEnabled.mockResolvedValue(true);

      const { result } = renderHook(() => useNfcWriter());

      // Let the async effect settle.
      await act(async () => {});

      expect(result.current.state.status).toBe('idle');
    });

    it('transitions to "unsupported" when isSupported returns false', async () => {
      mockIsSupported.mockResolvedValue(false);

      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      expect(result.current.state.status).toBe('unsupported');
    });

    it('transitions to "disabled" when supported but isEnabled returns false', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockIsEnabled.mockResolvedValue(false);

      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      expect(result.current.state.status).toBe('disabled');
    });
  });

  // ── startWrite: happy path ─────────────────────────────────────────────────

  describe('startWrite: success path', () => {
    it('resolves to success with uid after write completes', async () => {
      setupHappyPath();
      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {}); // settle mount check

      await act(async () => {
        await result.current.startWrite(TEST_URL);
      });

      expect(result.current.state).toEqual({ status: 'success', uid: TEST_UID });
    });

    it('calls nfcService.writeProfileUrl with the correct url and options', async () => {
      setupHappyPath();
      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      await act(async () => {
        await result.current.startWrite(TEST_URL, { timeoutMs: 5000 });
      });

      expect(mockWriteProfileUrl).toHaveBeenCalledWith(TEST_URL, { timeoutMs: 5000 });
    });

    it('uses default options when no opts are provided', async () => {
      setupHappyPath();
      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      await act(async () => {
        await result.current.startWrite(TEST_URL);
      });

      expect(mockWriteProfileUrl).toHaveBeenCalledWith(TEST_URL, undefined);
    });

    it('is in "verifying" state while writeProfileUrl is in flight', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockIsEnabled.mockResolvedValue(true);
      mockCancel.mockResolvedValue(undefined);

      let resolveWrite!: (v: { uid: string }) => void;
      mockWriteProfileUrl.mockReturnValue(
        new Promise<{ uid: string }>((res) => { resolveWrite = res; }),
      );

      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      // Start the write – do NOT await so we can observe mid-flight state.
      act(() => { void result.current.startWrite(TEST_URL); });

      // The hook transitions to 'verifying' before awaiting writeProfileUrl.
      expect(result.current.state.status).toBe('verifying');

      // Resolve and confirm the final state.
      await act(async () => { resolveWrite({ uid: TEST_UID }); });
      expect(result.current.state).toEqual({ status: 'success', uid: TEST_UID });
    });
  });

  // ── startWrite: error transitions ─────────────────────────────────────────

  describe('startWrite: error states', () => {
    const errorCases: Array<{ code: string; message: string }> = [
      { code: 'TIMEOUT', message: 'NFC write operation timed out' },
      { code: 'TAG_LOST', message: 'NFC tag was removed during the operation' },
      { code: 'NOT_WRITABLE', message: 'NFC tag is read-only' },
      { code: 'TOO_SMALL', message: 'Tag capacity is too small' },
      { code: 'VERIFY_FAILED', message: 'Verification failed' },
      { code: 'USER_CANCELLED', message: 'NFC operation was cancelled by the user' },
      { code: 'UNKNOWN', message: 'Unknown error occurred' },
    ];

    it.each(errorCases)('transitions to error with code $code', async ({ code, message }) => {
      mockIsSupported.mockResolvedValue(true);
      mockIsEnabled.mockResolvedValue(true);
      mockWriteProfileUrl.mockRejectedValue(new NfcError(message, code));

      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      await act(async () => {
        await result.current.startWrite(TEST_URL);
      });

      expect(result.current.state).toEqual({ status: 'error', code, message });
    });

    it('transitions to error with UNKNOWN code for non-NfcError exceptions', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockIsEnabled.mockResolvedValue(true);
      mockWriteProfileUrl.mockRejectedValue(new Error('Unexpected failure'));

      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      await act(async () => {
        await result.current.startWrite(TEST_URL);
      });

      expect(result.current.state).toEqual({
        status: 'error',
        code: 'UNKNOWN',
        message: 'Unexpected failure',
      });
    });
  });

  // ── startWrite: concurrency guard ─────────────────────────────────────────

  describe('startWrite: concurrency guard', () => {
    it('does not start a second write while one is in progress', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockIsEnabled.mockResolvedValue(true);
      mockCancel.mockResolvedValue(undefined);
      // First write never resolves.
      mockWriteProfileUrl.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      act(() => { void result.current.startWrite(TEST_URL); });
      act(() => { void result.current.startWrite(TEST_URL); }); // should be ignored

      // writeProfileUrl should only have been called once.
      expect(mockWriteProfileUrl).toHaveBeenCalledTimes(1);
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('calls nfcService.cancel and transitions to idle', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockIsEnabled.mockResolvedValue(true);
      mockCancel.mockResolvedValue(undefined);
      // Start a write that never resolves so we can cancel mid-write.
      mockWriteProfileUrl.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      act(() => { void result.current.startWrite(TEST_URL); });

      await act(async () => {
        await result.current.cancel();
      });

      expect(mockCancel).toHaveBeenCalled();
      expect(result.current.state.status).toBe('idle');
    });
  });

  // ── reset ──────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('transitions from error to idle', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockIsEnabled.mockResolvedValue(true);
      mockWriteProfileUrl.mockRejectedValue(new NfcError('Tag lost', 'TAG_LOST'));

      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      await act(async () => {
        await result.current.startWrite(TEST_URL);
      });

      expect(result.current.state.status).toBe('error');

      act(() => { result.current.reset(); });

      expect(result.current.state.status).toBe('idle');
    });

    it('transitions from success to idle', async () => {
      setupHappyPath();

      const { result } = renderHook(() => useNfcWriter());
      await act(async () => {});

      await act(async () => {
        await result.current.startWrite(TEST_URL);
      });

      expect(result.current.state.status).toBe('success');

      act(() => { result.current.reset(); });

      expect(result.current.state.status).toBe('idle');
    });
  });

  // ── unmount cleanup ────────────────────────────────────────────────────────

  describe('unmount cleanup', () => {
    it('calls nfcService.cancel when unmounted during an active write', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockIsEnabled.mockResolvedValue(true);
      mockWriteProfileUrl.mockReturnValue(new Promise(() => {}));
      mockCancel.mockResolvedValue(undefined);

      const { result, unmount } = renderHook(() => useNfcWriter());
      await act(async () => {});

      // Start a write that never resolves (simulates tag waiting).
      act(() => { void result.current.startWrite(TEST_URL); });

      unmount();

      // cancel should have been called by the cleanup effect.
      expect(mockCancel).toHaveBeenCalled();
    });

    it('does not call nfcService.cancel on unmount when idle', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockIsEnabled.mockResolvedValue(true);
      mockCancel.mockResolvedValue(undefined);

      const { unmount } = renderHook(() => useNfcWriter());
      await act(async () => {});

      unmount();

      expect(mockCancel).not.toHaveBeenCalled();
    });

    it('does not call nfcService.cancel on unmount after a successful write', async () => {
      setupHappyPath();

      const { result, unmount } = renderHook(() => useNfcWriter());
      await act(async () => {});

      await act(async () => {
        await result.current.startWrite(TEST_URL);
      });

      // Clear cancel calls that may have occurred inside startWrite.
      mockCancel.mockClear();

      unmount();

      expect(mockCancel).not.toHaveBeenCalled();
    });
  });
});
