/**
 * Authentication hook for managing auth state
 * Implements Requirements 1.1, 1.2, 1.10
 */

import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createAnonymousAccount,
  hasExistingSession,
  checkAccountSecured,
  type AnonymousAccountResult,
} from './auth.service';
import { signOut } from './token-storage';

/**
 * Hook to check if user has an existing session
 * 
 * This is used on app launch to determine routing:
 * - If session exists: go to dashboard
 * - If no session: create anonymous account and go to dashboard
 * 
 * Requirements: 1.1, 1.2
 */
export function useHasSession() {
  return useQuery({
    queryKey: ['auth', 'hasSession'],
    queryFn: hasExistingSession,
    // Don't retry on failure - a missing session is not an error
    retry: false,
    // Keep this fresh so we check every time
    staleTime: 0,
  });
}

/**
 * Hook to create an anonymous account
 * 
 * Called on first app open when no session exists.
 * Automatically stores tokens and returns the publicId.
 * 
 * Requirements: 1.1, 1.2, 2.1
 */
export function useCreateAnonymousAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAnonymousAccount,
    onSuccess: (data: AnonymousAccountResult) => {
      // Invalidate the session check so it returns true next time
      queryClient.invalidateQueries({ queryKey: ['auth', 'hasSession'] });
      
      // We could also store the publicId in React Query cache if needed
      queryClient.setQueryData(['auth', 'publicId'], data.user.publicId);
    },
  });
}

/**
 * Hook for signing out with a guard for unsecured accounts
 * 
 * If the account has no recovery method, an Alert is shown warning the user
 * that signing out will permanently lose access to the account.
 * The user must confirm "Sign Out Anyway" to proceed.
 * 
 * Requirements: 1.10
 */
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutate: performSignOut, isPending } = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      // Clear all cached query data
      queryClient.clear();
      // Navigate back to the entry point (will redirect to welcome)
      router.replace('/');
    },
  });

  /**
   * Attempt to sign out.
   * 
   * If the account is not secured, shows a warning Alert first.
   * The user must explicitly confirm to proceed.
   */
  const attemptSignOut = async () => {
    const isSecured = await checkAccountSecured();

    if (!isSecured) {
      Alert.alert(
        'Account Not Secured',
        'You have not secured your account. If you sign out, you will permanently lose access to this account unless you add a recovery method first.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Sign Out Anyway',
            style: 'destructive',
            onPress: () => performSignOut(),
          },
        ],
        { cancelable: true }
      );
    } else {
      performSignOut();
    }
  };

  return {
    signOut: attemptSignOut,
    isPending,
  };
}
