/**
 * Deep link handler for `tapsync://p/{customName}`.
 *
 * Opens when a visitor presses the "Save to My Network" button on a profile
 * page reached via a custom name URL. Validates the custom name, resolves it
 * to a Public ID (following retired-name redirects), then runs the same
 * My Network save flow as the `c/[publicId]` handler.
 *
 * Requirements: 12.1, 12.4, 13.1
 */

import { useEffect, useState } from 'react';
import { useLocalSearchParams, Stack } from 'expo-router';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import {
  validateCustomName,
  resolveCustomNameToPublicId,
  isApiErrorWithStatus,
} from '../../features/network/network-save';
import { useNetworkLinkSave } from '../../features/network/use-network-link-save';

type NameResolutionStatus = 'resolving' | 'invalid' | 'not-found' | 'error' | 'resolved';

export default function CustomNameProfileScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const [resolvedPublicId, setResolvedPublicId] = useState<string | null>(null);
  const [resolutionStatus, setResolutionStatus] =
    useState<NameResolutionStatus>('resolving');
  const [resolutionError, setResolutionError] = useState<string | undefined>();

  // Resolve the custom name to a Public ID on mount.
  useEffect(() => {
    let cancelled = false;

    // --- Step 1: Validate the custom name format (Req 2.8) ---
    const validationError = validateCustomName(name ?? '');
    if (validationError) {
      setResolutionStatus('invalid');
      setResolutionError(validationError);
      return;
    }

    // --- Step 2: Resolve the custom name to a Public ID ---
    resolveCustomNameToPublicId(name)
      .then((publicId) => {
        if (!cancelled) {
          setResolvedPublicId(publicId);
          setResolutionStatus('resolved');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isApiErrorWithStatus(error, 404)) {
          setResolutionStatus('not-found');
        } else {
          setResolutionStatus('error');
          setResolutionError(
            error instanceof Error ? error.message : 'Could not resolve the profile.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [name]);

  // Once resolved, delegate to the shared save flow hook.
  const saveResult = useNetworkLinkSave(resolvedPublicId ?? '');

  return (
    <>
      <Stack.Screen options={{ title: 'Saving…' }} />
      <View style={styles.container}>
        {resolutionStatus === 'resolving' && (
          <>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.text}>Resolving profile…</Text>
          </>
        )}

        {resolutionStatus === 'invalid' && (
          <>
            <Text style={styles.emoji}>⚠️</Text>
            <Text style={styles.text}>Invalid link</Text>
            <Text style={styles.subtext}>{resolutionError}</Text>
          </>
        )}

        {resolutionStatus === 'not-found' && (
          <>
            <Text style={styles.emoji}>🔍</Text>
            <Text style={styles.text}>Profile not found</Text>
            <Text style={styles.subtext}>
              This custom name does not exist or may have been removed.
            </Text>
          </>
        )}

        {resolutionStatus === 'error' && (
          <>
            <Text style={styles.emoji}>⚠️</Text>
            <Text style={styles.text}>Something went wrong</Text>
            <Text style={styles.subtext}>
              {resolutionError ?? 'Please try again later.'}
            </Text>
          </>
        )}

        {resolutionStatus === 'resolved' && (
          <>
            {saveResult.status === 'loading' && (
              <>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.text}>Resolving profile…</Text>
              </>
            )}

            {saveResult.status === 'saving' && (
              <>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.text}>Saving to My Network…</Text>
              </>
            )}

            {saveResult.status === 'redirecting' && (
              <>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.text}>Opening My Network…</Text>
              </>
            )}

            {saveResult.status === 'own-card' && (
              <>
                <Text style={styles.emoji}>👤</Text>
                <Text style={styles.text}>This is your own card</Text>
                <Text style={styles.subtext}>
                  You can&apos;t save your own profile to My Network.
                </Text>
              </>
            )}

            {saveResult.status === 'invalid' && (
              <>
                <Text style={styles.emoji}>⚠️</Text>
                <Text style={styles.text}>Invalid link</Text>
                <Text style={styles.subtext}>{saveResult.errorMessage}</Text>
              </>
            )}

            {saveResult.status === 'not-found' && (
              <>
                <Text style={styles.emoji}>🔍</Text>
                <Text style={styles.text}>Profile not found</Text>
                <Text style={styles.subtext}>
                  This profile may have been removed or is no longer available.
                </Text>
              </>
            )}

            {saveResult.status === 'error' && (
              <>
                <Text style={styles.emoji}>⚠️</Text>
                <Text style={styles.text}>Something went wrong</Text>
                <Text style={styles.subtext}>
                  {saveResult.errorMessage ?? 'Please try again later.'}
                </Text>
              </>
            )}
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  text: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
});
