const { createTransitData } = require('../transitArrival/transitData');
const { parseTripUpdates } = require('../transitArrival/tripUpdatesParser');
const { summarizeStatus, createMcpServer } = require('../transitArrival/mcpServer');
const { buildWidgetHtml, WIDGET_URI } = require('../transitArrival/widget');

const NOW_MS = Date.UTC(2026, 9, 5, 17, 30, 0);
const NOW_S = NOW_MS / 1000;
const LOCAL_SECONDS_NOW = 13.5 * 3600; // 13:30 America/Toronto

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

function buildStaticData() {
  const stops = [
    { id: '440', code: '440', name: 'Georgian Mall', latitude: 44.4106, longitude: -79.7064, locationType: 0 },
    { id: '441', code: '441', name: 'Georgian Mall', latitude: 44.4110, longitude: -79.7051, locationType: 0 },
    { id: '77', code: '77', name: 'Georgian Mall North Entrance', latitude: 44.4130, longitude: -79.7094, locationType: 0 },
    { id: '1', code: '1', name: 'Downtown Hub', latitude: 44.3875, longitude: -79.6903, locationType: 0 },
  ];
  return {
    lastRefresh: 1,
    stopsById: new Map(stops.map((s) => [s.id, s])),
    shapes: new Map([
      ['s8a', [{ latitude: 44.387588123, longitude: -79.690372456 }, { latitude: 44.4106, longitude: -79.7064 }]],
      ['s8b', [{ latitude: 44.4110, longitude: -79.7051 }, { latitude: 44.4130, longitude: -79.7094 }]],
    ]),
    routeShapeMapping: new Map([['8A', ['s8a']], ['8B', ['s8b']], ['80', []]]),
    tripMapping: new Map([
      ['t8a', { routeId: '8A', headsign: 'RVH/YONGE to Park Place', shapeId: 's8a' }],
      ['t8b', { routeId: '8B', headsign: 'Crosstown/Essa to Georgian College', shapeId: 's8b' }],
      ['t8a-later', { routeId: '8A', headsign: 'RVH/YONGE to Park Place', shapeId: 's8a' }],
      ['t8a-saturday', { routeId: '8A', headsign: 'RVH/YONGE to Park Place', shapeId: 's8a' }],
      ['t8b-tomorrow', { routeId: '8B', headsign: 'Crosstown/Essa to Georgian College', shapeId: 's8b' }],
      ['t80', { routeId: '80', headsign: 'Eighty' }],
    ]),
    // Timetable: t8a and t8b also have live predictions; t8a-later runs later today;
    // t8a-saturday only runs on Saturdays; t8b-tomorrow is an early-morning trip.
    stopTimesByStop: new Map([
      ['440', [
        { tripId: 't8a', seconds: LOCAL_SECONDS_NOW + 4 * 60 },
        { tripId: 't8a-saturday', seconds: LOCAL_SECONDS_NOW + 10 * 60 },
        { tripId: 't8a-later', seconds: LOCAL_SECONDS_NOW + 20 * 60 },
      ]],
      ['441', [
        { tripId: 't8b-tomorrow', seconds: 5 * 3600 + 45 * 60 },
        { tripId: 't8b', seconds: LOCAL_SECONDS_NOW + 2 * 60 },
      ]],
    ]),
    scheduleIndex: {
      tripsByRouteId: new Map([
        ['8A', [
          { tripId: 't8a', serviceId: 'weekday', startTimeSeconds: LOCAL_SECONDS_NOW - 10 * 60 },
          { tripId: 't8a-saturday', serviceId: 'saturday', startTimeSeconds: LOCAL_SECONDS_NOW },
          { tripId: 't8a-later', serviceId: 'weekday', startTimeSeconds: LOCAL_SECONDS_NOW + 10 * 60 },
        ]],
        ['8B', [
          { tripId: 't8b-tomorrow', serviceId: 'weekday', startTimeSeconds: 5 * 3600 + 30 * 60 },
          { tripId: 't8b', serviceId: 'weekday', startTimeSeconds: LOCAL_SECONDS_NOW - 5 * 60 },
        ]],
      ]),
      calendarByServiceId: new Map([
        ['weekday', { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
          saturday: false, sunday: false, startDate: '20260101', endDate: '20261231' }],
        ['saturday', { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false,
          saturday: true, sunday: false, startDate: '20260101', endDate: '20261231' }],
      ]),
      calendarDatesByServiceId: new Map(),
    },
    routesById: new Map([
      ['8A', { id: '8A', shortName: '8A', longName: 'RVH/YONGE' }],
      ['8B', { id: '8B', shortName: '8B', longName: 'Crosstown/Essa' }],
      ['80', { id: '80', shortName: '80', longName: 'Eighty' }],
    ]),
    routeColors: new Map([['8A', '#000000']]),
    routeStopSequencesMapping: {
      '8A': { __default__: ['1', '440'] },
      '8B': { __default__: ['441', '77'] },
      '80': { __default__: ['1'] },
    },
  };
}

function createFixture({ feedStatus = 'fresh', updates, vehicles = [] } = {}) {
  const tripUpdates = {
    status: feedStatus,
    ageMs: feedStatus === 'stale' ? 10 * 60 * 1000 : 5000,
    updates: updates || [
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
    ],
  };
  return createTransitData({
    getStaticData: async () => buildStaticData(),
    fetchTripUpdates: async () => tripUpdates,
    fetchVehicles: async () => vehicles,
    now: () => NOW_MS,
  });
}

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

describe('transitData', () => {
  it('expands a bare route number to its lettered variants but not longer numbers', async () => {
    const status = await createFixture().getStatus({ route: 'Route 8' });
    expect(status.routes.map((r) => r.routeId)).toEqual(['8A', '8B']);
  });

  it('merges same-name stops and returns arrivals across them in time order', async () => {
    const status = await createFixture().getStatus({ stop: 'georgian mall' });
    expect(status.stop.stopCodes).toEqual(['440', '441']);
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

    const fixture = createFixture({ updates: [] });
    const later = await fixture.getStatus({ stop: '441' });
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
    const server = createMcpServer({ transitData: createFixture(), widgetHtml: '<html>widget</html>' });
    const client = new Client({ name: 'test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const statusTool = tools.find((t) => t.name === 'get_transit_status');
    expect(statusTool._meta.ui.resourceUri).toBe(WIDGET_URI);
    expect(statusTool._meta['openai/outputTemplate']).toBe(WIDGET_URI);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: true });
    }
    const findStopsTool = tools.find((t) => t.name === 'find_stops');
    expect(Object.keys(findStopsTool.inputSchema.properties)).toEqual(['query', 'route']);

    const resource = await client.readResource({ uri: WIDGET_URI });
    expect(resource.contents[0]).toMatchObject({ mimeType: 'text/html;profile=mcp-app', text: '<html>widget</html>' });
    expect(resource.contents[0]._meta.ui.csp.resourceDomains).toContain('https://a.basemaps.cartocdn.com');

    const result = await client.callTool({ name: 'get_transit_status', arguments: { stop: 'Georgian Mall' } });
    expect(result.structuredContent.map).toBeUndefined();
    expect(result._meta.map.shapes.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain('Stop: Georgian Mall');
    await client.close();
  });
});