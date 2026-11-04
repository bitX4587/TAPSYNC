/**
 * Restore Account screen – placeholder for account restore flow
 * 
 * Requirements: 1.3, 1.8
 * 
 * This is a placeholder screen that will be fully implemented in Task 17.3+
 * For now, it shows the available restore options and navigates back to welcome.
 */

import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

export default function Restore() {
  const router = useRouter();

  const handleBack = () => {
    router.back();
  };

  const handleRestoreMethod = (method: 'google' | 'email' | 'code') => {
    // Placeholder - will be implemented in later tasks
    console.log(`Restore with ${method} - to be implemented`);
    // TODO: Navigate to specific restore flow screen when implemented
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Restore Account</Text>
        <Text style={styles.subtitle}>
          Choose how you want to restore your existing TapSync account
        </Text>
      </View>

      {/* Restore Options */}
      <View style={styles.options}>
        {/* Google */}
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => handleRestoreMethod('google')}
          activeOpacity={0.7}
        >
          <View style={styles.optionIcon}>
            <Text style={styles.optionIconText}>G</Text>
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Continue with Google</Text>
            <Text style={styles.optionDescription}>
              Sign in with the Google account you linked to your profile
            </Text>
          </View>
          <Text style={styles.optionArrow}>→</Text>
        </TouchableOpacity>

        {/* Email & Password */}
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => handleRestoreMethod('email')}
          activeOpacity={0.7}
        >
          <View style={styles.optionIcon}>
            <Text style={styles.optionIconText}>@</Text>
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Use Email & Password</Text>
            <Text style={styles.optionDescription}>
              Sign in with the email and password you linked
            </Text>
          </View>
          <Text style={styles.optionArrow}>→</Text>
        </TouchableOpacity>

        {/* Recovery Code */}
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => handleRestoreMethod('code')}
          activeOpacity={0.7}
        >
          <View style={styles.optionIcon}>
            <Text style={styles.optionIconText}>#</Text>
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Enter Recovery Code</Text>
            <Text style={styles.optionDescription}>
              Use the 20-character recovery code you saved
            </Text>
          </View>
          <Text style={styles.optionArrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Info Note */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          <Text style={styles.infoBold}>Note:</Text> Restoring will replace the temporary account on this device with your existing account. Your profile, links, and cards will be restored.
        </Text>
      </View>

      {/* Placeholder Notice */}
      <View style={styles.placeholderNotice}>
        <Text style={styles.placeholderText}>
          🚧 Restore functionality coming soon
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 24,
  },
  header: {
    marginBottom: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginLeft: -12,
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#0066CC',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
  },
  options: {
    gap: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  optionIconText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 18,
  },
  optionArrow: {
    fontSize: 20,
    color: '#999999',
    marginLeft: 8,
  },
  infoBox: {
    marginTop: 24,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#0066CC',
  },
  infoText: {
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 20,
  },
  infoBold: {
    fontWeight: '600',
  },
  placeholderNotice: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    color: '#E65100',
    fontWeight: '600',
  },
});
