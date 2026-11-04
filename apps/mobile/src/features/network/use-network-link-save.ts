/**
 * useNetworkLinkSave — orchestrates the My Network save flow triggered by
 * a `tapsync://` deep link.
 *
 * State machine:
 *   loading   — validating / resolving / waiting for the user profile
 *   saving    — POST /network in flight
 *   redirecting — saved successfully, navigating to My Network
 *   own-card  — the link points to the user's own profile (Req 12.4)
 *   invalid  — the Public ID / custom name format is wrong
 *   not-found — the profile does not exist (404)
 *   error    — network or unexpected error
 *
 * Requirements: 12.1, 12.4, 13.1
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useUserProfile } from '../user';
import {
  validatePublicId,
  saveNetworkContactFromLink,
  isApiErrorWithStatus,
} from './network-save';

export type LinkSaveStatus =
  | 'loading'
  | 'saving'
  | 'redirecting'
  | 'own-card'
  | 'invalid'
  | 'not-found'
  | 'error';

export interface UseNetworkLinkSaveResult {
  status: LinkSaveStatus;
  errorMessage?: string;
}

/**
 * Run the My Network save flow for a resolved Public ID.
 *
 * The hook validates the Public ID, waits for the authenticated user's
 * profile (for own-card detection), saves the contact, and navigates to
 * the My Network tab on success.
 *
 * @param publicId  The Public ID extracted from the deep link (already resolved
 *                  from a custom name by the caller if applicable).
 */
export function useNetworkLinkSave(publicId: string): UseNetworkLinkSaveResult {
  const router = useRouter();
  const { data: profile, isLoading: isProfileLoading } = useUserProfile();

  const [status, setStatus] = useState<LinkSaveStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  // Guard against running the effect more than once for the same publicId.
  const startedRef = useRef(false);

  useEffect(() => {
    // Avoid double-execution in React strict mode / re-renders.
    if (startedRef.current) {
      return;
    }

    // --- Step 1: Validate the Public ID format (Req 12.1) ---
    const validationError = validatePublicId(publicId);
    if (validationError) {
      startedRef.current = true;
      setStatus('invalid');
      setErrorMessage(validationError);
      return;
    }

    // --- Step 2: Wait for the authenticated user's profile (own-card check) ---
    if (isProfileLoading) {
      // Stay in 'loading' until the profile is available.
      return;
    }

    startedRef.current = true;

    // --- Step 3: Own-card detection (Req 12.4) ---
    const ownPublicId = profile?.publicId;
    if (ownPublicId && ownPublicId === publicId) {
      setStatus('own-card');
      return;
    }

    // --- Step 4: Save to My Network (Req 12.1, 13.1) ---
    setStatus('saving');
    saveNetworkContactFromLink(publicId)
      .then(() => {
        setStatus('redirecting');
        router.replace({
          pathname: '/(tabs)/network',
          params: { highlight: publicId },
        });
      })
      .catch((error: unknown) => {
        if (isApiErrorWithStatus(error, 404)) {
          setStatus('not-found');
          setErrorMessage('This profile could not be found.');
        } else if (isApiErrorWithStatus(error, 403)) {
          // Server-side own-card guard (defensive; client check should catch first)
          setStatus('own-card');
        } else {
          setStatus('error');
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Something went wrong. Please try again.',
          );
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId, isProfileLoading, profile?.publicId]);

  return { status, errorMessage };
}
