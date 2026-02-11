import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import logger from '../utils/logger';

const STORAGE_KEYS = {
  PUSH_TOKEN: '@barrie_transit_push_token',
  NOTIFICATION_SETTINGS: '@barrie_transit_notification_settings',
};

// Note: Notification handler is configured in App.js to avoid duplicate configuration

/**
 * Request notification permissions and get push token
 */
export const registerForPushNotifications = async () => {
  // Skip push notification registration on web (requires VAPID key configuration)
  if (Platform.OS === 'web') {
    logger.log('Push notifications not supported on web');
    return { success: false, error: 'Not supported on web' };
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.log('Push notification permission denied');
      return { success: false, error: 'Permission denied' };
    }

    // Get Expo push token using the EAS project ID from app config
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      logger.warn('EAS project ID not found in app config');
      return { success: false, error: 'EAS project ID not configured' };
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;
    await AsyncStorage.setItem(STORAGE_KEYS.PUSH_TOKEN, token);

    // Configure Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1a73e8',
      });

      await Notifications.setNotificationChannelAsync('alerts', {
        name: 'Service Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });

      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Trip Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    return { success: true, token };
  } catch (error) {
    logger.error('Error registering for push notifications:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Schedule a local notification for trip reminder
 */
export const scheduleTripReminder = async ({
  tripId,
  title,
  body,
  triggerTime,
  data = {},
}) => {
  try {
    const trigger = new Date(triggerTime);

    // Don't schedule if time is in the past
    if (trigger <= new Date()) {
      return { success: false, error: 'Reminder time is in the past' };
    }

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'trip_reminder', tripId, ...data },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger,
    });

    return { success: true, identifier };
  } catch (error) {
    logger.error('Error scheduling trip reminder:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Cancel a scheduled notification
 */
export const cancelNotification = async (identifier) => {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    return { success: true };
  } catch (error) {
    logger.error('Error canceling notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Cancel all scheduled notifications
 */
export const cancelAllNotifications = async () => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return { success: true };
  } catch (error) {
    logger.error('Error canceling all notifications:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get all scheduled notifications
 */
export const getScheduledNotifications = async () => {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    return { success: true, notifications };
  } catch (error) {
    logger.error('Error getting scheduled notifications:', error);
    return { success: false, error: error.message, notifications: [] };
  }
};

/**
 * Show immediate local notification (for service alerts)
 */
export const showLocalNotification = async ({ title, body, data = {} }) => {
  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // Show immediately
    });

    return { success: true, identifier };
  } catch (error) {
    logger.error('Error showing local notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Add notification response listener
 */
export const addNotificationResponseListener = (callback) => {
  return Notifications.addNotificationResponseReceivedListener(callback);
};

/**
 * Add notification received listener
 */
export const addNotificationReceivedListener = (callback) => {
  return Notifications.addNotificationReceivedListener(callback);
};

/**
 * Get notification settings
 */
export const getNotificationSettings = async () => {
  try {
    const settingsJson = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_SETTINGS);
    if (settingsJson) {
      return JSON.parse(settingsJson);
    }
    return {
      serviceAlerts: true,
      tripReminders: true,
      nearbyAlerts: false,
    };
  } catch (error) {
    logger.error('Error getting notification settings:', error);
    return {
      serviceAlerts: true,
      tripReminders: true,
      nearbyAlerts: false,
    };
  }
};

/**
 * Save notification settings
 */
export const saveNotificationSettings = async (settings) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_SETTINGS, JSON.stringify(settings));
    return { success: true };
  } catch (error) {
    logger.error('Error saving notification settings:', error);
    return { success: false, error: error.message };
  }
};
