const {
  resolveDetourRecipients,
  isRiderNotifiable,
  isServiceRestoration,
  notificationId,
  mergeNotifiedDevices,
  resolveRestorationRecipients,
  pruneDetourNotificationRecords,
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

  test('recognizes only GPS-proven returns to regular routing', () => {
    const restored = {
      eventType: 'DETOUR_CLEARED',
      clearReason: 'normal-route-observed',
      clearProof: { evidenceType: 'normal-route-gps' },
    };
    expect(isServiceRestoration(restored)).toBe(true);
    expect(isServiceRestoration({ ...restored, clearProof: null })).toBe(false);
    expect(isServiceRestoration({ ...restored, clearReason: 'operator-cleared' })).toBe(false);
    expect(isServiceRestoration({ ...restored, clearReason: 'superseded-by-event-window' })).toBe(false);
  });

  test('records only devices that actually received the original alert', () => {
    const recipients = [
      { uid: 'a', deviceId: 'phone-a', pushToken: 'ExpoPushToken[a]' },
      { uid: 'b', deviceId: 'phone-b', pushToken: 'ExpoPushToken[b]' },
    ];
    const devices = mergeNotifiedDevices([], recipients, [
      { token: 'ExpoPushToken[a]', status: 'accepted' },
      { token: 'ExpoPushToken[b]', status: 'failed' },
    ]);
    expect(devices).toEqual([expect.objectContaining({ uid: 'a', deviceId: 'phone-a' })]);
  });

  test('restoration recipients must match the original device and remain opted in', () => {
    const notifiedDevices = [{
      uid: 'a',
      deviceId: 'phone-a',
      tokenHash: require('../detourPushNotifier').tokenHash('ExpoPushToken[a]'),
    }];
    const currentUsers = [
      { uid: 'a', deviceId: 'phone-a', pushToken: 'ExpoPushToken[a]', serviceAlertsEnabled: true },
      { uid: 'a', deviceId: 'phone-b', pushToken: 'ExpoPushToken[b]', serviceAlertsEnabled: true },
      { uid: 'c', deviceId: 'phone-c', pushToken: 'ExpoPushToken[c]', serviceAlertsEnabled: true },
    ];
    expect(resolveRestorationRecipients(currentUsers, notifiedDevices).map((user) => user.deviceId)).toEqual(['phone-a']);
    expect(resolveRestorationRecipients([
      { ...currentUsers[0], serviceAlertsEnabled: false },
    ], notifiedDevices)).toEqual([]);
  });
});

describe('service restoration delivery', () => {
  test('sends only to a device recorded on the original detour alert', async () => {
    jest.resetModules();
    const { createHash } = require('crypto');
    const hashToken = (token) => createHash('sha256').update(token).digest('hex');
    const loadUsersWithPushTokens = jest.fn(async () => [
      { uid: 'a', deviceId: 'phone-a', pushToken: 'ExpoPushToken[a]', serviceAlertsEnabled: true },
      { uid: 'b', deviceId: 'phone-b', pushToken: 'ExpoPushToken[b]', serviceAlertsEnabled: true },
    ]);
    const sendExpoPushMessages = jest.fn(async (messages) => ({
      attempted: messages.length,
      accepted: messages.length,
      failed: 0,
      outcomes: messages.map((entry) => ({ uid: entry.uid, token: entry.token, status: 'accepted' })),
    }));
    jest.doMock('../pushNotifier', () => ({
      loadUsersWithPushTokens,
      sendExpoPushMessages,
      processPendingPushReceipts: jest.fn(async () => ({})),
      pruneNotificationRecords: jest.fn(async () => 0),
    }));

    const data = {
      status: 'delivered',
      routeId: '8',
      eventId: 'event-123',
      notifiedDevices: [{ uid: 'a', deviceId: 'phone-a', tokenHash: hashToken('ExpoPushToken[a]') }],
    };
    const ref = {
      set: jest.fn(async (patch) => Object.assign(data, patch)),
    };
    const doc = { id: '8-event-123', ref, data: () => ({ ...data }) };
    const where = jest.fn(() => ({
      limit: jest.fn(() => ({
        get: jest.fn(async () => ({ empty: false, docs: [doc] })),
      })),
    }));
    const db = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ref),
        where,
      })),
      runTransaction: jest.fn(async (callback) => callback({
        get: jest.fn(async () => ({ exists: true, data: () => ({ ...data }) })),
        set: jest.fn((target, patch) => Object.assign(data, patch)),
      })),
    };
    const { notifyUsersOfServiceRestorations } = require('../detourPushNotifier');
    const summary = await notifyUsersOfServiceRestorations([{
      eventType: 'DETOUR_CLEARED',
      eventId: 'event-123',
      routeId: '8',
      clearReason: 'normal-route-observed',
      clearProof: { evidenceType: 'normal-route-gps' },
      clearedAt: Date.parse('2026-07-29T12:00:00Z'),
    }], { db, nowMs: Date.parse('2026-07-29T12:00:00Z') });

    expect(summary).toMatchObject({ registered: 1, attempted: 1, accepted: 1, failed: 0 });
    expect(where).toHaveBeenCalledWith(
      'restorationStatus',
      'in',
      ['pending', 'processing', 'failed']
    );
    expect(sendExpoPushMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        uid: 'a',
        message: expect.objectContaining({
          title: 'Route 8 service restored',
          body: 'Route 8 has returned to regular routing.',
          data: expect.objectContaining({ type: 'service_restored', routeId: '8' }),
        }),
      }),
    ], { db });
    expect(data.restorationStatus).toBe('delivered');
  });
});

describe('detour notification record pruning', () => {
  const nowMs = Date.parse('2026-07-29T12:00:00Z');

  async function prune(records, activeIds = []) {
    const deletedIds = [];
    const docs = records.map(({ id, data }) => ({
      id,
      data: () => data,
      ref: { delete: jest.fn(async () => deletedIds.push(id)) },
    }));
    const get = jest.fn(async () => ({ docs }));
    const db = {
      collection: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({ get })),
        })),
      })),
    };

    const count = await pruneDetourNotificationRecords(db, nowMs, activeIds);
    return { count, deletedIds };
  }

  test('retains an active detour record older than 30 days', async () => {
    const result = await prune([{ id: '8-event-123', data: {} }], ['8-event-123']);

    expect(result).toEqual({ count: 0, deletedIds: [] });
  });

  test('retains a pending service restoration', async () => {
    const result = await prune([{
      id: '8-event-123',
      data: { restorationStatus: 'pending' },
    }]);

    expect(result).toEqual({ count: 0, deletedIds: [] });
  });

  test('retains a recently delivered service restoration', async () => {
    const result = await prune([{
      id: '8-event-123',
      data: {
        restorationStatus: 'delivered',
        restorationCompletedAt: {
          toMillis: () => nowMs - (24 * 60 * 60 * 1000),
        },
      },
    }]);

    expect(result).toEqual({ count: 0, deletedIds: [] });
  });

  test('deletes an old inactive completed record', async () => {
    const result = await prune([{
      id: '8-event-123',
      data: {
        restorationStatus: 'delivered',
        restorationCompletedAt: {
          toMillis: () => nowMs - (31 * 24 * 60 * 60 * 1000),
        },
      },
    }]);

    expect(result).toEqual({ count: 1, deletedIds: ['8-event-123'] });
  });
});
