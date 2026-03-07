import AsyncStorage from '@react-native-async-storage/async-storage';
import runtimeConfig from '../config/runtimeConfig';
import logger from '../utils/logger';

const DETOUR_SETTINGS_KEY = '@barrie_transit_detours_enabled';

export const getDetoursEnabled = async () => {
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
  try {
    await AsyncStorage.setItem(DETOUR_SETTINGS_KEY, enabled ? 'true' : 'false');
    return { success: true };
  } catch (error) {
    logger.error('Error saving detour preference:', error);
    return { success: false, error: error.message };
  }
};

export const DETOUR_SETTINGS_STORAGE_KEY = DETOUR_SETTINGS_KEY;
