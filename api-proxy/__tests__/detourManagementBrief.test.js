const { createCanvas } = require('@napi-rs/canvas');
const { collectMapGeometry, renderDetourBriefMap } = require('../services/detourBriefMap');
const { buildBriefMessage, groupActiveEvents, runDetourManagementBrief } = require('../services/detourManagementBrief');
const { sendViaResend } = require('../services/detourEmailMonitor');

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
    expect(message.html).toContain('<strong>Stops:</strong> #101 Example stop');
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
    expect(sendEmail.mock.calls[0][0].message.subject).toContain('Routes 2, 8');
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
