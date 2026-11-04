/**
 * SecurityWarningBanner component
 * 
 * Persistent dismissible warning banner shown until a Recovery Method is linked.
 * Re-shown after the first card is programmed.
 * 
 * Requirements: 1.9
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export interface SecurityWarningBannerProps {
  /** Whether the banner is currently visible */
  visible: boolean;
  /** Callback when the user dismisses the banner */
  onDismiss: () => void;
  /** Optional custom message */
  message?: string;
}

export function SecurityWarningBanner({
  visible,
  onDismiss,
  message = 'Secure your account to avoid losing access if you lose this device.',
}: SecurityWarningBannerProps) {
  const router = useRouter();

  if (!visible) {
    return null;
  }

  const handleSecureAccount = () => {
    router.push('/secure-account');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>⚠️</Text>
        </View>
        
        <View style={styles.textContainer}>
          <Text style={styles.title}>Account Not Secured</Text>
          <Text style={styles.message}>{message}</Text>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSecureAccount}
            activeOpacity={0.7}
          >
            <Text style={styles.actionButtonText}>Secure Account</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.dismissButton}
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Text style={styles.dismissButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF4E5',
    borderBottomWidth: 1,
    borderBottomColor: '#FFD699',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  icon: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#B45309',
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: '#EA580C',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dismissButton: {
    padding: 4,
    marginLeft: 8,
  },
  dismissButtonText: {
    fontSize: 20,
    color: '#92400E',
    fontWeight: '600',
  },
});
