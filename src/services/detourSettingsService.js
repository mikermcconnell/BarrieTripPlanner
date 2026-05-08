import AsyncStorage from '@react-native-async-storage/async-storage';
import runtimeConfig from '../config/runtimeConfig';
import logger from '../utils/logger';

const DETOUR_SETTINGS_KEY = '@barrie_transit_detours_enabled';
const DETOURS_DISABLED_MESSAGE = 'Auto-detours are disabled for this build.';

export const areDetoursAvailableInBuild = () => runtimeConfig.detours.enabledByDefault === true;

export const getDetoursEnabled = async () => {
  if (!areDetoursAvailableInBuild()) {
    return false;
  }

  try {
    const storedValue = await AsyncStorage.getItem(DETOUR_SETTINGS_KEY);
    if (storedValue == null) {
      return runtimeConfig.detours.enabledByDefault;
    }

    return storedValue === 'true';
  } catch (error) {
    logger.error('Error loading detour preference:', error);
    return runtimeConfig.detours.enabledByDefault;
  }
};

export const saveDetoursEnabled = async (enabled) => {
  if (enabled && !areDetoursAvailableInBuild()) {
    return { success: false, error: DETOURS_DISABLED_MESSAGE };
  }

  try {
    await AsyncStorage.setItem(DETOUR_SETTINGS_KEY, enabled ? 'true' : 'false');
    return { success: true };
  } catch (error) {
    logger.error('Error saving detour preference:', error);
    return { success: false, error: error.message };
  }
};

export const DETOUR_SETTINGS_STORAGE_KEY = DETOUR_SETTINGS_KEY;
