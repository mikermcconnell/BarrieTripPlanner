import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import logger from '../utils/logger';
import { getUserFacingErrorMessage } from '../utils/userFacingErrors';

const STORAGE_KEYS = {
  PUSH_TOKEN: '@barrie_transit_push_token',
  NOTIFICATION_SETTINGS: '@barrie_transit_notification_settings',
};

export const DEFAULT_NOTIFICATION_SETTINGS = {
  serviceAlerts: true,
  tripReminders: true,
  nearbyAlerts: false,
  transitNews: false,
};

const normalizeNotificationSettings = (settings = {}) => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  ...(settings && typeof settings === 'object' ? settings : {}),
});

// Note: Notification handler is configured in App.js to avoid duplicate configuration

/**
 * Request notification permissions and get push token
 */
export const registerForPushNotifications = async ({ requestPermission = true } = {}) => {
  // Skip push notification registration on web (requires VAPID key configuration)
  if (Platform.OS === 'web') {
    logger.log('Push notifications not supported on web');
    return { success: false, error: 'Notifications are not supported on web.' };
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      if (!requestPermission) {
        return { success: false, error: 'Notifications are off. You can turn them on in device settings.' };
      }
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.log('Push notification permission denied');
      return { success: false, error: 'Notifications are off. You can turn them on in device settings.' };
    }

    // Get Expo push token using the EAS project ID from app config
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      logger.warn('EAS project ID not found in app config');
      return { success: false, error: 'Notifications are not configured for this build.' };
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

      await Notifications.setNotificationChannelAsync('news', {
        name: 'Transit News',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    return { success: true, token };
  } catch (error) {
    logger.error('Error registering for push notifications:', error);
    return { success: false, error: getUserFacingErrorMessage(error, 'Could not turn on notifications. Please try again.') };
  }
};

export const getStoredPushToken = async () => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.PUSH_TOKEN);
  } catch (error) {
    logger.error('Error reading stored push token:', error);
    return null;
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
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
        channelId: 'reminders',
      },
    });

    return { success: true, identifier };
  } catch (error) {
    logger.error('Error scheduling trip reminder:', error);
    return { success: false, error: getUserFacingErrorMessage(error, 'Could not schedule this reminder. Please try again.') };
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
    return { success: false, error: getUserFacingErrorMessage(error, 'Could not cancel this notification. Please try again.') };
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
    return { success: false, error: getUserFacingErrorMessage(error, 'Could not cancel notifications. Please try again.') };
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
    return {
      success: false,
      error: getUserFacingErrorMessage(error, 'Could not load scheduled notifications. Please try again.'),
      notifications: [],
    };
  }
};

/**
 * Show immediate local notification (for service alerts)
 */
export const showLocalNotification = async ({ title, body, data = {}, channelId = 'default' }) => {
  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: Platform.OS === 'android' && channelId ? { channelId } : null,
    });

    return { success: true, identifier };
  } catch (error) {
    logger.error('Error showing local notification:', error);
    return { success: false, error: getUserFacingErrorMessage(error, 'Could not show this notification. Please try again.') };
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
      return normalizeNotificationSettings(JSON.parse(settingsJson));
    }
    return DEFAULT_NOTIFICATION_SETTINGS;
  } catch (error) {
    logger.error('Error getting notification settings:', error);
    return DEFAULT_NOTIFICATION_SETTINGS;
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
    return { success: false, error: getUserFacingErrorMessage(error, 'Could not save notification settings. Please try again.') };
  }
};
