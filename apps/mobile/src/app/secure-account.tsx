/**
 * Secure Account screen - Link recovery methods
 * 
 * Allows users to link Google, email with password, and generate recovery codes.
 * Requirements: 1.4-1.7, 1.9
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  linkGoogleAccount,
  linkEmailAccount,
  generateRecoveryCode,
  RecoveryCodeResult,
  useSecurityWarning,
} from '../features/auth';

type RecoveryMethod = 'google' | 'email' | 'code';
type LinkingState = {
  method: RecoveryMethod | null;
  loading: boolean;
  error: string | null;
};

export default function SecureAccountScreen() {
  const router = useRouter();
  const { refresh: refreshSecurityWarning } = useSecurityWarning();
  
  const [linkingState, setLinkingState] = useState<LinkingState>({
    method: null,
    loading: false,
    error: null,
  });

  // Refresh security warning state when screen is focused
  useEffect(() => {
    refreshSecurityWarning();
  }, [refreshSecurityWarning]);

  // State for email linking form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  // State for recovery code
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [codeSaved, setCodeSaved] = useState(false);

  const handleLinkGoogle = async () => {
    setLinkingState({ method: 'google', loading: true, error: null });

    try {
      // TODO: Integrate actual Google Sign-In library in later implementation
      // For now, show a placeholder message
      Alert.alert(
        'Google Sign-In Required',
        'Google Sign-In integration requires @react-native-google-signin/google-signin or expo-auth-session. This will be implemented with the full OAuth flow.',
        [
          {
            text: 'OK',
            onPress: () => setLinkingState({ method: null, loading: false, error: null }),
          },
        ]
      );

      // Example flow when integrated:
      // const { idToken } = await GoogleSignin.signIn();
      // await linkGoogleAccount(idToken);
      // Alert.alert('Success', 'Google account linked successfully');
      // await refreshSecurityWarning(); // Refresh banner state
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to link Google account';
      setLinkingState({ method: 'google', loading: false, error: errorMessage });
      Alert.alert('Error', errorMessage);
    }
  };

  const handleLinkEmail = async () => {
    // Validation
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLinkingState({ method: 'email', loading: true, error: null });

    try {
      await linkEmailAccount(email, password);

      Alert.alert(
        'Verification Email Sent',
        'Please check your email to verify your address. Your email will count as a recovery method after verification.',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowEmailForm(false);
              setEmail('');
              setPassword('');
              setConfirmPassword('');
              setLinkingState({ method: null, loading: false, error: null });
              // Note: Banner will update after email verification, not immediately
            },
          },
        ]
      );
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to link email';
      setLinkingState({ method: 'email', loading: false, error: errorMessage });

      // Check for conflict error (email already linked to another account)
      if (error?.statusCode === 409) {
        Alert.alert(
          'Email Already Used',
          'This email is already linked to another account. Please restore that account instead.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', errorMessage);
      }
    }
  };

  const handleGenerateRecoveryCode = async () => {
    setLinkingState({ method: 'code', loading: true, error: null });

    try {
      const result: RecoveryCodeResult = await generateRecoveryCode();
      setRecoveryCode(result.code);
      setCodeSaved(false);
      setLinkingState({ method: 'code', loading: false, error: null });
      
      // Refresh security warning state immediately
      await refreshSecurityWarning();
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to generate recovery code';
      setLinkingState({ method: 'code', loading: false, error: errorMessage });
      Alert.alert('Error', errorMessage);
    }
  };

  const handleConfirmCodeSaved = () => {
    setCodeSaved(true);
    Alert.alert(
      'Recovery Code Saved',
      'Your recovery code has been saved. Keep it in a safe place!',
      [
        {
          text: 'OK',
          onPress: () => {
            setRecoveryCode(null);
            setCodeSaved(false);
          },
        },
      ]
    );
  };

  const handleCloseRecoveryCode = () => {
    if (!codeSaved) {
      Alert.alert(
        'Warning',
        'Are you sure? You must save this code now - it cannot be shown again.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Close Anyway',
            style: 'destructive',
            onPress: () => {
              setRecoveryCode(null);
              setCodeSaved(false);
            },
          },
        ]
      );
    } else {
      setRecoveryCode(null);
      setCodeSaved(false);
    }
  };

  // Recovery code modal overlay
  if (recoveryCode) {
    return (
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Your Recovery Code</Text>
          <Text style={styles.modalSubtitle}>
            Save this code in a safe place. You'll need it to restore your account on a new device.
          </Text>

          <View style={styles.codeContainer}>
            <Text style={styles.codeText}>{formatRecoveryCode(recoveryCode)}</Text>
          </View>

          <Text style={styles.warningText}>
            ⚠️ This code will only be shown once. Generating a new code will invalidate this one.
          </Text>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton, codeSaved && styles.buttonDisabled]}
            onPress={handleConfirmCodeSaved}
            disabled={codeSaved}
          >
            <Text style={styles.buttonText}>
              {codeSaved ? '✓ Saved' : 'I Saved It'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleCloseRecoveryCode}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Secure Your Account</Text>
        <Text style={styles.subtitle}>
          Add a recovery method so you can access your account on a new device if you lose this one.
        </Text>
      </View>

      {/* Google Sign-In Option */}
      <View style={styles.methodCard}>
        <View style={styles.methodHeader}>
          <Text style={styles.methodIcon}>🔐</Text>
          <View style={styles.methodInfo}>
            <Text style={styles.methodTitle}>Link Google Account</Text>
            <Text style={styles.methodDescription}>
              Sign in with Google to recover your account
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleLinkGoogle}
          disabled={linkingState.loading && linkingState.method === 'google'}
        >
          {linkingState.loading && linkingState.method === 'google' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Link Google</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Email & Password Option */}
      <View style={styles.methodCard}>
        <View style={styles.methodHeader}>
          <Text style={styles.methodIcon}>📧</Text>
          <View style={styles.methodInfo}>
            <Text style={styles.methodTitle}>Link Email & Password</Text>
            <Text style={styles.methodDescription}>
              Use email and password to restore your account
            </Text>
          </View>
        </View>

        {!showEmailForm ? (
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={() => setShowEmailForm(true)}
          >
            <Text style={styles.buttonText}>Link Email</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!linkingState.loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password (min 8 characters)</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor="#999"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!linkingState.loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor="#999"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!linkingState.loading}
              />
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, styles.halfButton]}
                onPress={() => {
                  setShowEmailForm(false);
                  setEmail('');
                  setPassword('');
                  setConfirmPassword('');
                }}
                disabled={linkingState.loading && linkingState.method === 'email'}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.primaryButton, styles.halfButton]}
                onPress={handleLinkEmail}
                disabled={linkingState.loading && linkingState.method === 'email'}
              >
                {linkingState.loading && linkingState.method === 'email' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Link Email</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.helpText}>
              A verification email will be sent. Your email counts as a recovery method after verification.
            </Text>
          </View>
        )}
      </View>

      {/* Recovery Code Option */}
      <View style={styles.methodCard}>
        <View style={styles.methodHeader}>
          <Text style={styles.methodIcon}>🔑</Text>
          <View style={styles.methodInfo}>
            <Text style={styles.methodTitle}>Recovery Code</Text>
            <Text style={styles.methodDescription}>
              Generate a code to restore access (shown once)
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleGenerateRecoveryCode}
          disabled={linkingState.loading && linkingState.method === 'code'}
        >
          {linkingState.loading && linkingState.method === 'code' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Generate Code</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.helpText}>
          The code will be shown once. Save it in a safe place like a password manager.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      {/* Privacy Policy link */}
      <TouchableOpacity
        style={styles.privacyLink}
        onPress={() => Linking.openURL('https://tapsync.app/privacy')}
        accessibilityRole="link"
        accessibilityLabel="View Privacy Policy"
      >
        <Text style={styles.privacyLinkText}>Privacy Policy</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/**
 * Format recovery code with spaces every 5 characters for readability
 * Example: "abc12" => "abc12"
 *          "abcdefghij12345" => "abcde fghij 12345"
 */
function formatRecoveryCode(code: string): string {
  return code.match(/.{1,5}/g)?.join(' ') || code;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  methodCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  methodHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  methodIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  methodDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  form: {
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f9f9f9',
    fontSize: 16,
    color: '#1a1a1a',
    minHeight: 48,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  halfButton: {
    flex: 1,
  },
  helpText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  privacyLink: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  privacyLinkText: {
    fontSize: 14,
    color: '#8E8E93',
    textDecorationLine: 'underline',
  },

  // Modal styles for recovery code display
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  codeContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  codeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
    letterSpacing: 2,
    fontFamily: 'monospace',
  },
  warningText: {
    fontSize: 13,
    color: '#FF9500',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
});
