const {
  buildDetourEmailInsights,
  buildEmailMessage,
  collectLikelyRoadNames,
  enrichEventStopNames,
  enrichEventFromActiveDetour,
  getAlertEventTypes,
  makeNotificationId,
  runDetourEmailMonitor,
  shouldSendDetourEmailEvent,
  sendViaResend,
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
      const makeQuery = (filters = [], max = null) => ({
        where(fieldName, operator, expectedValue) {
          return makeQuery([...filters, { fieldName, operator, expectedValue }], max);
        },
        limit(limitValue) {
          return makeQuery(filters, limitValue);
        },
        async get() {
          let entries = [...collection.entries()].filter(([, data]) => (
            filters.every(({ fieldName, operator, expectedValue }) => {
              if (operator !== '==') return false;
              return data?.[fieldName] === expectedValue;
            })
          ));
          if (max != null) entries = entries.slice(0, max);
          return {
            docs: entries.map(([id, data]) => ({
              id,
              exists: true,
              data: () => data,
            })),
          };
        },
      });

      return {
        where: makeQuery().where,
        limit: makeQuery().limit,
        doc(docId) {
          return {
            id: docId,
            async get() {
              return {
                id: docId,
                exists: collection.has(docId),
                data: () => collection.get(docId),
              };
            },
            async set(data, options = {}) {
              const previous = collection.get(docId) || {};
              collection.set(docId, options.merge ? { ...previous, ...data } : data);
            },
            async create(data) {
              if (collection.has(docId)) {
                const error = new Error('Document already exists');
                error.code = 6;
                throw error;
              }
              collection.set(docId, data);
            },
            async delete() {
              collection.delete(docId);
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

  test('summarizes likely closed section, detour path, and skipped stops', () => {
    const insights = buildDetourEmailInsights({
      eventType: 'DETOUR_DETECTED',
      routeId: '8A',
      eventLocationLabel: 'Bayfield Street & Sophia Street West',
      closedSegmentRoadNames: ['Bayfield Street'],
      likelyDetourRoadNames: ['Sophia Street West', 'Maple Avenue', 'Ross Street'],
      segments: [{
        skippedStops: [
          { stopCode: '101', name: 'Bayfield at Sophia' },
          { code: '102', stopName: 'Bayfield at Ross' },
        ],
      }],
    });

    expect(insights.closedSectionText)
      .toBe('Likely closed section: Bayfield Street near Bayfield Street & Sophia Street West');
    expect(insights.detourPathText)
      .toBe('Likely detour path: Sophia Street West -> Maple Avenue -> Ross Street');
    expect(insights.skippedStopsText)
      .toBe('Stops likely not served by this route: #101 Bayfield at Sophia; #102 Bayfield at Ross');
  });

  test('does not attach map images to detour emails', () => {
    const message = buildEmailMessage({
      eventType: 'DETOUR_DETECTED',
      routeId: '11',
      riderVisible: true,
      skippedSegmentPolyline: [
        { latitude: 44.3900, longitude: -79.7000 },
        { latitude: 44.3910, longitude: -79.7000 },
      ],
    });

    expect(message.attachments).toHaveLength(0);
    expect(message.html).not.toContain('<img');
    expect(message.text).toContain('Likely detour path: open BTTP to view the map');
  });

  test('enriches code-only stop text with GTFS stop names', () => {
    const gtfsData = {
      stopsByCode: new Map([
        ['335', { id: '335', code: '335', name: 'Georgian College' }],
        ['328', { id: '328', code: '328', name: 'Grizzlies Way at Duckworth' }],
      ]),
      stopsById: new Map(),
    };
    const enriched = enrichEventStopNames({
      routeId: '11',
      skippedStops: [{ stopCode: '335' }],
      segments: [{
        skippedStopCodes: ['328'],
      }],
    }, gtfsData);
    const message = buildEmailMessage(enriched);

    expect(message.text).toContain('#335 Georgian College');
    expect(message.text).toContain('#328 Grizzlies Way at Duckworth');
  });

  test('sends Resend REST attachment fields in snake_case without SDK-only aliases', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 'email-123' }),
    });

    await sendViaResend({
      apiKey: 're_test',
      from: 'BTTP Detour Alerts <onboarding@resend.dev>',
      recipients: ['michaelryanmcconnell@gmail.com'],
      message: {
        subject: 'Test',
        html: '<p>Attachment test</p>',
        text: 'Test',
        attachments: [{
          content: 'abc',
          filename: 'detour-details.txt',
          content_type: 'image/png',
          content_id: 'detour-details@bttp.local',
          contentId: 'detour-details@bttp.local',
          contentType: 'image/png',
        }],
      },
      fetchImpl,
    });

    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.attachments).toEqual([{
      content: 'abc',
      filename: 'detour-details.txt',
      content_type: 'image/png',
      content_id: 'detour-details@bttp.local',
    }]);
  });

  test('only emails detour events that are public/rider-visible', async () => {
    expect(shouldSendDetourEmailEvent({ riderVisible: true })).toBe(true);
    expect(shouldSendDetourEmailEvent({ riderVisible: false })).toBe(false);
    expect(shouldSendDetourEmailEvent({})).toBe(false);

    const db = createFakeDb();
    const hiddenEvent = {
      id: 'history-doc-hidden',
      eventType: 'DETOUR_DETECTED',
      eventId: 'detour-event-hidden',
      routeId: '8A',
      occurredAt: Date.parse('2026-06-24T14:00:00.000Z'),
      riderVisible: false,
      riderVisibilityReason: 'insufficient-geometry',
    };
    const missingVisibilityEvent = {
      id: 'history-doc-missing-visibility',
      eventType: 'DETOUR_DETECTED',
      eventId: 'detour-event-missing-visibility',
      routeId: '8B',
      occurredAt: Date.parse('2026-06-24T14:01:00.000Z'),
    };
    const visibleEvent = {
      id: 'history-doc-visible',
      eventType: 'DETOUR_DETECTED',
      eventId: 'detour-event-visible',
      routeId: '9',
      occurredAt: Date.parse('2026-06-24T14:02:00.000Z'),
      riderVisible: true,
      riderVisibilityReason: 'gps-clear-required',
    };
    const sendEmail = jest.fn().mockResolvedValue({ id: 'email-visible' });

    const result = await runDetourEmailMonitor({
      env: BASE_ENV,
      db,
      queryDetourHistory: jest.fn().mockResolvedValue([
        hiddenEvent,
        missingVisibilityEvent,
        visibleEvent,
      ]),
      getGtfsData: jest.fn().mockResolvedValue(null),
      sendEmail,
      now: () => Date.parse('2026-06-24T14:05:00.000Z'),
    });

    expect(result.sentCount).toBe(1);
    expect(result.sent[0]).toEqual(expect.objectContaining({
      id: 'history-doc-visible',
      routeId: '9',
    }));
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'history-doc-hidden', reason: 'not-rider-visible' }),
      expect.objectContaining({ id: 'history-doc-missing-visibility', reason: 'not-rider-visible' }),
    ]));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].message.subject).toContain('Route 9');
  });

  test('enriches public detour emails from the active detour document', async () => {
    const db = createFakeDb({
      activeDetourEventsV2: {
        '11:event-123:100-200': {
          routeId: '11',
          detourEventId: 'event-123',
          riderVisible: true,
          riderVisibilityReason: 'current-detour-vehicle',
          eventLocationLabel: 'Duckworth & Grove East',
          closedSegmentRoadNames: ['Grove Street East'],
          likelyDetourRoadNames: ['Duckworth Street', 'Bernick Drive', 'Cook Street'],
          skippedStops: [
            { stopCode: '335' },
            { stopCode: '328' },
          ],
          skippedSegmentPolyline: [
            { latitude: 44.4100, longitude: -79.6600 },
            { latitude: 44.4100, longitude: -79.6500 },
          ],
          likelyDetourPolyline: [
            { latitude: 44.4100, longitude: -79.6600 },
            { latitude: 44.4050, longitude: -79.6600 },
            { latitude: 44.4050, longitude: -79.6500 },
            { latitude: 44.4100, longitude: -79.6500 },
          ],
          canShowDetourPath: true,
        },
      },
    });
    const event = {
      id: 'history-doc-poor',
      eventType: 'DETOUR_DETECTED',
      eventId: 'event-123',
      detourEventId: 'event-123',
      routeId: '11',
      occurredAt: Date.parse('2026-06-25T14:00:00.000Z'),
      riderVisible: true,
      skippedSegmentPolyline: [
        { latitude: 44.4100, longitude: -79.6600 },
        { latitude: 44.4100, longitude: -79.6500 },
      ],
    };

    const enriched = await enrichEventFromActiveDetour(db, {
      activeCollection: 'activeDetourEventsV2',
    }, event);
    const named = enrichEventStopNames(enriched, {
      stopsByCode: new Map([
        ['335', { id: '335', code: '335', name: 'Georgian College' }],
        ['328', { id: '328', code: '328', name: 'Grizzlies Way at Duckworth' }],
      ]),
      stopsById: new Map(),
    });
    const message = buildEmailMessage(named);

    expect(enriched.eventLocationLabel).toBe('Duckworth & Grove East');
    expect(message.text).toContain('Area: Duckworth & Grove East');
    expect(message.text).toContain('#335 Georgian College; #328 Grizzlies Way at Duckworth');
    expect(message.text).toContain('Duckworth Street -> Bernick Drive -> Cook Street');
    expect(message.text).not.toContain('unknown road section');
    expect(message.attachments).toHaveLength(0);
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
      getGtfsData: jest.fn().mockResolvedValue(null),
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
      detourEventId: 'detour-event-abc',
      routeId: '8A',
      occurredAt: Date.parse('2026-06-24T14:00:00.000Z'),
      riderVisible: true,
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

  test('dedupes repeated history records for the same detour event', async () => {
    const db = createFakeDb();
    const baseEvent = {
      eventType: 'DETOUR_DETECTED',
      eventId: 'detour-event-repeat',
      detourEventId: 'detour-event-repeat',
      routeId: '8A',
      detectedAt: Date.parse('2026-06-24T13:55:00.000Z'),
      riderVisible: true,
    };
    const sendEmail = jest.fn().mockResolvedValue({ id: 'email-repeat' });

    const result = await runDetourEmailMonitor({
      env: BASE_ENV,
      db,
      queryDetourHistory: jest.fn().mockResolvedValue([
        {
          ...baseEvent,
          id: 'history-doc-repeat-2',
          occurredAt: Date.parse('2026-06-24T14:05:00.000Z'),
        },
        {
          ...baseEvent,
          id: 'history-doc-repeat-1',
          occurredAt: Date.parse('2026-06-24T14:00:00.000Z'),
        },
      ]),
      getGtfsData: jest.fn().mockResolvedValue(null),
      sendEmail,
      now: () => Date.parse('2026-06-24T14:10:00.000Z'),
    });

    expect(result.sentCount).toBe(1);
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'already-notified' }),
    ]));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(new Set(result.sent.map((entry) => entry.notificationId)).size).toBe(1);
  });

  test('dedupes route-level events that share a physical detour id', async () => {
    const db = createFakeDb();
    const sendEmail = jest.fn().mockResolvedValue({ id: 'email-shared' });

    const result = await runDetourEmailMonitor({
      env: BASE_ENV,
      db,
      queryDetourHistory: jest.fn().mockResolvedValue([
        {
          id: 'history-doc-shared-8a',
          eventType: 'DETOUR_DETECTED',
          eventId: 'detour-event-8a',
          detourEventId: 'detour-event-8a',
          sharedDetourEventId: 'shared-detour-main',
          routeId: '8A',
          sharedRouteIds: ['8A', '8B'],
          occurredAt: Date.parse('2026-06-24T14:00:00.000Z'),
          riderVisible: true,
        },
        {
          id: 'history-doc-shared-8b',
          eventType: 'DETOUR_DETECTED',
          eventId: 'detour-event-8b',
          detourEventId: 'detour-event-8b',
          sharedDetourEventId: 'shared-detour-main',
          routeId: '8B',
          sharedRouteIds: ['8A', '8B'],
          occurredAt: Date.parse('2026-06-24T14:01:00.000Z'),
          riderVisible: true,
        },
      ]),
      getGtfsData: jest.fn().mockResolvedValue(null),
      sendEmail,
      now: () => Date.parse('2026-06-24T14:10:00.000Z'),
    });

    expect(result.sentCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(makeNotificationId({
      eventType: 'DETOUR_DETECTED',
      sharedDetourEventId: 'shared-detour-main',
      detourEventId: 'detour-event-8a',
      routeId: '8A',
      occurredAt: Date.parse('2026-06-24T14:00:00.000Z'),
    })).toBe(makeNotificationId({
      eventType: 'DETOUR_DETECTED',
      sharedDetourEventId: 'shared-detour-main',
      detourEventId: 'detour-event-8b',
      routeId: '8B',
      occurredAt: Date.parse('2026-06-24T14:01:00.000Z'),
    }));
  });

  test('recognizes older notification records by detour event id', async () => {
    const event = {
      id: 'history-doc-new',
      eventType: 'DETOUR_DETECTED',
      eventId: 'detour-event-legacy',
      detourEventId: 'detour-event-legacy',
      routeId: '8A',
      occurredAt: Date.parse('2026-06-24T14:05:00.000Z'),
      detectedAt: Date.parse('2026-06-24T13:55:00.000Z'),
      riderVisible: true,
    };
    const oldNotificationId = 'old-timestamp-based-id';
    const db = createFakeDb({
      detourEmailNotifications: {
        [oldNotificationId]: {
          notificationId: oldNotificationId,
          eventType: 'DETOUR_DETECTED',
          detourEventId: 'detour-event-legacy',
          routeId: '8A',
          sentAt: Date.parse('2026-06-24T14:00:00.000Z'),
        },
      },
    });
    const sendEmail = jest.fn();

    const result = await runDetourEmailMonitor({
      env: BASE_ENV,
      db,
      queryDetourHistory: jest.fn().mockResolvedValue([event]),
      getGtfsData: jest.fn().mockResolvedValue(null),
      sendEmail,
      now: () => Date.parse('2026-06-24T14:10:00.000Z'),
    });

    expect(result.sentCount).toBe(0);
    expect(result.skipped).toEqual([
      expect.objectContaining({ id: 'history-doc-new', reason: 'already-notified' }),
    ]);
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
