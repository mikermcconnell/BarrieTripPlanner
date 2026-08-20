/**
 * shareUtils — Platform-aware sharing for stops.
 *
 * Native: uses expo-sharing
 * Web: uses Web Share API with clipboard fallback
 */
import { Platform, Share } from 'react-native';

/**
 * Share a bus stop.
 * @param {object} stop — { id, name, code }
 */
export const shareStop = async (stop) => {
  const title = `${stop.name} (Stop #${stop.code}) - Barrie Transit`;
  const deepLink = `barrie-transit://stop/${encodeURIComponent(stop.id)}`;
  const message = `${title}\n${deepLink}`;

  if (Platform.OS === 'web') {
    // Web Share API (modern browsers)
    if (navigator.share) {
      try {
        await navigator.share({ title, text: message });
        return { success: true };
      } catch (err) {
        if (err.name === 'AbortError') return { success: false, cancelled: true };
      }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(message);
      return { success: true, copied: true };
    } catch {
      return { success: false };
    }
  }

  // Native: use React Native Share API (cross-platform)
  try {
    const result = await Share.share({ message, title });
    return { success: result.action !== Share.dismissedAction };
  } catch {
    return { success: false };
  }
};

export const getSharedTripLink = (shareId) => (
  `https://barrie-transit-trip-plan-cc84e.web.app/trip.html?id=${encodeURIComponent(shareId)}`
);

export const shareTrip = async (trip, shareId) => {
  const title = trip?.name || 'Shared MyBarrie Transit trip';
  const link = getSharedTripLink(shareId);
  const message = `${title}\nOpen and edit this trip in MyBarrie Transit:\n${link}`;

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: message, url: link });
        return { success: true, link };
      } catch (error) {
        if (error?.name === 'AbortError') return { success: false, cancelled: true, link };
      }
    }

    try {
      await navigator.clipboard.writeText(message);
      return { success: true, copied: true, link };
    } catch {
      return { success: false, link };
    }
  }

  try {
    const result = await Share.share({ title, message, url: link });
    return { success: result.action !== Share.dismissedAction, link };
  } catch {
    return { success: false, link };
  }
};
