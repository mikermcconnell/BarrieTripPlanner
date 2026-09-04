import { Linking, Platform } from 'react-native';
import { APP_CONFIG } from '../config/constants';

const ALLOWED_PROTOCOLS = new Set(['https:', 'mailto:']);

export function isAllowedExternalUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function buildTransitContactEmailUrl({ subject = 'Barrie Transit question', body = '' } = {}) {
  return `mailto:${APP_CONFIG.TRANSIT_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildAppContactEmailUrl({ subject = 'MyBarrie Transit support', body = '' } = {}) {
  const version = APP_CONFIG.BUILD_NUMBER
    ? `${APP_CONFIG.VERSION} (${APP_CONFIG.BUILD_NUMBER})`
    : APP_CONFIG.VERSION;
  const context = `\n\nApp version: ${version}`;
  return `mailto:${APP_CONFIG.APP_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${body}${context}`)}`;
}

export async function openExternalUrl(url) {
  if (!isAllowedExternalUrl(url)) {
    return { success: false, error: 'This link is not valid.' };
  }

  try {
    const supported = typeof Linking.canOpenURL === 'function' ? await Linking.canOpenURL(url) : true;
    if (!supported) {
      return { success: false, error: 'No compatible app is available to open this link.' };
    }
    await Linking.openURL(url);
    return { success: true };
  } catch {
    return { success: false, error: 'Could not open this link. Please try again.' };
  }
}

export async function openTransitContactEmail(options) {
  return openExternalUrl(buildTransitContactEmailUrl(options));
}

export async function openAppContactEmail(options) {
  return openExternalUrl(buildAppContactEmailUrl(options));
}

export async function openTransitContactPage() {
  return openExternalUrl(APP_CONFIG.TRANSIT_CONTACT_URL);
}

export async function openDeviceTextSettings() {
  try {
    if (Platform.OS === 'android' && typeof Linking.sendIntent === 'function') {
      await Linking.sendIntent('android.settings.DISPLAY_SETTINGS');
      return { success: true };
    }

    if (Platform.OS === 'ios') {
      return {
        success: true,
        opened: false,
        message: 'Open Settings, choose Accessibility, then Display & Text Size and Larger Text.',
      };
    }

    return {
      success: true,
      opened: false,
      message: 'Use your browser zoom controls or your device accessibility settings to change text size.',
    };
  } catch {
    return { success: false, error: 'Open your device Settings and choose Display or Accessibility to change text size.' };
  }
}
