/**
 * Welcome screen – shown on first app open with no session
 * 
 * Requirements: 1.3
 * 
 * Flow:
 * 1. User sees the welcome screen with "Get Started" (creates anonymous account)
 * 2. Small "Restore my account" link at the bottom for existing users
 * 
 * The "Get Started" button creates an anonymous account and navigates to the dashboard.
 * The restore flow (Task 17.3+) will be implemented later.
 * 
 * Testing approach (to be implemented when Jest config is fixed):
 * - Render test: verify welcome content displays correctly
 * - Get Started button: calls createAnonymousAccount and navigates to dashboard on success
 * - Restore link: navigates to /restore screen
 * - Error handling: displays error message when account creation fails
 * - Loading states: shows spinner and disables buttons while creating account
 */

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useCreateAnonymousAccount } from '../features/auth';

export default function Welcome() {
  const router = useRouter();
  const { mutate: createAccount, isPending, isError, error } = useCreateAnonymousAccount();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleGetStarted = () => {
    createAccount(undefined, {
      onSuccess: () => {
        setIsNavigating(true);
        // Navigate to dashboard
        router.replace('/(tabs)/home');
      },
    });
  };

  const handleRestore = () => {
    // Placeholder for restore flow (will be implemented in later tasks)
    // TODO: Navigate to restore screen when implemented
    router.push('/restore' as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Hero Section */}
        <View style={styles.hero}>
          <Text style={styles.title}>Welcome to TapSync</Text>
          <Text style={styles.subtitle}>
            Your dynamic digital business card
          </Text>
          <Text style={styles.description}>
            Create your profile and share it instantly with a tap.{'\n'}
            Switch between Work and Casual modes on the fly.
          </Text>
        </View>

        {/* Error State */}
        {isError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {error instanceof Error ? error.message : 'Unable to create account'}
            </Text>
            <Text style={styles.errorHint}>Please check your connection and try again.</Text>
          </View>
        )}

        {/* Primary Action */}
        <TouchableOpacity
          style={[styles.primaryButton, (isPending || isNavigating) && styles.buttonDisabled]}
          onPress={handleGetStarted}
          disabled={isPending || isNavigating}
          activeOpacity={0.7}
        >
          {isPending || isNavigating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Get Started</Text>
          )}
        </TouchableOpacity>

        {/* Secondary Action - Restore */}
        <View style={styles.restoreContainer}>
          <Text style={styles.restoreLabel}>Already have an account?</Text>
          <TouchableOpacity
            onPress={handleRestore}
            disabled={isPending || isNavigating}
            activeOpacity={0.6}
          >
            <Text style={[styles.restoreLink, (isPending || isNavigating) && styles.restoreLinkDisabled]}>
              Restore my account
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By continuing, you agree to our Terms and Privacy Policy
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666666',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
  },
  errorText: {
    fontSize: 14,
    color: '#D32F2F',
    fontWeight: '600',
    marginBottom: 4,
  },
  errorHint: {
    fontSize: 13,
    color: '#C62828',
  },
  primaryButton: {
    backgroundColor: '#0066CC',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: '#0066CC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  restoreContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  restoreLabel: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8,
  },
  restoreLink: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0066CC',
    textDecorationLine: 'underline',
  },
  restoreLinkDisabled: {
    opacity: 0.4,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
  },
});
