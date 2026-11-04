/**
 * useNfcWriter – React hook implementing the NFC write state machine.
 *
 * State transitions:
 *
 *   idle ──(startWrite)──► waiting ──► writing ──► verifying ──► success
 *                                                              │
 *                                         (NfcError/error)◄──┘
 *   any ──(cancel)──► idle
 *   error/success ──(reset)──► idle
 *
 * Platform precondition checks happen on mount:
 *   idle ──(not supported)──► unsupported
 *   idle ──(supported but disabled)──► disabled
 *
 * Requirements: 7.1–7.12
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NfcError, nfcService } from './nfc.service';
import type { NfcWriteOptions, NfcWriteState } from './types';

// ─── In-progress status set ───────────────────────────────────────────────────
// These statuses indicate an active NFC session that should be cancelled on
// unmount to avoid memory leaks and orphaned NFC sessions.
const IN_PROGRESS_STATUSES = new Set<NfcWriteState['status']>([
  'waiting',
  'writing',
  'verifying',
]);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseNfcWriterReturn {
  /** Current state of the NFC write state machine. */
  state: NfcWriteState;
  /**
   * Drive the state machine: idle → waiting → writing → verifying → success.
   * Rejects silently if already in progress (the state reflects any error).
   */
  startWrite: (url: string, opts?: NfcWriteOptions) => Promise<void>;
  /** Cancel the active NFC session and return to idle. */
  cancel: () => Promise<void>;
  /** Reset from error or success back to idle. */
  reset: () => void;
}

export function useNfcWriter(): UseNfcWriterReturn {
  const [state, setState] = useState<NfcWriteState>({ status: 'idle' });

  // Keep a ref of the current state so the cleanup effect can read it without
  // re-subscribing every render.
  const stateRef = useRef<NfcWriteState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ── Mount: check NFC availability ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supported = await nfcService.isSupported();
      if (cancelled) return;

      if (!supported) {
        setState({ status: 'unsupported' });
        return;
      }

      const enabled = await nfcService.isEnabled();
      if (cancelled) return;

      if (!enabled) {
        setState({ status: 'disabled' });
      }
      // Otherwise leave the state as idle — the user can still start a write.
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Unmount: cancel any in-progress session ───────────────────────────────
  useEffect(() => {
    return () => {
      if (IN_PROGRESS_STATUSES.has(stateRef.current.status)) {
        // Fire-and-forget: we are unmounting, we just need to release the NFC
        // technology request so the system session prompt is dismissed.
        nfcService.cancel().catch(() => {
          // Ignore – the session may already be closed.
        });
      }
    };
  }, []);

  // ── startWrite ────────────────────────────────────────────────────────────
  const startWrite = useCallback(async (url: string, opts?: NfcWriteOptions): Promise<void> => {
    // Guard: do not start a second write while one is already in progress.
    const currentStatus = stateRef.current.status;
    if (IN_PROGRESS_STATUSES.has(currentStatus)) return;

    // Transition: idle/error/success → waiting
    setState({ status: 'waiting' });

    try {
      // Transition: waiting → writing (once the NFC session starts the
      // nfcService will call requestTechnology which is the real "waiting"
      // moment, but from the UI perspective the user is waiting as soon as we
      // hit this point.  We surface the writing state just before the
      // underlying I/O begins so the screen can show "Hold your card steady").
      setState({ status: 'writing' });

      // Kick off the write.  The service itself does the hardware I/O.
      // We do NOT advance to 'verifying' here because the service bundles
      // verification into writeProfileUrl (write then read-back atomically).
      // We transition to verifying to give the UI a chance to show feedback
      // while the library reads back the tag, then the promise resolves.
      //
      // Implementation note: the service performs write-then-read-back
      // internally, so we transition to 'verifying' before awaiting the
      // result to give the UI a visual cue.  The state will be 'verifying'
      // during the read-back phase.
      setState({ status: 'verifying' });

      const { uid } = await nfcService.writeProfileUrl(url, opts);

      // Transition: verifying → success
      setState({ status: 'success', uid });
    } catch (err) {
      if (err instanceof NfcError) {
        setState({ status: 'error', code: err.code, message: err.message });
      } else {
        const message = (err as Error)?.message ?? String(err);
        setState({ status: 'error', code: 'UNKNOWN', message });
      }
    }
  }, []);

  // ── cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(async (): Promise<void> => {
    await nfcService.cancel();
    setState({ status: 'idle' });
  }, []);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback((): void => {
    setState({ status: 'idle' });
  }, []);

  return { state, startWrite, cancel, reset };
}
