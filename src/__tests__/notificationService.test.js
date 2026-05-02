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
  getNotificationSettings,
  registerForPushNotifications,
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
});
