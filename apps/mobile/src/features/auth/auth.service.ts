/**
 * Auth service for anonymous account creation and authentication
 * Implements Requirements 1.1, 1.2, 2.1
 */

import { api, tokenStorage } from '../../lib/api';

/**
 * Response from POST /auth/anonymous
 */
export interface AnonymousAccountResult {
  accessToken: string;
  refreshToken: string;
  user: {
    publicId: string;
  };
}

/**
 * Create an anonymous account and store tokens
 * 
 * This is called on first app open when no session exists.
 * The API creates a credential-less account with a generated publicId
 * and returns tokens that are stored in expo-secure-store.
 * 
 * Requirements: 1.1, 1.2, 2.1, 2.2
 */
export async function createAnonymousAccount(): Promise<AnonymousAccountResult> {
  // Call the API without auth (withAuth: false)
  const result = await api.post<AnonymousAccountResult>(
    '/auth/anonymous',
    {},
    { withAuth: false, autoRefresh: false }
  );

  // Store the tokens securely
  await tokenStorage.setTokens(result.accessToken, result.refreshToken);

  return result;
}

/**
 * Check if user has an existing session
 * 
 * Returns true if a refresh token exists in secure storage.
 * This is used to determine if we should go to the dashboard
 * or show the welcome screen.
 * 
 * Requirements: 1.2
 */
export async function hasExistingSession(): Promise<boolean> {
  const refreshToken = await tokenStorage.getRefreshToken();
  return refreshToken !== null;
}

/**
 * Clear the current session
 * This is exported for use in the restore flow and explicit sign-out
 */
export async function clearSession(): Promise<void> {
  await tokenStorage.clearTokens();
}

/**
 * Link Google account to the current user
 * 
 * Requirements: 1.4, 1.6
 */
export async function linkGoogleAccount(idToken: string): Promise<void> {
  await api.post('/auth/link/google', { idToken });
}

/**
 * Link email and password to the current user
 * 
 * Sends a verification email (email will count as recovery method after verification).
 * Requirements: 1.5, 1.6
 */
export async function linkEmailAccount(email: string, password: string): Promise<void> {
  await api.post('/auth/link/email', { email, password });
}

/**
 * Response from POST /auth/recovery-code
 */
export interface RecoveryCodeResult {
  code: string;
}

/**
 * Generate (or regenerate) a recovery code for the current user
 * 
 * The code is returned once and should be shown to the user.
 * Calling this again will invalidate the previous code.
 * 
 * Requirements: 1.7
 */
export async function generateRecoveryCode(): Promise<RecoveryCodeResult> {
  return await api.post<RecoveryCodeResult>('/auth/recovery-code');
}

/**
 * Check whether the current account has at least one recovery method
 * (Google linked, email linked, or recovery code generated).
 * 
 * Requirements: 1.10
 */
export async function checkAccountSecured(): Promise<boolean> {
  try {
    const profile = await api.get<{
      hasEmailLinked: boolean;
      hasGoogleLinked: boolean;
      hasRecoveryCode: boolean;
    }>('/user/me');

    return (
      profile.hasEmailLinked ||
      profile.hasGoogleLinked ||
      profile.hasRecoveryCode
    );
  } catch {
    // If we can't verify, err on the side of caution and treat as secured
    // so we don't block sign-out incorrectly on a network error.
    return true;
  }
}

/**
 * Sign out the current user
 * 
 * Calls POST /auth/logout then clears local tokens.
 * Callers should check `checkAccountSecured()` first and warn the user
 * if the account has no recovery method (see `useSignOut` hook).
 * 
 * Requirements: 1.10
 */
export async function signOut(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    // Always clear local tokens even if the API call fails
    await tokenStorage.clearTokens();
  }
}
