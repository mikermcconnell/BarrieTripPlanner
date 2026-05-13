const mockStorage = new Map();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key) => Promise.resolve(mockStorage.has(key) ? mockStorage.get(key) : null)),
  setItem: jest.fn((key, value) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'project-id' } } },
}));

jest.mock('../utils/logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: (...args) => mockRequestPermissionsAsync(...args),
  getExpoPushTokenAsync: (...args) => mockGetExpoPushTokenAsync(...args),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { MAX: 'max', HIGH: 'high', DEFAULT: 'default' },
  AndroidNotificationPriority: { HIGH: 'high' },
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  addNotificationResponseReceivedListener: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
}));

const Notifications = require('expo-notifications');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const {
  getStoredPushToken,
  getNotificationSettings,
  registerForPushNotifications,
  scheduleTripReminder,
  showLocalNotification,
} = require('../services/notificationService');

describe('notificationService quiet defaults', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
  });

  test('defaults transit news pushes off', async () => {
    const settings = await getNotificationSettings();

    expect(settings).toEqual({
      serviceAlerts: true,
      tripReminders: true,
      nearbyAlerts: false,
      transitNews: false,
    });
  });

  test('startup registration does not request notification permission', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });

    const result = await registerForPushNotifications({ requestPermission: false });

    expect(result.success).toBe(false);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('stores and exposes the push token after permission is granted', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test-token]' });

    const result = await registerForPushNotifications();

    expect(result).toEqual({ success: true, token: 'ExponentPushToken[test-token]' });
    await expect(getStoredPushToken()).resolves.toBe('ExponentPushToken[test-token]');
  });

  test('schedules trip reminders on the reminders notification channel', async () => {
    const triggerTime = Date.now() + 10 * 60 * 1000;

    const result = await scheduleTripReminder({
      tripId: 'trip-1',
      title: 'Trip reminder',
      body: 'Your trip leaves soon.',
      triggerTime,
      data: { itineraryStartTime: triggerTime + 5 * 60 * 1000 },
    });

    expect(result).toEqual({ success: true, identifier: 'notification-id' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: expect.objectContaining({
        title: 'Trip reminder',
        body: 'Your trip leaves soon.',
        data: expect.objectContaining({
          type: 'trip_reminder',
          tripId: 'trip-1',
          itineraryStartTime: triggerTime + 5 * 60 * 1000,
        }),
      }),
      trigger: {
        type: 'date',
        date: new Date(triggerTime),
        channelId: 'reminders',
      },
    });
  });

  test('shows immediate alert notifications on the requested Android channel', async () => {
    const result = await showLocalNotification({
      title: 'Route 8 Detour',
      body: 'Route 8 is on detour.',
      data: { type: 'detour_alert', routeId: '8' },
      channelId: 'alerts',
    });

    expect(result).toEqual({ success: true, identifier: 'notification-id' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: expect.objectContaining({
        title: 'Route 8 Detour',
        body: 'Route 8 is on detour.',
        data: { type: 'detour_alert', routeId: '8' },
      }),
      trigger: { channelId: 'alerts' },
    });
  });
});
