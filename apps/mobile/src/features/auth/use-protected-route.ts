/**
 * Protected route hook
 *
 * Call this at the top of any screen that requires authentication.
 * While the session is still loading, it does nothing and lets the
 * root index screen handle the initial redirect.  Once loading is
 * complete, unauthenticated users are redirected to `/` (the entry
 * point) so the welcome screen can re-initialise the session.
 *
 * Requirements: 1.2 (silent sign-in / session gating), 1.11, 1.12
 *
 * Usage:
 *   function HomeScreen() {
 *     useProtectedRoute();
 *     // ... rest of screen
 *   }
 */

import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthContext } from './auth-context';

/**
 * Redirect unauthenticated users to the entry point (`/`).
 *
 * - If `isLoading` is true the hook is a no-op; the root index.tsx will
 *   handle the first-time redirect once the session check completes.
 * - If `isAuthenticated` is false after loading, `router.replace('/')` is
 *   called, which causes the entry point to show the welcome screen or
 *   (after a new anonymous account is created) the dashboard.
 */
export function useProtectedRoute(): void {
  const { isAuthenticated, isLoading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      // Still reading storage — nothing to do yet
      return;
    }

    if (!isAuthenticated) {
      // Session expired or was revoked; send the user back to the entry screen
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);
}
