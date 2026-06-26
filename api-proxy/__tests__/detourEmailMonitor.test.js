const {
  buildDetourEmailInsights,
  buildDetourStaticMapAttachment,
  buildEmailMessage,
  collectLikelyRoadNames,
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

  test('renders a real static road map image from detour geometry', async () => {
    const { createCanvas } = require('@napi-rs/canvas');
    const tileCanvas = createCanvas(256, 256);
    const tileCtx = tileCanvas.getContext('2d');
    tileCtx.fillStyle = '#eef2f3';
    tileCtx.fillRect(0, 0, 256, 256);
    tileCtx.strokeStyle = '#c8d0d6';
    tileCtx.lineWidth = 4;
    tileCtx.beginPath();
    tileCtx.moveTo(0, 128);
    tileCtx.lineTo(256, 128);
    tileCtx.stroke();

    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => tileCanvas.toBuffer('image/png'),
    });

    const event = {
      eventType: 'DETOUR_DETECTED',
      routeId: '8A',
      eventLocationLabel: 'Bayfield Street & Sophia Street West',
      closedSegmentRoadNames: ['Bayfield Street'],
      likelyDetourRoadNames: ['Sophia Street West', 'Maple Avenue', 'Ross Street'],
      skippedSegmentPolyline: [
        { latitude: 44.3900, longitude: -79.7000 },
        { latitude: 44.3910, longitude: -79.7000 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.3900, longitude: -79.7000 },
        { latitude: 44.3900, longitude: -79.7020 },
        { latitude: 44.3910, longitude: -79.7020 },
        { latitude: 44.3910, longitude: -79.7000 },
      ],
      canShowDetourPath: true,
    };

    const attachment = await buildDetourStaticMapAttachment(event, { fetchImpl });
    expect(attachment).toEqual(expect.objectContaining({
      filename: 'detour-map-inline.png',
      content_type: 'image/png',
      content_id: 'detour-map@bttp.local',
    }));
    expect(attachment).not.toHaveProperty('contentId');
    expect(attachment).not.toHaveProperty('contentType');
    expect(Buffer.from(attachment.content, 'base64').toString('hex', 0, 4)).toBe('89504e47');
    expect(fetchImpl).toHaveBeenCalled();

    const message = buildEmailMessage(event, { mapAttachment: attachment });
    expect(message.html).toContain('cid:detour-map@bttp.local');
    expect(message.html).toContain('open the attached detour-map.png');
    expect(message.attachments).toHaveLength(2);
    expect(message.attachments[0]).toEqual(attachment);
    expect(message.attachments[1]).toEqual({
      content: attachment.content,
      filename: 'detour-map.png',
      content_type: 'image/png',
    });
    expect(message.text).toContain('Likely closed section: Bayfield Street near Bayfield Street & Sophia Street West');
    expect(message.text).toContain('Likely detour path: Sophia Street West -> Maple Avenue -> Ross Street');
    expect(message.text).toContain('If the map image does not display, open the attached detour-map.png.');
  });

  test('does not attach a map when only the closed segment line is available', async () => {
    const attachment = await buildDetourStaticMapAttachment({
      eventType: 'DETOUR_DETECTED',
      routeId: '11',
      riderVisible: true,
      skippedSegmentPolyline: [
        { latitude: 44.3900, longitude: -79.7000 },
        { latitude: 44.3910, longitude: -79.7000 },
      ],
    }, { fetchImpl: jest.fn() });
    expect(attachment).toBeNull();

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
    expect(message.html).not.toContain('Approximate detour map');
    expect(message.text).toContain('Likely detour path: open BTTP to view the map');
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
        html: '<img src="cid:detour-map@bttp.local">',
        text: 'Test',
        attachments: [{
          content: 'abc',
          filename: 'detour-map-inline.png',
          content_type: 'image/png',
          content_id: 'detour-map@bttp.local',
          contentId: 'detour-map@bttp.local',
          contentType: 'image/png',
        }],
      },
      fetchImpl,
    });

    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.attachments).toEqual([{
      content: 'abc',
      filename: 'detour-map-inline.png',
      content_type: 'image/png',
      content_id: 'detour-map@bttp.local',
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
    const message = buildEmailMessage(enriched);

    expect(enriched.eventLocationLabel).toBe('Duckworth & Grove East');
    expect(message.text).toContain('Area: Duckworth & Grove East');
    expect(message.text).toContain('#335; #328');
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
