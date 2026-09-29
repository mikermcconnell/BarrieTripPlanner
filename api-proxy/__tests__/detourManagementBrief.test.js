const { createCanvas } = require('@napi-rs/canvas');
const { collectMapGeometry, renderDetourBriefMap } = require('../services/detourBriefMap');
const { buildBriefMessage, groupActiveEvents, runDetourManagementBrief, isConfirmedActive } = require('../services/detourManagementBrief');
const { sendViaResend, buildDetourEmailInsights, enrichEventStopNames } = require('../services/detourEmailMonitor');
const { prepareBriefDisplayEvent } = require('../services/detourBriefDisplay');
const blakeEvent = require('./fixtures/detour-brief-blake.json');

function event(id = 'route-2-event') {
  return {
    id, eventId: id, routeId: '2', state: 'active', alertVisible: true,
    eventLocationLabel: 'Bayfield Street at Wellington Street',
    detectedAt: 1789990000000, alertConfirmedAt: 1789990100000,
    segments: [{
      skippedSegmentPolyline: [{ latitude: 44.390, longitude: -79.688 }, { latitude: 44.394, longitude: -79.688 }],
      inferredDetourPolyline: [{ latitude: 44.390, longitude: -79.688 }, { latitude: 44.392, longitude: -79.680 }],
      canShowDetourPath: false,
    }],
  };
}

function makeDb(active = [event()]) {
  const records = new Map();
  const activeDocs = new Map(active.map((item) => [item.id, { ...item }]));
  const ref = (collection, id) => ({
    id,
    async get() {
      const data = (collection === 'activeDetourEventsV2' ? activeDocs : records).get(id);
      return { exists: Boolean(data), data: () => data };
    },
    async set(value, options = {}) {
      const store = collection === 'activeDetourEventsV2' ? activeDocs : records;
      store.set(id, options.merge ? { ...(store.get(id) || {}), ...value } : value);
    },
  });
  return {
    records, activeDocs,
    collection(collection) {
      return {
        doc: (id) => ref(collection, id),
        get: async () => ({ docs: [...activeDocs].map(([id, data]) => ({ id, data: () => data })) }),
      };
    },
    async runTransaction(callback) {
      return callback({ get: (document) => document.get(), set: (document, value, options) => document.set(value, options) });
    },
  };
}

const env = {
  DETOUR_MANAGEMENT_BRIEF_ENABLED: 'true', DETOUR_ALERT_RECIPIENT: 'mike@example.com',
  DETOUR_ALERT_FROM: 'Barrie Transit <detours@example.com>', RESEND_API_KEY: 'test-key', CARTO_BASEMAP_API_KEY: 'test-carto',
};

describe('detour management brief', () => {
  test('counts a stop once across objects, codes, IDs, and repeated segments', () => {
    const source = { skippedStopCodes: ['959'], skippedStopIds: ['internal-959'], segments: [
      { skippedStops: [{ id: 'internal-959', code: '959', name: 'Johnson at Indian Arrow Road' }] },
      { skippedStopCodes: ['959'], skippedStops: [{ code: '142', name: 'Vancouver Street' }] },
    ] };
    expect(buildDetourEmailInsights(source).skippedStops).toEqual([
      '#959 Johnson at Indian Arrow Road', '#142 Vancouver Street',
    ]);
    const enriched = enrichEventStopNames({ skippedStopIds: ['internal-959'], skippedStopCodes: ['959'] }, {
      stopsById: new Map([['internal-959', { id: 'internal-959', code: '959', name: 'Johnson' }]]),
    });
    expect(buildDetourEmailInsights(enriched).skippedStops).toEqual(['#959 Johnson']);
  });

  test('keeps the reviewed Blake map, road names, and stop impacts consistent', () => {
    const original = JSON.stringify(blakeEvent);
    const prepared = prepareBriefDisplayEvent(blakeEvent);
    const geometry = collectMapGeometry([blakeEvent]);
    expect(geometry.diversions[0]).toEqual(blakeEvent.segments[0].skippedSegmentPolyline);
    expect(geometry.closures[0]).toEqual(blakeEvent.segments[0].likelyDetourPolyline);
    expect(geometry.skippedStops).toHaveLength(0);
    expect(collectMapGeometry([prepared])).toEqual(geometry);
    const map = { buffer: Buffer.from('map'), pathPending: false, renderedAt: 1789990200000, geometry };
    const message = buildBriefMessage(blakeEvent, map, undefined, { preview: true });
    expect(message.text).toContain('Johnson Street and Shanty Bay Road');
    expect(message.text).toContain('Affected section: Blake Street');
    expect(message.text).toContain('Stop impacts have not been confirmed');
    expect(message.html).not.toMatch(/Puget|Codrington|#959|Confirmed detour/);
    expect(message.html).toContain('Out of service');
    expect(message.subject).toContain('[TEST PREVIEW] Route 8B');
    expect(JSON.stringify(blakeEvent)).toBe(original);
    const other = { ...blakeEvent, eventId: 'another-event' };
    expect(prepareBriefDisplayEvent(other)).toBe(other);
    expect(collectMapGeometry([other]).skippedStops).toHaveLength(1);
  });

  test('preview and live mail share content while preview cannot assert a live confirmation', () => {
    const source = event();
    const map = { buffer: Buffer.from('map'), pathPending: true, renderedAt: 1789990200000 };
    const live = buildBriefMessage(source, map);
    const preview = buildBriefMessage(source, map, undefined, { preview: true });
    for (const message of [live, preview]) {
      expect(message.html).toContain('<html lang="en"');
      expect(message.html).toContain('<meta charset="utf-8">');
      expect(message.html).toContain('width="752"');
      expect(message.text).toContain('Diversion path pending');
      expect(message.html).not.toContain('Barrie Transit has confirmed');
    }
    expect(live.html).toContain('Confirmed detour');
    expect(preview.html).toContain('No live service notice');
    expect(preview.html).not.toContain('Confirmed detour');
    expect(preview.attachments).toEqual(live.attachments);
  });

  test('display preparation does not relax production confirmation or baseline gates', () => {
    expect(isConfirmedActive(prepareBriefDisplayEvent(blakeEvent))).toBe(false);
    for (const flags of [{ baselineDiverged: true }, { baselineUpdatePending: true }, { alertVisible: false }, { state: 'cleared' }]) {
      expect(isConfirmedActive({ ...event(), ...flags })).toBe(false);
    }
  });

  test('groups shared routes but keeps independent events separate', () => {
    const first = { ...event('first'), sharedDetourEventId: 'shared-one' };
    const sibling = { ...event('sibling'), routeId: '8', sharedDetourEventId: 'shared-one' };
    const separate = event('second');
    const docs = [first, sibling, separate].map((item) => ({ id: item.id, data: () => item }));
    expect(groupActiveEvents(docs).map((group) => group.length)).toEqual([2, 1]);
  });

  test('draws only trusted diversion geometry and uses an affected-area map while pending', () => {
    const geometry = collectMapGeometry([event()]);
    expect(geometry.closures).toHaveLength(0);
    expect(geometry.anchors).toHaveLength(2);
    expect(geometry.diversions).toHaveLength(0);
    expect(geometry.pathPending).toBe(true);
    const message = buildBriefMessage({ ...event(), sharedRouteIds: ['2'] }, {
      buffer: Buffer.from('map'), pathPending: true, renderedAt: 1789990200000,
    });
    expect(message.html).toContain('src="cid:detour-map"');
    expect(message.html).toContain('Diversion path pending');
    expect(message.attachments[0].content_id).toBe('detour-map');
    expect(message.html).not.toContain('route-2-event');
    expect(message.html).not.toContain('vehicleCount');
  });

  test('rejects sparse straight lines and draws a road-matched path when available', () => {
    const source = event();
    source.segments[0].canShowDetourPath = true;
    expect(collectMapGeometry([source]).pathPending).toBe(true);
    source.segments[0].skippedSegmentPolyline = [
      { latitude: 44.390, longitude: -79.688 },
      { latitude: 44.392, longitude: -79.688 },
      { latitude: 44.394, longitude: -79.688 },
    ];
    source.segments[0].roadMatchSource = 'osrm-route';
    source.segments[0].likelyDetourPolyline = [
      { latitude: 44.390, longitude: -79.688 },
      { latitude: 44.391, longitude: -79.684 },
      { latitude: 44.394, longitude: -79.684 },
    ];
    const geometry = collectMapGeometry([source]);
    expect(geometry.closures).toHaveLength(1);
    expect(geometry.diversions).toHaveLength(1);
    expect(geometry.pathPending).toBe(false);
    source.segments[0].skippedStops = [{ stopCode: '101', name: 'Example stop' }];
    const message = buildBriefMessage({ ...source, sharedRouteIds: ['2'] }, {
      buffer: Buffer.from('map'), pathPending: false, renderedAt: 1789990200000,
    });
    expect(message.html).toContain('1 skipped stop');
    expect(message.html).not.toContain('1 skipped stop: #101');
  });

  test('renders CARTO tiles with attribution and a CID-ready JPEG', async () => {
    const tile = createCanvas(512, 512).toBuffer('image/png');
    const fetchImpl = jest.fn(async () => ({ ok: true, arrayBuffer: async () => tile }));
    const map = await renderDetourBriefMap([event()], { cartoKey: 'example\n', fetchImpl });
    expect(fetchImpl).toHaveBeenCalled();
    expect(fetchImpl.mock.calls[0][0]).toContain('basemaps.cartocdn.com/rastertiles/voyager/');
    expect(fetchImpl.mock.calls[0][0]).toContain('?key=example');
    expect(map.buffer.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(map.pathPending).toBe(true);
  });

  test('rejects HTTP 200 CARTO key-error placeholders instead of mailing a broken basemap', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true, headers: new Map([['etag', '"wm-da89c20e77c1-light"']]),
      arrayBuffer: async () => createCanvas(512, 512).toBuffer('image/png'),
    }));
    await expect(renderDetourBriefMap([event()], { cartoKey: 'invalid', fetchImpl }))
      .rejects.toThrow('watermarked error tile');
  });

  test('waits for a map, retries while active, and sends once with one recipient', async () => {
    const db = makeDb();
    const renderMap = jest.fn().mockRejectedValueOnce(new Error('tiles unavailable')).mockResolvedValue({
      buffer: Buffer.from('image'), pathPending: true, renderedAt: 1789990200000,
    });
    const sendEmail = jest.fn().mockResolvedValue({ id: 'provider-1' });
    const input = { env, db, renderMap, sendEmail, getGtfsData: null, now: () => 1789990300000 };
    expect((await runDetourManagementBrief(input)).waitingMap).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await runDetourManagementBrief(input)).sent).toBe(1);
    expect(sendEmail.mock.calls[0][0].recipients).toEqual(['mike@example.com']);
    expect(sendEmail.mock.calls[0][0].idempotencyKey).toMatch(/^detour-brief-/);
    expect((await runDetourManagementBrief(input)).sent).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test('sends one brief for shared routes and another for an independent detour', async () => {
    const first = { ...event('first'), sharedDetourEventId: 'shared-one' };
    const sibling = { ...event('sibling'), routeId: '8', sharedDetourEventId: 'shared-one' };
    const db = makeDb([first, sibling, event('separate')]);
    const sendEmail = jest.fn().mockResolvedValue({ id: 'accepted' });
    const result = await runDetourManagementBrief({ env, db, sendEmail, getGtfsData: null,
      renderMap: async () => ({ buffer: Buffer.from('image'), pathPending: true, renderedAt: 1789990200000 }),
      now: () => 1789990300000 });
    expect(result.sent).toBe(2);
    expect(sendEmail.mock.calls[0][0].message.subject).toBe('Confirmed Detour | 2, 8');
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  test('does not send a queued brief after the detour clears', async () => {
    const db = makeDb();
    const sendEmail = jest.fn();
    const renderMap = async () => {
      db.activeDocs.get('route-2-event').state = 'cleared';
      return { buffer: Buffer.from('map'), pathPending: true, renderedAt: 1789990200000 };
    };
    const result = await runDetourManagementBrief({ env, db, renderMap, sendEmail, getGtfsData: null });
    expect(result.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('passes the inline attachment and idempotency key to Resend', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, text: async () => '{"id":"accepted"}' }));
    await sendViaResend({
      apiKey: 'test', from: 'sender@example.com', recipients: ['mike@example.com'],
      idempotencyKey: 'detour-brief-one', fetchImpl,
      message: { subject: 'Confirmed detour', html: '<img src="cid:detour-map">', text: 'map attached',
        attachments: [{ filename: 'map.jpg', content: 'aGVsbG8=', content_id: 'detour-map', content_type: 'image/jpeg' }] },
    });
    const request = fetchImpl.mock.calls[0][1];
    expect(request.headers['Idempotency-Key']).toBe('detour-brief-one');
    expect(JSON.parse(request.body).attachments[0].content_id).toBe('detour-map');
  });
});
