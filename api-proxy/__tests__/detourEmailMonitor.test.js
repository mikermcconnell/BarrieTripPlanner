const {
  buildEmailMessage,
  collectLikelyRoadNames,
  getAlertEventTypes,
  makeNotificationId,
  runDetourEmailMonitor,
} = require('../services/detourEmailMonitor');

function createFakeDb(initial = {}) {
  const collections = new Map();

  for (const [collectionName, docs] of Object.entries(initial)) {
    collections.set(collectionName, new Map(Object.entries(docs)));
  }

  function getCollection(collectionName) {
    if (!collections.has(collectionName)) {
      collections.set(collectionName, new Map());
    }
    return collections.get(collectionName);
  }

  return {
    _collections: collections,
    collection(collectionName) {
      const collection = getCollection(collectionName);
      return {
        doc(docId) {
          return {
            async get() {
              return {
                exists: collection.has(docId),
                data: () => collection.get(docId),
              };
            },
            async set(data, options = {}) {
              const previous = collection.get(docId) || {};
              collection.set(docId, options.merge ? { ...previous, ...data } : data);
            },
          };
        },
      };
    },
  };
}

const BASE_ENV = {
  DETOUR_DETECTOR_VERSION: 'v2',
  DETOUR_ALERT_RECIPIENTS: 'michaelryanmcconnell@gmail.com',
  RESEND_API_KEY: 're_test',
};

describe('detour email monitor', () => {
  test('defaults to detected events only, with optional cleared events', () => {
    expect(getAlertEventTypes({})).toEqual(['DETOUR_DETECTED']);
    expect(getAlertEventTypes({ DETOUR_ALERT_INCLUDE_CLEARED: 'true' }))
      .toEqual(['DETOUR_DETECTED', 'DETOUR_CLEARED']);
    expect(getAlertEventTypes({ DETOUR_ALERT_EVENT_TYPES: 'detour_detected, detour_cleared' }))
      .toEqual(['DETOUR_DETECTED', 'DETOUR_CLEARED']);
  });

  test('collects likely road names from event and segment-level geometry', () => {
    const roads = collectLikelyRoadNames({
      likelyDetourRoadNames: ['Owen Street'],
      segments: [
        { likelyDetourRoadNames: ['McDonald Street', 'Owen Street'] },
        { likelyDetourRoadNames: ['Mulcaster Street'] },
      ],
    });

    expect(roads).toEqual(['Owen Street', 'McDonald Street', 'Mulcaster Street']);
  });

  test('builds a useful detour email message', () => {
    const message = buildEmailMessage({
      eventType: 'DETOUR_DETECTED',
      routeId: '11',
      occurredAt: Date.parse('2026-06-24T14:00:00.000Z'),
      detectedAt: Date.parse('2026-06-24T13:55:00.000Z'),
      riderVisible: true,
      confidence: 'high',
      likelyDetourRoadNames: ['Owen Street', 'McDonald Street'],
      eventId: 'detour-event-123',
    }, { appUrl: 'https://example.com' });

    expect(message.subject).toContain('Detour detected');
    expect(message.subject).toContain('Route 11');
    expect(message.text).toContain('Owen Street, McDonald Street');
    expect(message.html).toContain('Open BTTP');
  });

  test('sends first-time detour alerts and records notification dedupe', async () => {
    const db = createFakeDb();
    const event = {
      id: 'history-doc-1',
      eventType: 'DETOUR_DETECTED',
      eventId: 'detour-event-abc',
      detourEventId: 'detour-event-abc',
      routeId: '8A',
      occurredAt: Date.parse('2026-06-24T14:00:00.000Z'),
      detectedAt: Date.parse('2026-06-24T13:55:00.000Z'),
      riderVisible: true,
      confidence: 'medium',
    };
    const queryDetourHistory = jest.fn().mockResolvedValue([event]);
    const sendEmail = jest.fn().mockResolvedValue({ id: 'email-123' });

    const result = await runDetourEmailMonitor({
      env: BASE_ENV,
      db,
      queryDetourHistory,
      sendEmail,
      now: () => Date.parse('2026-06-24T14:05:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.sentCount).toBe(1);
    expect(queryDetourHistory).toHaveBeenCalledWith(expect.objectContaining({
      eventTypes: ['DETOUR_DETECTED'],
      storageConfig: expect.objectContaining({
        detourVersion: 'v2',
        historyCollection: 'detourEventHistoryV2',
      }),
    }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 're_test',
      recipients: ['michaelryanmcconnell@gmail.com'],
      message: expect.objectContaining({
        subject: expect.stringContaining('Route 8A'),
      }),
    }));

    const notificationId = makeNotificationId(event);
    const notification = db._collections.get('detourEmailNotifications').get(notificationId);
    expect(notification).toEqual(expect.objectContaining({
      notificationId,
      eventType: 'DETOUR_DETECTED',
      detourEventId: 'detour-event-abc',
      routeId: '8A',
      providerMessageId: 'email-123',
    }));
  });

  test('does not resend already recorded notifications', async () => {
    const event = {
      id: 'history-doc-1',
      eventType: 'DETOUR_DETECTED',
      eventId: 'detour-event-abc',
      routeId: '8A',
      occurredAt: Date.parse('2026-06-24T14:00:00.000Z'),
    };
    const notificationId = makeNotificationId(event);
    const db = createFakeDb({
      detourEmailNotifications: {
        [notificationId]: { notificationId },
      },
    });
    const sendEmail = jest.fn();

    const result = await runDetourEmailMonitor({
      env: BASE_ENV,
      db,
      queryDetourHistory: jest.fn().mockResolvedValue([event]),
      sendEmail,
    });

    expect(result.sentCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('skips safely when email configuration is missing', async () => {
    const queryDetourHistory = jest.fn();

    const result = await runDetourEmailMonitor({
      env: { RESEND_API_KEY: 're_test' },
      db: createFakeDb(),
      queryDetourHistory,
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: 'no-recipients' });
    expect(queryDetourHistory).not.toHaveBeenCalled();
  });
});
