/**
 * Deep link handler for `tapsync://c/{publicId}`.
 *
 * Opens when a visitor presses the "Save to My Network" button on the public
 * profile page. Validates the Public ID, skips the user's own card, saves the
 * contact to My Network (source: 'link'), then replaces the route with the
 * My Network tab and highlights the new contact.
 *
 * Requirements: 12.1, 12.4, 13.1
 */

import { useLocalSearchParams, Stack } from 'expo-router';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useNetworkLinkSave } from '../../features/network/use-network-link-save';

export default function PublicProfileScreen() {
  const { publicId } = useLocalSearchParams<{ publicId: string }>();
  const { status, errorMessage } = useNetworkLinkSave(publicId ?? '');

  return (
    <>
      <Stack.Screen options={{ title: 'Saving…' }} />
      <View style={styles.container}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.text}>Resolving profile…</Text>
          </>
        )}

        {status === 'saving' && (
          <>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.text}>Saving to My Network…</Text>
          </>
        )}

        {status === 'redirecting' && (
          <>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.text}>Opening My Network…</Text>
          </>
        )}

        {status === 'own-card' && (
          <>
            <Text style={styles.emoji}>👤</Text>
            <Text style={styles.text}>This is your own card</Text>
            <Text style={styles.subtext}>
              You can&apos;t save your own profile to My Network.
            </Text>
          </>
        )}

        {status === 'invalid' && (
          <>
            <Text style={styles.emoji}>⚠️</Text>
            <Text style={styles.text}>Invalid link</Text>
            <Text style={styles.subtext}>{errorMessage}</Text>
          </>
        )}

        {status === 'not-found' && (
          <>
            <Text style={styles.emoji}>🔍</Text>
            <Text style={styles.text}>Profile not found</Text>
            <Text style={styles.subtext}>
              This profile may have been removed or is no longer available.
            </Text>
          </>
        )}

        {status === 'error' && (
          <>
            <Text style={styles.emoji}>⚠️</Text>
            <Text style={styles.text}>Something went wrong</Text>
            <Text style={styles.subtext}>
              {errorMessage ?? 'Please try again later.'}
            </Text>
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
