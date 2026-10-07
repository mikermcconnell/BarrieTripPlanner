const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const { createTransitData, shapeBearing } = require('../transitArrival/transitData');
const { createFeedManager, simplify } = require('../transitArrival/feedStore');
const { createTransitNetwork } = require('../transitArrival/network');
const { parseTripUpdates } = require('../transitArrival/tripUpdatesParser');
const { summarizeStatus, createMcpServer } = require('../transitArrival/mcpServer');
const { buildWidgetHtml, WIDGET_URI } = require('../transitArrival/widget');

const NOW_MS = Date.UTC(2026, 9, 5, 17, 30, 0); // Monday 13:30 America/Toronto
const NOW_S = NOW_MS / 1000;
const LOCAL_SECONDS_NOW = 13.5 * 3600;

// --- minimal protobuf encoder for building GTFS-RT fixtures ---
const varint = (n) => {
  const out = [];
  let v = BigInt.asUintN(64, BigInt(n));
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    out.push(byte);
  } while (v > 0n);
  return out;
};
const tag = (field, wire) => varint((field << 3) | wire);
const vField = (field, value) => [...tag(field, 0), ...varint(value)];
const bytesField = (field, bytes) => [...tag(field, 2), ...varint(bytes.length), ...bytes];
const strField = (field, s) => bytesField(field, [...Buffer.from(s)]);

function encodeFeed({ headerTimestamp, trips }) {
  const header = [...strField(1, '2.0'), ...vField(3, headerTimestamp)];
  const entities = trips.map((trip, i) => {
    const descriptor = [...strField(1, trip.tripId), ...strField(5, trip.routeId), ...vField(4, trip.relationship || 0)];
    const stus = trip.stops.flatMap((s) => bytesField(2, [
      ...vField(1, s.seq),
      ...strField(4, s.stopId),
      ...bytesField(2, [...vField(1, s.delay ?? 0), ...vField(2, s.time)]),
      ...(s.skipped ? vField(5, 1) : []),
    ]));
    const tripUpdate = [...bytesField(1, descriptor), ...stus];
    return bytesField(2, [...strField(1, `e${i}`), ...bytesField(3, tripUpdate)]);
  });
  return new Uint8Array([...bytesField(1, header), ...entities.flat()]).buffer;
}

// --- GTFS fixtures ---
const hms = (seconds) => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
  .map((n) => String(n).padStart(2, '0')).join(':');
const at = (minutesFromNow) => hms(LOCAL_SECONDS_NOW + minutesFromNow * 60);
const csv = (header, rows) => [header, ...rows.map((r) => r.join(','))].join('\n');
const CALENDAR = csv('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date', [
  ['weekday', 1, 1, 1, 1, 1, 0, 0, '20260101', '20261231'],
  ['saturday', 0, 0, 0, 0, 0, 1, 0, '20260101', '20261231'],
]);

async function zipOf(files) {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: 'nodebuffer' });
}

// Barrie-like: 8A/8B variants, an "80" that must not match "8", two same-name stops.
const barrieZip = () => zipOf({
  'routes.txt': csv('route_id,route_short_name,route_long_name,route_color', [
    ['8A', '8A', 'RVH/YONGE', '000000'], ['8B', '8B', 'Crosstown/Essa', ''], ['80', '80', 'Eighty', ''],
  ]),
  'stops.txt': csv('stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type', [
    ['440', '440', 'Georgian Mall', 44.4106, -79.7064, 0],
    ['441', '441', 'Georgian Mall', 44.4110, -79.7051, 0],
    ['77', '77', 'Georgian Mall North Entrance', 44.4130, -79.7094, 0],
    ['1', '1', 'Downtown Hub', 44.3875, -79.6903, 0],
  ]),
  'trips.txt': csv('route_id,service_id,trip_id,trip_headsign,shape_id', [
    ['8A', 'weekday', 't8a', 'RVH/YONGE to Park Place', 's8a'],
    ['8B', 'weekday', 't8b', 'Crosstown/Essa to Georgian College', 's8b'],
    ['8A', 'weekday', 't8a-later', 'RVH/YONGE to Park Place', 's8a'],
    ['8A', 'saturday', 't8a-saturday', 'RVH/YONGE to Park Place', 's8a'],
    ['8B', 'weekday', 't8b-tomorrow', 'Crosstown/Essa to Georgian College', 's8b'],
    ['80', 'weekday', 't80', 'Eighty', ''],
  ]),
  // t8a and t8b also have live predictions; t8a-later runs later today;
  // t8a-saturday only runs on Saturdays; t8b-tomorrow is an early-morning trip.
  'stop_times.txt': csv('trip_id,arrival_time,departure_time,stop_id,stop_sequence', [
    ['t8a', at(-10), at(-10), '1', 1], ['t8a', at(4), at(4), '440', 2],
    ['t8a-saturday', at(0), at(0), '1', 1], ['t8a-saturday', at(10), at(10), '440', 2],
    ['t8a-later', at(10), at(10), '1', 1], ['t8a-later', at(20), at(20), '440', 2],
    ['t8b', at(-5), at(-5), '77', 1], ['t8b', at(2), at(2), '441', 2],
    ['t8b-tomorrow', '05:30:00', '05:30:00', '77', 1], ['t8b-tomorrow', '05:45:00', '05:45:00', '441', 2],
    ['t80', '06:00:00', '06:00:00', '1', 1],
  ]),
  'shapes.txt': csv('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence', [
    ['s8a', 44.387588123, -79.690372456, 1], ['s8a', 44.4106, -79.7064, 2],
    ['s8b', 44.4110, -79.7051, 1], ['s8b', 44.4130, -79.7094, 2],
  ]),
  'calendar.txt': CALENDAR,
});

// YRT-like: zero-padded and named routes, terminal platforms, a stop code shared with Barrie.
const yrtZip = () => zipOf({
  'routes.txt': csv('route_id,route_short_name,route_long_name,route_color', [
    ['8', '008', 'KENNEDY', ''], ['601', 'blue', 'VIVA BLUE', '009CDB'], ['60102', 'blue B', 'VIVA BLUE B', ''],
  ]),
  'stops.txt': csv('stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type,parent_station', [
    ['10', '10', 'RICHMOND HILL CENTRE', 43.8402, -79.4256, 1, ''],
    ['9820', '9820', 'RICHMOND HILL CENTRE PLATFORM 1', 43.8402, -79.4256, 0, '10'],
    ['9821', '9821', 'RICHMOND HILL CENTRE PLATFORM 2', 43.8401, -79.4257, 0, '10'],
    ['9822', '9822', 'BUS LOOP ARRIVALS', 43.8403, -79.4255, 0, '10'],
    ['1', '1', '"YONGE / MAJOR MACKENZIE"', 43.8746, -79.4398, 0, ''],
  ]),
  'trips.txt': csv('route_id,service_id,trip_id,trip_headsign,shape_id', [
    ['8', 'weekday', 'y8', '008 Kennedy - SB', ''],
    ['601', 'weekday', 'yblue', 'Newmarket Terminal - NB', ''],
    ['60102', 'weekday', 'yblueb', 'Newmarket Terminal - NB', ''],
  ]),
  'stop_times.txt': csv('trip_id,arrival_time,departure_time,stop_id,stop_sequence', [
    ['y8', at(2), at(2), '9822', 1], ['y8', ` ${at(3)}`, ` ${at(3)}`, '9820', 2], ['y8', at(9), at(9), '1', 3],
    ['yblue', at(6), at(6), '9821', 1],
    ['yblueb', at(30), at(30), '9821', 1],
  ]),
  'calendar.txt': CALENDAR,
});

const AGENCIES = [
  {
    id: 'barrie', name: 'Barrie Transit', region: 'Barrie, Ontario', aliases: ['barrie'], timeZone: 'America/Toronto',
    staticUrl: 'https://example.test/barrie.zip',
  },
  {
    id: 'yrt', name: 'York Region Transit', region: 'York Region, Ontario', aliases: ['yrt', 'viva', 'markham'],
    timeZone: 'America/Toronto', staticUrl: 'https://example.test/yrt.zip',
  },
];

let dataDir;
let feedManager;
let downloads = 0;
let zips;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transit-arrival-test-'));
  zips = { 'https://example.test/barrie.zip': await barrieZip(), 'https://example.test/yrt.zip': await yrtZip() };
  feedManager = createFeedManager({
    agencies: AGENCIES,
    dataDir,
    log: { log() {}, warn() {}, error() {} },
    fetchImpl: async (url) => {
      downloads++;
      const body = zips[url];
      return { ok: true, status: 200, headers: new Map(), arrayBuffer: async () => body };
    },
  });
  await feedManager.refreshStale();
});

afterAll(() => {
  feedManager.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const DEFAULT_UPDATES = [
  {
    tripId: 't8a', routeId: '8A', scheduleRelationship: 'SCHEDULED',
    stopTimeUpdates: [
      { stopId: '1', arrival: { time: NOW_S - 120 }, scheduleRelationship: 'SCHEDULED' },
      { stopId: '440', arrival: { time: NOW_S + 300, delay: 60 }, scheduleRelationship: 'SCHEDULED' },
    ],
  },
  {
    tripId: 't8b', routeId: '8B', scheduleRelationship: 'SCHEDULED',
    stopTimeUpdates: [{ stopId: '441', arrival: { time: NOW_S + 120 }, scheduleRelationship: 'SCHEDULED' }],
  },
];

function agencyData(agency, { feedStatus = 'fresh', updates, vehicles = [] } = {}) {
  const tripUpdates = {
    status: feedStatus,
    ageMs: feedStatus === 'stale' ? 10 * 60 * 1000 : 5000,
    updates: updates || (agency.id === 'barrie' ? DEFAULT_UPDATES : []),
  };
  return createTransitData({
    agency,
    getStore: () => feedManager.getStore(agency.id),
    fetchTripUpdates: async () => tripUpdates,
    fetchVehicles: async () => vehicles,
    now: () => NOW_MS,
  });
}

const createFixture = (options) => agencyData(AGENCIES[0], options);
const createNetwork = () => createTransitNetwork({ agencies: AGENCIES, feedManager, createAgencyData: (a) => agencyData(a) });

describe('tripUpdatesParser', () => {
  it('decodes trips, stop time updates, negative delays and skipped stops', () => {
    const buffer = encodeFeed({
      headerTimestamp: NOW_S - 10,
      trips: [{
        tripId: 'trip-1',
        routeId: '8A',
        stops: [
          { seq: 1, stopId: '440', time: NOW_S + 60, delay: -90 },
          { seq: 2, stopId: '441', time: NOW_S + 120, skipped: true },
        ],
      }],
    });
    const feed = parseTripUpdates(buffer, { nowMs: NOW_MS });
    expect(feed.status).toBe('fresh');
    expect(feed.ageMs).toBe(10000);
    expect(feed.updates).toHaveLength(1);
    expect(feed.updates[0]).toMatchObject({ tripId: 'trip-1', routeId: '8A', scheduleRelationship: 'SCHEDULED' });
    expect(feed.updates[0].stopTimeUpdates[0]).toMatchObject({ stopId: '440', arrival: { time: NOW_S + 60, delay: -90 } });
    expect(feed.updates[0].stopTimeUpdates[1].scheduleRelationship).toBe('SKIPPED');
  });

  it('marks an old feed as stale', () => {
    const buffer = encodeFeed({ headerTimestamp: NOW_S - 600, trips: [] });
    expect(parseTripUpdates(buffer, { nowMs: NOW_MS }).status).toBe('stale');
  });
});

describe('feed store', () => {
  it('skips the rebuild when the published zip is unchanged', async () => {
    const before = downloads;
    expect(await feedManager.refresh('yrt')).toEqual({ id: 'yrt', changed: false });
    expect(downloads).toBe(before + 1);
  });

  it('keeps the current timetable when a new one has not started yet', async () => {
    const current = zips['https://example.test/barrie.zip'];
    const next = await JSZip.loadAsync(current);
    next.file('calendar.txt', CALENDAR.replace(/20260101,20261231/g, '20270101,20271231'));
    zips['https://example.test/barrie.zip'] = await next.generateAsync({ type: 'nodebuffer' });
    try {
      expect(await feedManager.refresh('barrie')).toMatchObject({ changed: false, deferred: true });
      expect((await feedManager.getStore('barrie')).getStop('440').name).toBe('Georgian Mall');
    } finally {
      zips['https://example.test/barrie.zip'] = current;
    }
  });

  it('keeps only boardable stops, not parent stations', async () => {
    const store = await feedManager.getStore('yrt');
    expect(store.getStop('10')).toBeUndefined();
    expect(store.getStop('1').name).toBe('YONGE / MAJOR MACKENZIE');
  });

  it('simplifies shapes while keeping their ends', () => {
    const line = Array.from({ length: 50 }, (_, i) => [44 + i * 1e-5, -79]);
    expect(simplify(line)).toEqual([line[0], line[49]]);
  });
});

describe('transitData', () => {
  it('expands a bare route number to its lettered variants but not longer numbers', async () => {
    const status = await createFixture().getStatus({ route: 'Route 8' });
    expect(status.routes.map((r) => r.routeId)).toEqual(['8A', '8B']);
  });

  it('merges same-name stops and returns arrivals across them in time order', async () => {
    const status = await createFixture().getStatus({ stop: 'georgian mall' });
    expect([...status.stop.stopCodes].sort()).toEqual(['440', '441']);
    expect(status.arrivals.map((a) => [a.routeId, a.minutes, a.stopCode, a.realtime])).toEqual([
      ['8B', 2, '441', true],
      ['8A', 5, '440', true],
      ['8A', 20, '440', false],
    ]);
    expect(status.arrivals[1].delayMinutes).toBe(1);
  });

  it('fills in from the timetable without duplicating live trips or running off-day service', async () => {
    const status = await createFixture().getStatus({ stop: '440' });
    // t8a appears once (live); the Saturday-only trip is excluded on a Monday.
    expect(status.arrivals.map((a) => a.tripId)).toEqual(['t8a', 't8a-later']);
    expect(status.arrivals[1]).toMatchObject({ realtime: false, arrivalTime: '1:50 p.m.' });
  });

  it('never shows a timetable time for a trip the live feed cancelled', async () => {
    const status = await createFixture({
      updates: [{ tripId: 't8a-later', routeId: '8A', scheduleRelationship: 'CANCELED', stopTimeUpdates: [] }],
    }).getStatus({ stop: '440' });
    expect(status.arrivals.map((a) => a.tripId)).toEqual(['t8a']);
    expect(status.arrivals[0].realtime).toBe(false);
  });

  it('points to the next scheduled trip when nothing is due soon', async () => {
    const none = await createFixture({ updates: [] }).getStatus({ stop: '441', direction: 'nowhere' });
    expect(none.arrivals).toEqual([]);
    expect(none.notes.join(' ')).toMatch(/No service is scheduled/);

    const later = await createFixture({ updates: [] }).getStatus({ stop: '441' });
    expect(later.arrivals.map((a) => a.tripId)).toEqual(['t8b']);
  });

  it('tells the rider when an idle route next runs', async () => {
    const status = await createFixture({ updates: [] }).getStatus({ route: '8B', direction: 'Georgian College' });
    expect(status.vehicles).toEqual([]);
    expect(status.notes.join(' ')).toContain(
      'The next trip (Route 8B Crosstown/Essa to Georgian College) is scheduled to start at 5:30 a.m. tomorrow.'
    );
  });

  it('asks for clarification when a stop name matches different places', async () => {
    const status = await createFixture().getStatus({ stop: 'mall' });
    expect(status.arrivals).toEqual([]);
    expect(status.stopCandidates.length).toBeGreaterThan(1);
    expect(status.notes[0]).toMatch(/several places/);
  });

  it('filters arrivals by direction', async () => {
    const status = await createFixture().getStatus({ stop: 'Georgian Mall', direction: 'park place' });
    expect(status.arrivals.map((a) => a.tripId)).toEqual(['t8a', 't8a-later']);
  });

  it('falls back to the timetable when predictions are stale', async () => {
    const status = await createFixture({ feedStatus: 'stale' }).getStatus({ stop: '440' });
    expect(status.arrivals.map((a) => [a.tripId, a.realtime, a.minutes])).toEqual([['t8a', false, 4], ['t8a-later', false, 20]]);
    expect(status.notes[0]).toMatch(/10 minutes old, so times shown are from the timetable/);
  });

  it('reports route vehicles with their next stop', async () => {
    const vehicles = [{ id: 'bus-1', tripId: 't8a', routeId: '8A', coordinate: { latitude: 44.4, longitude: -79.7 }, timestamp: NOW_S - 20 }];
    const status = await createFixture({ vehicles }).getStatus({ route: '8A' });
    expect(status.vehicles).toEqual([expect.objectContaining({
      vehicleId: 'bus-1',
      lastUpdateSecondsAgo: 20,
      nextStop: expect.objectContaining({ stopId: '440', name: 'Georgian Mall', minutes: 5 }),
    })]);
    expect(summarizeStatus(status)).toContain('next stop Georgian Mall in 5 min');
  });

  it('uses the feed heading when there is one, and the route shape when there is not', async () => {
    const vehicles = [
      { id: 'reported', tripId: 't8a', routeId: '8A', coordinate: { latitude: 44.4, longitude: -79.7 }, timestamp: NOW_S - 20, bearing: 95.6 },
      { id: 'derived', tripId: 't8b', routeId: '8B', coordinate: { latitude: 44.412, longitude: -79.707 }, timestamp: NOW_S - 20 },
    ];
    const status = await createFixture({ vehicles }).getStatus({ route: '8' });
    const bearings = Object.fromEntries(status.vehicles.map((v) => [v.vehicleId, v.bearing]));
    expect(bearings.reported).toBe(96);
    expect(bearings.derived).toBeGreaterThan(270); // s8b runs north-west
    expect(bearings.derived).toBeLessThan(360);
  });

  it('picks the shape direction heading toward the next stop where a route doubles back', () => {
    const outAndBack = [[44, -79], [44.01, -79], [44, -79]]; // north, then back south on the same street
    const here = { latitude: 44.005, longitude: -79 };
    expect(shapeBearing(outAndBack, here.latitude, here.longitude, { latitude: 44.02, longitude: -79 })).toBe(0);
    expect(shapeBearing(outAndBack, here.latitude, here.longitude, { latitude: 43.99, longitude: -79 })).toBe(180);
  });

  it('finds stops by name and by stop number', async () => {
    const fixture = createFixture();
    expect((await fixture.findStops({ query: 'downtown' })).map((s) => s.stopCode)).toEqual(['1']);
    expect((await fixture.findStops({ query: '441' }))[0]).toMatchObject({ name: 'Georgian Mall', routes: ['8B'] });
  });

  it('includes geometry for the trips shown, with rounded coordinates', async () => {
    const status = await createFixture().getStatus({ stop: '440' });
    expect(status.map.shapes).toEqual([{ routeId: '8A', color: '#000000', points: [[44.38759, -79.69037], [44.4106, -79.7064]] }]);
  });

  it('falls back to whole-route geometry when no vehicles are running', async () => {
    const status = await createFixture({ updates: [] }).getStatus({ route: '8B' });
    expect(status.map.shapes.map((sh) => sh.routeId)).toEqual(['8B']);
  });
});

describe('multi-agency network', () => {
  it('uses the named agency and shows riders unpadded route names', async () => {
    const status = await createNetwork().getStatus({ agency: 'YRT', route: '8' });
    expect(status.agency).toEqual({ id: 'yrt', name: 'York Region Transit' });
    expect(status.routes.map((r) => [r.routeId, r.name])).toEqual([['8', '8']]);
  });

  it('matches named routes exactly before their variants', async () => {
    const status = await createNetwork().getStatus({ agency: 'viva', route: 'blue' });
    expect(status.routes.map((r) => r.routeId)).toEqual(['601']);
  });

  it('infers the agency from a route only one agency has', async () => {
    const status = await createNetwork().getStatus({ route: 'viva blue' });
    expect(status.agency.id).toBe('yrt');
    expect(status.routes.map((r) => r.routeId)).toEqual(['601', '60102']);
  });

  it('asks which area when a route exists in several agencies', async () => {
    const status = await createNetwork().getStatus({ route: '8' });
    expect(status.agency).toBeNull();
    expect(status.agencyCandidates.map((a) => a.id)).toEqual(['barrie', 'yrt']);
    expect(status.notes[0]).toMatch(/more than one area/);
  });

  it('infers the agency from the stop and treats terminal platforms as one place', async () => {
    const status = await createNetwork().getStatus({ stop: 'Richmond Hill Centre' });
    expect(status.agency.id).toBe('yrt');
    // The arrivals bay has an unrelated name but the same parent station.
    expect(status.stop).toMatchObject({ name: 'RICHMOND HILL CENTRE', stopCodes: ['9820', '9821', '9822'] });
    // y8 serves two of the terminal's stops but is listed once, without the route number in its headsign.
    expect(status.arrivals.map((a) => [a.routeName, a.headsign, a.minutes])).toEqual([
      ['8', 'Kennedy - SB', 2], ['blue', 'Newmarket Terminal - NB', 6], ['blue B', 'Newmarket Terminal - NB', 30],
    ]);
  });

  it('offers stops from each agency when a stop number is ambiguous', async () => {
    const status = await createNetwork().getStatus({ stop: '1' });
    expect(status.stopCandidates.map((s) => [s.agencyId, s.name])).toEqual([
      ['barrie', 'Downtown Hub'], ['yrt', 'YONGE / MAJOR MACKENZIE'],
    ]);
  });

  it('serves agencies without live feeds from the timetable and says so', async () => {
    const scheduleOnly = createTransitData({
      agency: { ...AGENCIES[1], tripUpdatesUrl: undefined, vehiclePositionsUrl: undefined },
      getStore: () => feedManager.getStore('yrt'),
      now: () => NOW_MS,
    });
    const status = await scheduleOnly.getStatus({ stop: 'Richmond Hill Centre' });
    expect(status.arrivals.every((a) => !a.realtime)).toBe(true);
    expect(status.notes[0]).toBe("York Region Transit doesn't publish live bus data, so times shown are from the timetable.");
  });

  it("ignores other agencies' buses in a shared realtime feed", async () => {
    const foreign = { id: 'other-town', tripId: 'not-ours', routeId: '8', coordinate: { latitude: 43.9, longitude: -79.4 }, timestamp: NOW_S - 5 };
    const ours = { id: 'yrt-bus', tripId: 'y8', routeId: '8', coordinate: { latitude: 43.84, longitude: -79.42 }, timestamp: NOW_S - 5 };
    const shared = agencyData({ ...AGENCIES[1], sharedRealtimeFeed: true }, { vehicles: [foreign, ours] });
    const status = await shared.getStatus({ route: '8' });
    expect(status.vehicles.map((v) => v.vehicleId)).toEqual(['yrt-bus']);
  });

  it('says so when asked about an agency it does not cover', async () => {
    const status = await createNetwork().getStatus({ agency: 'TTC', stop: 'Union' });
    expect(status.notes[0]).toMatch(/isn't a covered transit agency/);
  });

  it('lists covered agencies when routes are requested without one', async () => {
    const network = createNetwork();
    expect((await network.listRoutes()).coveredAgencies.map((a) => a.id)).toEqual(['barrie', 'yrt']);
    expect((await network.listRoutes({ agency: 'markham' })).routes.map((r) => r.name)).toEqual(['8', 'blue', 'blue B']);
  });
});

describe('map widget', () => {
  it('inlines Leaflet and config with no leftover placeholders', () => {
    const html = buildWidgetHtml({ env: { CARTO_BASEMAP_API_KEY: 'k&y' } });
    expect(html).not.toMatch(/__LEAFLET_(CSS|JS)__|__CONFIG__/);
    expect(html).toContain('L.map(');
    expect(html).toContain('light_all/{z}/{x}/{y}@2x.png?key=k%26y');
  });

  it('registers the widget and keeps map geometry out of model-visible content', async () => {
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
    const server = createMcpServer({ network: createNetwork(), widgetHtml: '<html>widget</html>' });
    const client = new Client({ name: 'test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const statusTool = tools.find((t) => t.name === 'get_transit_status');
    expect(statusTool._meta.ui.resourceUri).toBe(WIDGET_URI);
    expect(statusTool._meta['openai/outputTemplate']).toBe(WIDGET_URI);
    expect(statusTool.description).toContain('York Region Transit');
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: true });
    }
    const findStopsTool = tools.find((t) => t.name === 'find_stops');
    expect(Object.keys(findStopsTool.inputSchema.properties)).toEqual(['query', 'route', 'agency']);

    const resource = await client.readResource({ uri: WIDGET_URI });
    expect(resource.contents[0]).toMatchObject({ mimeType: 'text/html;profile=mcp-app', text: '<html>widget</html>' });
    expect(resource.contents[0]._meta.ui.csp.resourceDomains).toContain('https://a.basemaps.cartocdn.com');
    // Hosts that cached an older widget URI still get the current widget.
    const legacy = await client.readResource({ uri: 'ui://transit-arrival/map-v2.html' });
    expect(legacy.contents[0].text).toBe('<html>widget</html>');

    const result = await client.callTool({ name: 'get_transit_status', arguments: { stop: 'Georgian Mall' } });
    expect(result.structuredContent.map).toBeUndefined();
    expect(result.structuredContent.agency.id).toBe('barrie');
    expect(result._meta.map.shapes.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain('Stop: Georgian Mall');
    await client.close();
  });
});

describe('public website', () => {
  const request = require('supertest');
  const { createTransitArrivalApp } = require('../transitArrival/server');
  let app;
  beforeAll(() => {
    ({ app } = createTransitArrivalApp({ network: createNetwork(), widgetHtml: '<html></html>' }));
  });

  it.each(['/', '/support', '/privacy', '/terms'])('serves %s with the not-affiliated notice', async (route) => {
    const res = await request(app).get(route);
    expect(res.status).toBe(200);
    expect(res.text).toContain('not affiliated with');
  });

  it('lists every covered agency and its licence on the terms page', async () => {
    const res = await request(app).get('/terms');
    expect(res.text).toContain('YRT Open Data Licence');
    expect(res.text).toContain('Barrie Transit open data licence');
  });

  it('serves the logo but not the page source', async () => {
    expect((await request(app).get('/logo.svg')).status).toBe(200);
    expect((await request(app).get('/pages.js')).status).toBe(404);
  });

  it('keeps the dev preview host off by default', async () => {
    expect((await request(app).get('/dev')).status).toBe(404);
  });
});
