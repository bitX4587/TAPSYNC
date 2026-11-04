/**
 * Unit tests for NfcService
 *
 * Design notes:
 *  - The NfcService singleton caches an `initialized` flag so that
 *    NfcManager.start() is only called once.  Each test re-imports a fresh
 *    instance via jest.isolateModules so the flag starts at false.
 *  - Tests that assert non-timeout errors must NOT call
 *    jest.runOnlyPendingTimers() because that would fire the 20 s timeout
 *    timer (registered before the async work begins) and shadow the expected
 *    error code.  Only the dedicated timeout test advances fake time.
 *  - writeNdefMessage, getNdefStatus and getNdefMessage live on
 *    NfcManager.ndefHandler per the react-native-nfc-manager API.
 */

import NfcManager, { Ndef, NfcTech, NdefStatus } from 'react-native-nfc-manager';

// Module-level mock so Jest can intercept imports inside the service.
jest.mock('react-native-nfc-manager', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    isSupported: jest.fn(),
    isEnabled: jest.fn(),
    requestTechnology: jest.fn(),
    getTag: jest.fn(),
    cancelTechnologyRequest: jest.fn(),
    ndefHandler: {
      writeNdefMessage: jest.fn(),
      getNdefMessage: jest.fn(),
      getNdefStatus: jest.fn(),
      makeReadOnly: jest.fn(),
      getCachedNdefMessageAndroid: jest.fn(),
    },
  },
  NfcTech: {
    Ndef: 'Ndef',
    NfcA: 'NfcA',
  },
  NdefStatus: {
    NotSupported: 1,
    ReadWrite: 2,
    ReadOnly: 3,
  },
  Ndef: {
    uriRecord: jest.fn((uri: string) => ({ tnf: 0x01, type: 'U', id: [], payload: [uri] })),
    encodeMessage: jest.fn(() => [0x01, 0x02, 0x03]),
    uri: {
      decodePayload: jest.fn(),
    },
  },
  NfcEvents: {},
}));

import type { NfcError as NfcErrorType } from './nfc.service';

describe('NfcService', () => {
  let nfcService: {
    isSupported(): Promise<boolean>;
    isEnabled(): Promise<boolean>;
    writeProfileUrl(url: string, opts?: { timeoutMs?: number }): Promise<{ uid: string }>;
    cancel(): Promise<void>;
  };
  let NfcError: typeof NfcErrorType;

  beforeEach(() => {
    // Reset all mocks (history + implementations) before each test.
    jest.resetAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();

    // Restore Ndef helpers that resetAllMocks cleared.
    (Ndef.uriRecord as jest.Mock).mockImplementation((uri: string) => ({
      tnf: 0x01,
      type: 'U',
      id: [],
      payload: [uri],
    }));
    (Ndef.encodeMessage as jest.Mock).mockReturnValue([0x01, 0x02, 0x03]);

    // Obtain a fresh module instance so the `initialized` singleton flag
    // is reset to false for every test.
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('./nfc.service');
      nfcService = mod.nfcService;
      NfcError = mod.NfcError;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── isSupported ──────────────────────────────────────────────────────────────

  describe('isSupported', () => {
    it('returns true when NFC is supported', async () => {
      (NfcManager.start as jest.Mock).mockResolvedValue(undefined);
      (NfcManager.isSupported as jest.Mock).mockResolvedValue(true);

      const result = await nfcService.isSupported();

      expect(result).toBe(true);
      expect(NfcManager.start).toHaveBeenCalled();
      expect(NfcManager.isSupported).toHaveBeenCalled();
    });

    it('returns false when NFC is not supported', async () => {
      (NfcManager.start as jest.Mock).mockResolvedValue(undefined);
      (NfcManager.isSupported as jest.Mock).mockResolvedValue(false);

      expect(await nfcService.isSupported()).toBe(false);
    });

    it('returns false when NfcManager.start throws', async () => {
      (NfcManager.start as jest.Mock).mockRejectedValue(new Error('Init failed'));

      expect(await nfcService.isSupported()).toBe(false);
    });
  });

  // ── isEnabled ────────────────────────────────────────────────────────────────

  describe('isEnabled', () => {
    it('returns true when NFC is enabled', async () => {
      (NfcManager.start as jest.Mock).mockResolvedValue(undefined);
      (NfcManager.isEnabled as jest.Mock).mockResolvedValue(true);

      expect(await nfcService.isEnabled()).toBe(true);
    });

    it('returns false when NFC is disabled', async () => {
      (NfcManager.start as jest.Mock).mockResolvedValue(undefined);
      (NfcManager.isEnabled as jest.Mock).mockResolvedValue(false);

      expect(await nfcService.isEnabled()).toBe(false);
    });
  });

  // ── writeProfileUrl ──────────────────────────────────────────────────────────

  describe('writeProfileUrl', () => {
    const mockUrl = 'https://tapsync.app/c/abc123xyz';
    const mockUid = '04123456ABCDEF';

    beforeEach(() => {
      // Common happy-path setup for NFC availability.
      (NfcManager.start as jest.Mock).mockResolvedValue(undefined);
      (NfcManager.isSupported as jest.Mock).mockResolvedValue(true);
      (NfcManager.isEnabled as jest.Mock).mockResolvedValue(true);
      (NfcManager.requestTechnology as jest.Mock).mockResolvedValue(undefined);
      (NfcManager.cancelTechnologyRequest as jest.Mock).mockResolvedValue(undefined);

      // Default tag with a writable status and sufficient capacity.
      (NfcManager.getTag as jest.Mock).mockResolvedValue({ id: mockUid });
      (NfcManager.ndefHandler.getNdefStatus as jest.Mock).mockResolvedValue({
        status: NdefStatus.ReadWrite,
        capacity: 500,
      });
      (NfcManager.ndefHandler.writeNdefMessage as jest.Mock).mockResolvedValue(undefined);
      (NfcManager.ndefHandler.getNdefMessage as jest.Mock).mockResolvedValue({
        ndefMessage: [{ payload: [0x04, 0x01] }],
      });
      (Ndef.uri.decodePayload as jest.Mock).mockReturnValue(mockUrl);
    });

    it('writes and verifies the URL, returns the tag UID', async () => {
      const result = await nfcService.writeProfileUrl(mockUrl);

      expect(result.uid).toBe(mockUid);
      expect(NfcManager.requestTechnology).toHaveBeenCalledWith(NfcTech.Ndef, expect.any(Object));
      expect(NfcManager.ndefHandler.writeNdefMessage).toHaveBeenCalledWith([0x01, 0x02, 0x03]);
      expect(NfcManager.ndefHandler.getNdefMessage).toHaveBeenCalled();
    });

    it('throws UNSUPPORTED when NFC is not supported', async () => {
      (NfcManager.isSupported as jest.Mock).mockResolvedValue(false);

      await expect(nfcService.writeProfileUrl(mockUrl)).rejects.toMatchObject({
        code: 'UNSUPPORTED',
        message: expect.stringContaining('not supported'),
      });
    });

    it('throws DISABLED when NFC is disabled', async () => {
      (NfcManager.isEnabled as jest.Mock).mockResolvedValue(false);

      await expect(nfcService.writeProfileUrl(mockUrl)).rejects.toMatchObject({
        code: 'DISABLED',
        message: expect.stringContaining('not enabled'),
      });
    });

    it('throws TAG_LOST when no tag is detected', async () => {
      (NfcManager.getTag as jest.Mock).mockResolvedValue(null);

      await expect(nfcService.writeProfileUrl(mockUrl)).rejects.toMatchObject({
        code: 'TAG_LOST',
      });
    });

    it('throws NOT_WRITABLE for a read-only tag', async () => {
      (NfcManager.ndefHandler.getNdefStatus as jest.Mock).mockResolvedValue({
        status: NdefStatus.ReadOnly,
        capacity: 500,
      });

      await expect(nfcService.writeProfileUrl(mockUrl)).rejects.toMatchObject({
        code: 'NOT_WRITABLE',
      });
    });

    it('throws TOO_SMALL when tag capacity is insufficient', async () => {
      (NfcManager.ndefHandler.getNdefStatus as jest.Mock).mockResolvedValue({
        status: NdefStatus.ReadWrite,
        capacity: 10, // too small for the URL
      });

      await expect(nfcService.writeProfileUrl(mockUrl)).rejects.toMatchObject({
        code: 'TOO_SMALL',
      });
    });

    it('throws VERIFY_FAILED when the read-back URL differs', async () => {
      (Ndef.uri.decodePayload as jest.Mock).mockReturnValue('https://wrong-url.com');

      await expect(nfcService.writeProfileUrl(mockUrl)).rejects.toMatchObject({
        code: 'VERIFY_FAILED',
      });
    });

    it('throws VERIFY_FAILED when no NDEF message is present on read-back', async () => {
      (NfcManager.ndefHandler.getNdefMessage as jest.Mock).mockResolvedValue({
        ndefMessage: [],
      });

      await expect(nfcService.writeProfileUrl(mockUrl)).rejects.toMatchObject({
        code: 'VERIFY_FAILED',
      });
    });

    it('throws TIMEOUT when the operation exceeds timeoutMs', async () => {
      // requestTechnology never resolves — simulates waiting for a tag.
      (NfcManager.requestTechnology as jest.Mock).mockImplementation(
        () => new Promise(() => { /* intentionally never resolves */ }),
      );

      const writePromise = nfcService.writeProfileUrl(mockUrl, { timeoutMs: 1000 });

      // The timeout timer was registered synchronously before any await, so
      // advancing fake time by 1000 ms fires it.
      jest.advanceTimersByTime(1000);

      await expect(writePromise).rejects.toMatchObject({ code: 'TIMEOUT' });
    });

    it('throws USER_CANCELLED when requestTechnology rejects with a cancellation error', async () => {
      (NfcManager.requestTechnology as jest.Mock).mockRejectedValue(
        new Error('Operation cancelled'),
      );

      await expect(nfcService.writeProfileUrl(mockUrl)).rejects.toMatchObject({
        code: 'USER_CANCELLED',
      });
    });

    it('calls cancelTechnologyRequest after a successful write', async () => {
      await nfcService.writeProfileUrl(mockUrl);

      expect(NfcManager.cancelTechnologyRequest).toHaveBeenCalled();
    });
  });

  // ── cancel ───────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('calls cancelTechnologyRequest', async () => {
      (NfcManager.cancelTechnologyRequest as jest.Mock).mockResolvedValue(undefined);

      await nfcService.cancel();

      expect(NfcManager.cancelTechnologyRequest).toHaveBeenCalled();
    });

    it('does not throw when cancelTechnologyRequest rejects', async () => {
      (NfcManager.cancelTechnologyRequest as jest.Mock).mockRejectedValue(
        new Error('Cancel failed'),
      );

      await expect(nfcService.cancel()).resolves.not.toThrow();
    });
  });
});
