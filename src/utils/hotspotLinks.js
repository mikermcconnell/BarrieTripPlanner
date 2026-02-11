/**
 * Platform-aware HotSpot app launcher
 */

import { Platform, Linking } from 'react-native';
import { HOTSPOT_LINKS } from '../data/fares';

/**
 * Open the HotSpot app/store/web portal based on current platform.
 * - Android: Play Store link, falls back to web
 * - iOS: App Store link, falls back to web
 * - Web: opens hotspotparking.com in a new tab
 */
export async function openHotSpot() {
  if (Platform.OS === 'web') {
    window.open(HOTSPOT_LINKS.web, '_blank', 'noopener');
    return;
  }

  const storeUrl = Platform.OS === 'android'
    ? HOTSPOT_LINKS.playStore
    : HOTSPOT_LINKS.appStore;

  try {
    const supported = await Linking.canOpenURL(storeUrl);
    if (supported) {
      await Linking.openURL(storeUrl);
    } else {
      await Linking.openURL(HOTSPOT_LINKS.web);
    }
  } catch {
    await Linking.openURL(HOTSPOT_LINKS.web);
  }
}
