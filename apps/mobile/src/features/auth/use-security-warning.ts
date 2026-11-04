/**
 * Hook for managing the security warning banner state
 * 
 * Handles:
 * - Dismissal state persistence
 * - Detection of unsecured accounts (no recovery method)
 * - Re-showing banner after first card programmed
 * 
 * Requirements: 1.9
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../lib/api';

const STORAGE_KEY = 'tapsync_security_warning_dismissed';
const STORAGE_KEY_FIRST_CARD = 'tapsync_first_card_programmed';

interface UserProfile {
  hasEmailLinked: boolean;
  hasGoogleLinked: boolean;
  hasRecoveryCode: boolean;
}

interface UseSecurityWarningResult {
  /** Whether the banner should be visible */
  showBanner: boolean;
  /** Whether the account has at least one recovery method */
  hasRecoveryMethod: boolean;
  /** Whether data is still loading */
  loading: boolean;
  /** Dismiss the banner (persisted to storage) */
  dismissBanner: () => Promise<void>;
  /** Check if this is the first card programmed and show banner if so */
  checkFirstCardProgrammed: () => Promise<void>;
  /** Manually refresh the recovery method status */
  refresh: () => Promise<void>;
}

/**
 * Hook to manage security warning banner visibility
 * 
 * The banner is shown when:
 * 1. User has no recovery method AND has not dismissed it
 * 2. User just programmed their first card (even if previously dismissed)
 * 
 * @returns Banner state and control functions
 */
export function useSecurityWarning(): UseSecurityWarningResult {
  const [showBanner, setShowBanner] = useState(false);
  const [hasRecoveryMethod, setHasRecoveryMethod] = useState(true);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  /**
   * Fetch user profile and check for recovery methods
   */
  const checkRecoveryMethods = useCallback(async (): Promise<boolean> => {
    try {
      const profile = await api.get<UserProfile>('/user/me');
      const hasMethod = 
        profile.hasEmailLinked || 
        profile.hasGoogleLinked || 
        profile.hasRecoveryCode;
      
      setHasRecoveryMethod(hasMethod);
      return hasMethod;
    } catch (error) {
      console.error('Failed to check recovery methods:', error);
      // On error, assume secured to avoid showing banner incorrectly
      setHasRecoveryMethod(true);
      return true;
    }
  }, []);

  /**
   * Load dismissed state from storage
   */
  const loadDismissedState = useCallback(async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(STORAGE_KEY);
      const isDismissed = value === 'true';
      setDismissed(isDismissed);
      return isDismissed;
    } catch (error) {
      console.error('Failed to load dismissed state:', error);
      return false;
    }
  }, []);

  /**
   * Initial load: check recovery methods and dismissed state
   */
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      setLoading(true);
      
      const [hasMethod, isDismissed] = await Promise.all([
        checkRecoveryMethods(),
        loadDismissedState(),
      ]);

      if (mounted) {
        // Show banner if no recovery method and not dismissed
        setShowBanner(!hasMethod && !isDismissed);
        setLoading(false);
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [checkRecoveryMethods, loadDismissedState]);

  /**
   * Dismiss the banner and persist to storage
   */
  const dismissBanner = useCallback(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, 'true');
      setDismissed(true);
      setShowBanner(false);
    } catch (error) {
      console.error('Failed to save dismissed state:', error);
      // Still hide the banner in the UI
      setShowBanner(false);
    }
  }, []);

  /**
   * Check if this is the first card programmed
   * If so, re-show the banner (Requirement 1.9)
   */
  const checkFirstCardProgrammed = useCallback(async () => {
    try {
      // Check if we've already shown the banner for the first card
      const firstCardShown = await AsyncStorage.getItem(STORAGE_KEY_FIRST_CARD);
      
      if (firstCardShown === 'true') {
        // Already shown banner for first card, don't show again
        return;
      }

      // Check if user has any recovery method
      const hasMethod = await checkRecoveryMethods();
      
      if (!hasMethod) {
        // Mark that we've shown the banner for the first card
        await AsyncStorage.setItem(STORAGE_KEY_FIRST_CARD, 'true');
        
        // Clear the dismissed state to show the banner again
        await AsyncStorage.removeItem(STORAGE_KEY);
        setDismissed(false);
        setShowBanner(true);
      }
    } catch (error) {
      console.error('Failed to check first card programmed:', error);
    }
  }, [checkRecoveryMethods]);

  /**
   * Manually refresh recovery method status
   * Useful after linking a recovery method
   */
  const refresh = useCallback(async () => {
    const hasMethod = await checkRecoveryMethods();
    
    // If user now has a recovery method, hide the banner
    if (hasMethod) {
      setShowBanner(false);
    } else if (!dismissed) {
      // If still no recovery method and not dismissed, show banner
      setShowBanner(true);
    }
  }, [checkRecoveryMethods, dismissed]);

  return {
    showBanner,
    hasRecoveryMethod,
    loading,
    dismissBanner,
    checkFirstCardProgrammed,
    refresh,
  };
}
