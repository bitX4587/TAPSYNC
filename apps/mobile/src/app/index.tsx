/**
 * Entry screen – handles first-open flow and silent sign-in
 * 
 * Requirements: 1.1, 1.2, 1.3
 * 
 * Flow:
 * 1. Check if a session exists (refresh token in secure storage)
 * 2. If yes: redirect to dashboard (silent sign-in)
 * 3. If no: show welcome screen with "Get Started" and "Restore my account" options
 */

import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useHasSession } from '../features/auth';

export default function Index() {
  const router = useRouter();
  const { data: hasSession, isLoading: isCheckingSession } = useHasSession();

  useEffect(() => {
    if (isCheckingSession) {
      return;
    }

    // Use setTimeout to ensure the Root Layout has mounted before navigating
    const timer = setTimeout(() => {
      if (hasSession) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/welcome');
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [hasSession, isCheckingSession, router]);

  // Show loading state while checking for session
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0066CC" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});

