import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../state';
import { AuthProvider } from '../features/auth';

export default function RootLayout() {
  const router = useRouter();

  /**
   * Called by AuthProvider when a refresh-token failure is detected
   * (token family revoked — Requirement 1.11).
   *
   * Clears React Query cache so stale data is not served after sign-out,
   * then navigates to the entry point which will show the welcome screen.
   */
  const handleSignOut = () => {
    queryClient.clear();
    router.replace('/');
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider onSignOut={handleSignOut}>
        <Stack />
      </AuthProvider>
    </QueryClientProvider>
  );
}
