/**
 * reviewService — Prompts users for app store review after positive moments.
 *
 * Triggers after 3rd completed navigation.
 * Respects 90-day cooldown. Web: no-op.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REVIEW_KEY = '@barrie_transit_review_requested';
const NAV_COUNT_KEY = '@barrie_transit_nav_complete_count';
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const TRIGGER_COUNT = 3;

/**
 * Call after a navigation is completed. Requests review on the 3rd completion
 * if cooldown has elapsed. No-op on web.
 */
export const maybeRequestReview = async () => {
  if (Platform.OS === 'web') return;

  try {
    // Increment nav completion count
    const raw = await AsyncStorage.getItem(NAV_COUNT_KEY);
    const count = (parseInt(raw, 10) || 0) + 1;
    await AsyncStorage.setItem(NAV_COUNT_KEY, String(count));

    if (count < TRIGGER_COUNT) return;

    // Check cooldown
    const lastRequested = await AsyncStorage.getItem(REVIEW_KEY);
    if (lastRequested) {
      const elapsed = Date.now() - parseInt(lastRequested, 10);
      if (elapsed < COOLDOWN_MS) return;
    }

    // Request review
    const StoreReview = await import('expo-store-review');
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
      await AsyncStorage.setItem(REVIEW_KEY, String(Date.now()));
      // Reset count so it doesn't trigger every navigation after 3
      await AsyncStorage.setItem(NAV_COUNT_KEY, '0');
    }
  } catch {
    // Non-critical — never block app flow
  }
};
