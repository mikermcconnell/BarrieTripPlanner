const {
  buildSubscriberIndex,
  resolveRecipients,
  isExpoPushToken,
  sendExpoPushMessages,
  processPendingPushReceipts,
  isHolidayReminderDue,
  holidayReminderId,
  resolveHolidayReminderRecipients,
} = require('../pushNotifier');

describe('holiday service reminders', () => {
  const impact = {
    id: 'holidayService_1685_20260803',
    type: 'holiday_service',
    status: 'upcoming',
    startsAt: Date.parse('2026-08-03T00:00:00-04:00'),
    dateKey: '20260803',
    sourceNewsId: '1685',
    affectsAllRoutes: true,
  };

  test('becomes due once within the 48-hour reminder window', () => {
    expect(isHolidayReminderDue(impact, Date.parse('2026-07-31T23:59:00-04:00'))).toBe(false);
    expect(isHolidayReminderDue(impact, Date.parse('2026-08-01T00:00:00-04:00'))).toBe(true);
    expect(isHolidayReminderDue(impact, Date.parse('2026-08-03T00:00:00-04:00'))).toBe(false);
  });

  test('uses a stable Firestore-safe reminder ID', () => {
    expect(holidayReminderId(impact)).toBe('1685_20260803');
  });

  test('sends system-wide holiday reminders only to service-alert users', () => {
    const users = [
      { uid: 'alerts', serviceAlertsEnabled: true, subscribedRoutes: [] },
      { uid: 'news', serviceAlertsEnabled: false, transitNewsEnabled: true, subscribedRoutes: [] },
    ];
    expect(resolveHolidayReminderRecipients(users, impact).map((user) => user.uid)).toEqual(['alerts']);
  });
});

describe('pushNotifier quiet notification policy', () => {
  test('route-scoped news only notifies users subscribed to the affected route', () => {
    const users = [
      { pushToken: 'token-all', subscribedRoutes: [], transitNewsEnabled: true },
      { pushToken: 'token-8', subscribedRoutes: ['8'], transitNewsEnabled: true },
      { pushToken: 'token-1', subscribedRoutes: ['1'], transitNewsEnabled: true },
    ];

    const index = buildSubscriberIndex(users);
    const recipients = resolveRecipients(
      { affectedRoutes: ['8'], affectsAllRoutes: false },
      index
    );

    expect([...recipients]).toEqual(['token-8']);
  });

  test('system-wide news can notify every user who opted into transit news', () => {
    const users = [
      { pushToken: 'token-all', subscribedRoutes: [], transitNewsEnabled: true },
      { pushToken: 'token-8', subscribedRoutes: ['8'], transitNewsEnabled: true },
      { pushToken: 'token-off', subscribedRoutes: ['8'], transitNewsEnabled: false },
    ];

    const index = buildSubscriberIndex(users);
    const recipients = resolveRecipients(
      { affectedRoutes: [], affectsAllRoutes: true },
      index
    );

    expect([...recipients].sort()).toEqual(['token-8', 'token-all']);
  });

  test('general news without an all-routes flag does not generate a push', () => {
    const users = [
      { pushToken: 'token-all', subscribedRoutes: [], transitNewsEnabled: true },
      { pushToken: 'token-8', subscribedRoutes: ['8'], transitNewsEnabled: true },
    ];

    const index = buildSubscriberIndex(users);
    const recipients = resolveRecipients(
      { affectedRoutes: [], affectsAllRoutes: false },
      index
    );

    expect([...recipients]).toEqual([]);
  });
});

describe('push delivery receipts', () => {
  test('records delayed delivery failures and removes an unregistered device', async () => {
    const receiptRef = { set: jest.fn() };
    const receiptDoc = {
      id: 'receipt-1', ref: receiptRef,
      data: () => ({ uid: 'u1', deviceId: 'phone-1', token: 'ExpoPushToken[dead]' }),
    };
    const tokenSnapshot = { exists: true, data: () => ({ token: 'ExpoPushToken[dead]' }) };
    const tx = { get: jest.fn(async () => tokenSnapshot), delete: jest.fn() };
    const query = {
      where: jest.fn(() => query), limit: jest.fn(() => query),
      get: jest.fn(async () => ({ empty: false, docs: [receiptDoc] })),
    };
    const tokenDoc = {};
    const userDoc = { collection: jest.fn(() => ({ doc: jest.fn(() => tokenDoc) })) };
    const db = {
      collection: jest.fn((name) => name === 'pushNotificationReceipts'
        ? query : { doc: jest.fn(() => userDoc) }),
      runTransaction: jest.fn(async (callback) => callback(tx)),
    };
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: { 'receipt-1': { status: 'error', details: { error: 'DeviceNotRegistered' } } } }),
    }));

    await expect(processPendingPushReceipts({ db, fetchImpl, nowMs: Date.now() })).resolves.toEqual({
      checked: 1, delivered: 0, failed: 1, invalidated: 1,
    });
    expect(tx.delete).toHaveBeenCalledWith(tokenDoc);
    expect(receiptRef.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', token: null }), { merge: true });
  });
});

describe('push delivery hardening', () => {
  test('accepts only Expo push token formats', () => {
    expect(isExpoPushToken('ExpoPushToken[abc_123]')).toBe(true);
    expect(isExpoPushToken('ExponentPushToken[abc-123]')).toBe(true);
    expect(isExpoPushToken('not-a-token')).toBe(false);
  });

  test('counts accepted tickets and device registration failures', async () => {
    const transaction = { get: jest.fn(async () => ({ exists: false })), update: jest.fn() };
    const db = {
      collection: jest.fn(() => ({ doc: jest.fn(() => ({ set: jest.fn(async () => {}) })) })),
      runTransaction: jest.fn(async (callback) => callback(transaction)),
    };
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: [
        { status: 'ok', id: 'ticket-1' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
      ] }),
    }));
    const entries = [
      { uid: 'a', token: 'ExpoPushToken[a]', message: { to: 'ExpoPushToken[a]' } },
      { uid: 'b', token: 'ExpoPushToken[b]', message: { to: 'ExpoPushToken[b]' } },
    ];

    await expect(sendExpoPushMessages(entries, { db, fetchImpl })).resolves.toEqual({
      attempted: 2, accepted: 1, failed: 1, invalidated: 1,
      outcomes: [
        { uid: 'a', token: 'ExpoPushToken[a]', status: 'accepted' },
        { uid: 'b', token: 'ExpoPushToken[b]', status: 'failed' },
      ],
    });
  });
});
