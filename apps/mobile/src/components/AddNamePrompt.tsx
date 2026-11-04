/**
 * AddNamePrompt component
 *
 * A modal shown after first open when the user has not set their name yet.
 * Persists the "prompt shown" state so it is only displayed once.
 *
 * Requirements: 2.3
 */

import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../lib/api';

const STORAGE_KEY = 'tapsync_name_prompt_shown';

interface UserProfile {
  fullName?: string | null;
}

/**
 * Hook that determines whether the "Add your name" prompt should be shown.
 *
 * Rules:
 * 1. Only shows once (persisted via AsyncStorage).
 * 2. Only shows when `GET /user/me` returns `fullName` as null or empty string.
 */
function useAddNamePrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        // Skip if we already showed the prompt
        const shown = await AsyncStorage.getItem(STORAGE_KEY);
        if (shown === 'true') return;

        const profile = await api.get<UserProfile>('/user/me');
        const hasName = Boolean(profile.fullName && profile.fullName.trim().length > 0);

        if (!hasName && mounted) {
          setVisible(true);
          // Mark as shown immediately so a re-render doesn't re-trigger
          await AsyncStorage.setItem(STORAGE_KEY, 'true');
        }
      } catch {
        // If we can't check, silently skip the prompt
      }
    };

    check();

    return () => {
      mounted = false;
    };
  }, []);

  const dismiss = () => setVisible(false);

  return { visible, dismiss };
}

/**
 * "Add your name" prompt modal
 *
 * Renders nothing until the hook determines the prompt should be shown.
 */
export function AddNamePrompt() {
  const router = useRouter();
  const { visible, dismiss } = useAddNamePrompt();

  const handleAddName = () => {
    dismiss();
    router.push('/profile/edit');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <TouchableWithoutFeedback onPress={dismiss}>
        <View style={styles.overlay}>
          {/* Prevent tap-through to the overlay dismissing the modal when pressing inside */}
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>Add your name</Text>
              <Text style={styles.body}>
                You haven't set your name yet. Your public profile shows a
                placeholder until you do.
              </Text>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.laterButton}
                  onPress={dismiss}
                  activeOpacity={0.7}
                >
                  <Text style={styles.laterButtonText}>Later</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.addButton}
                  onPress={handleAddName}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addButtonText}>Add Name</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  laterButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  laterButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#0066CC',
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
