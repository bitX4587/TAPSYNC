/**
 * Auth context — exposes isAuthenticated, isLoading, and userId
 * to the entire component tree.
 *
 * The provider subscribes to token-storage changes so that every
 * sign-in, sign-out, or refresh-failure is immediately reflected
 * across all screens without any additional prop drilling.
 *
 * Requirements: 1.2, 1.11, 1.12
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { tokenStorage } from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthState {
  /** Whether the user currently has a valid session (refresh token present) */
  isAuthenticated: boolean;
  /** True while we are reading token storage on mount / app foreground */
  isLoading: boolean;
  /**
   * The public user id stored by `useCreateAnonymousAccount` in React Query
   * cache key ['auth', 'publicId'].  Populated after account creation.
   * Null until then.
   */
  userId: string | null;
}

interface AuthContextValue extends AuthState {
  /**
   * Manually re-evaluate the session state.
   * Called by AuthProvider internally; also useful for testing.
   */
  refresh: () => Promise<void>;
  /**
   * Handle a refresh-token failure (reuse / revocation).
   * Clears tokens, signals unauthenticated, and is forwarded to callers
   * (e.g. the API client) via the `onRefreshFailure` callback registered
   * with `registerRefreshFailureHandler`.
   */
  handleRefreshFailure: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Callback registry — lets the API client trigger a sign-out without
// importing React or holding a stale closure over the QueryClient.
// ---------------------------------------------------------------------------

type RefreshFailureHandler = () => Promise<void>;

let _refreshFailureHandler: RefreshFailureHandler | null = null;

/**
 * Register the global refresh-failure callback.
 * Called once by AuthProvider on mount.
 *
 * The API client (`lib/api.ts`) calls `triggerRefreshFailure()` when a
 * refresh attempt returns 401 (token family revoked — Requirement 1.11).
 */
export function registerRefreshFailureHandler(fn: RefreshFailureHandler): void {
  _refreshFailureHandler = fn;
}

/**
 * Unregister the global callback (called on AuthProvider unmount).
 */
export function unregisterRefreshFailureHandler(): void {
  _refreshFailureHandler = null;
}

/**
 * Invoked by `lib/api.ts` when token refresh fails with 401.
 * Safe to call before the provider mounts — it's a no-op in that case.
 */
export async function triggerRefreshFailure(): Promise<void> {
  if (_refreshFailureHandler) {
    await _refreshFailureHandler();
  }
}

// ---------------------------------------------------------------------------
// AuthProvider
// ---------------------------------------------------------------------------

interface AuthProviderProps {
  children: React.ReactNode;
  /**
   * Injected QueryClient clear function so this module doesn't need to
   * import queryClient directly (avoids circular deps & eases testing).
   */
  onSignOut?: () => void;
}

export function AuthProvider({ children, onSignOut }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Keep a stable ref to onSignOut to avoid re-registering on every render
  const onSignOutRef = useRef(onSignOut);
  useEffect(() => {
    onSignOutRef.current = onSignOut;
  });

  /**
   * Read token storage and update auth state.
   */
  const refresh = useCallback(async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    setIsAuthenticated(refreshToken !== null);
  }, []);

  /**
   * Called when the API client detects a revoked token family (Req 1.11).
   * Clears tokens, updates state, and calls the optional onSignOut callback
   * so the root layout can clear React Query cache and navigate to `/`.
   */
  const handleRefreshFailure = useCallback(async () => {
    await tokenStorage.clearTokens();
    setIsAuthenticated(false);
    setUserId(null);
    onSignOutRef.current?.();
  }, []);

  // On mount: read the initial auth state and register the global handler
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setIsLoading(true);
      const refreshToken = await tokenStorage.getRefreshToken();
      if (mounted) {
        setIsAuthenticated(refreshToken !== null);
        setIsLoading(false);
      }
    };

    init();

    // Register the global callback so the API client can call it
    registerRefreshFailureHandler(handleRefreshFailure);

    return () => {
      mounted = false;
      unregisterRefreshFailureHandler();
    };
  }, [handleRefreshFailure]);

  // Re-check auth state whenever the app comes back to the foreground.
  // This catches the edge-case where tokens were cleared by another tab/process.
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refresh();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [refresh]);

  const value: AuthContextValue = {
    isAuthenticated,
    isLoading,
    userId,
    refresh,
    handleRefreshFailure,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Returns the current auth context value.
 * Must be called inside an `<AuthProvider>`.
 */
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used inside <AuthProvider>');
  }
  return ctx;
}
