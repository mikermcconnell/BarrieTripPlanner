const {
  resolveDetourRecipients,
  isRiderNotifiable,
  notificationId,
} = require('../detourPushNotifier');

describe('detourPushNotifier', () => {
  const users = [
    { uid: 'a', pushToken: 'ExpoPushToken[a]', serviceAlertsEnabled: true, subscribedRoutes: ['8'] },
    { uid: 'b', pushToken: 'ExpoPushToken[b]', serviceAlertsEnabled: false, subscribedRoutes: ['8'] },
    { uid: 'c', pushToken: 'ExpoPushToken[c]', serviceAlertsEnabled: true, subscribedRoutes: ['1'] },
  ];

  test('only selects opted-in subscribers for the affected route', () => {
    expect(resolveDetourRecipients(users, '8').map((user) => user.uid)).toEqual(['a']);
  });

  test('suppresses hidden rider events', () => {
    expect(isRiderNotifiable({ riderVisible: false, alertVisible: true })).toBe(false);
    expect(isRiderNotifiable({ riderVisible: true, alertVisible: false })).toBe(false);
    expect(isRiderNotifiable({ riderVisible: true, alertVisible: true })).toBe(true);
  });

  test('creates a stable Firestore-safe dedupe id', () => {
    expect(notificationId({ eventId: 'event/123' }, '8A')).toBe('8A-event_123');
  });
});
