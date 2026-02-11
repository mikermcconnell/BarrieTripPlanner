/**
 * Secure Storage Utility
 *
 * Uses expo-secure-store for encrypted storage on native (iOS/Android)
 * and falls back to AsyncStorage on web (where SecureStore is unavailable).
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let SecureStore = null;

// Only import SecureStore on native platforms
if (Platform.OS !== 'web') {
  SecureStore = require('expo-secure-store');
}

/**
 * Save a value securely
 * @param {string} key - Storage key
 * @param {string} value - Value to store (must be a string)
 */
export const secureSet = async (key, value) => {
  if (SecureStore && Platform.OS !== 'web') {
    await SecureStore.setItemAsync(key, value);
  } else {
    await AsyncStorage.setItem(key, value);
  }
};

/**
 * Retrieve a securely stored value
 * @param {string} key - Storage key
 * @returns {Promise<string|null>} Stored value or null
 */
export const secureGet = async (key) => {
  if (SecureStore && Platform.OS !== 'web') {
    return await SecureStore.getItemAsync(key);
  } else {
    return await AsyncStorage.getItem(key);
  }
};

/**
 * Delete a securely stored value
 * @param {string} key - Storage key
 */
export const secureDelete = async (key) => {
  if (SecureStore && Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
};
