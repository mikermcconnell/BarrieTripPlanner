const {
  buildDunlopFerndaleAnneGeometry,
  buildFarmersMarketGeometry,
  buildWellingtonOwenGroveGeometry,
  buildMatchedSimulationGeometry,
  buildSaundersWelhamGeometry,
  buildSyntheticGeometry,
  buildYongeBigBayLittleGeometry,
  createDetourSimulationOps,
  getSimulationOffsetCandidates,
  selectRouteAndShape,
} = require('../services/detourSimulation');

function makeStaticData() {
  const shapes = new Map();
  shapes.set('shape-1', [
    { latitude: 44.39, longitude: -79.700 },
    { latitude: 44.39, longitude: -79.698 },
    { latitude: 44.39, longitude: -79.696 },
    { latitude: 44.39, longitude: -79.694 },
    { latitude: 44.39, longitude: -79.692 },
    { latitude: 44.39, longitude: -79.690 },
    { latitude: 44.39, longitude: -79.688 },
    { latitude: 44.39, longitude: -79.686 },
  ]);

  const routeShapeMapping = new Map();
  routeShapeMapping.set('1', ['shape-1']);
  routeShapeMapping.set('2A', ['shape-1']);
  routeShapeMapping.set('2B', ['shape-1']);
  routeShapeMapping.set('7A', ['shape-1']);
  routeShapeMapping.set('7B', ['shape-1']);
  routeShapeMapping.set('8A', ['shape-1']);
  routeShapeMapping.set('10', ['shape-1']);
  routeShapeMapping.set('11', ['shape-1']);
  routeShapeMapping.set('12A', ['shape-1']);
  routeShapeMapping.set('12B', ['shape-1']);

  return { shapes, routeShapeMapping, tripMapping: new Map() };
}

function makeDbMock() {
  const writes = [];
  const deletes = [];

  return {
    collection: jest.fn((collectionName) => ({
      doc: jest.fn((docId) => ({
        set: jest.fn(async (data, opts) => {
          writes.push({ collectionName, docId, data, opts });
        }),
        delete: jest.fn(async () => {
          deletes.push({ collectionName, docId });
        }),
      })),
    })),
    _writes: writes,
    _deletes: deletes,
  };
}

describe('detourSimulation', () => {
  test('buildSyntheticGeometry creates renderable skipped and inferred paths', () => {
    const { shape } = selectRouteAndShape(makeStaticData(), '1');
    const geometry = buildSyntheticGeometry(shape, 'shape-1');

    expect(geometry.shapeId).toBe('shape-1');
    expect(geometry.skippedSegmentPolyline.length).toBeGreaterThanOrEqual(2);
    expect(geometry.inferredDetourPolyline.length).toBeGreaterThanOrEqual(2);
    expect(geometry.segments).toHaveLength(1);
    expect(geometry.entryPoint).toEqual(geometry.skippedSegmentPolyline[0]);
    expect(geometry.exitPoint).toEqual(
      geometry.skippedSegmentPolyline[geometry.skippedSegmentPolyline.length - 1]
    );
  });

  test('create is disabled unless explicitly enabled outside production', async () => {
    const ops = createDetourSimulationOps({
      env: { NODE_ENV: 'development', DETOUR_SIMULATION_ENABLED: 'false' },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => makeDbMock(),
    });

    const result = await ops.create({ routeId: '1' });

    expect(result.status).toBe(403);
    expect(result.body.enabled).toBe(false);
  });

  test('create writes a simulated activeDetours document', async () => {
    const db = makeDbMock();
    const ops = createDetourSimulationOps({
      env: { NODE_ENV: 'development', DETOUR_SIMULATION_ENABLED: 'true' },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
    });

    const result = await ops.create({ routeId: '1', durationMinutes: 5 });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({
      ok: true,
      routeId: '1',
      simulated: true,
      segmentCount: 1,
    }));

    expect(db._writes).toHaveLength(1);
    expect(db._writes[0].collectionName).toBe('activeDetours');
    expect(db._writes[0].docId).toBe('1');
    expect(db._writes[0].data).toEqual(expect.objectContaining({
      routeId: '1',
      simulated: true,
      source: 'dev-detour-simulation',
      state: 'active',
      vehicleCount: 1,
      segments: expect.any(Array),
    }));
  });

  test('create and clear use configured V2 active detour event collection', async () => {
    const db = makeDbMock();
    const ops = createDetourSimulationOps({
      env: {
        NODE_ENV: 'development',
        DETOUR_SIMULATION_ENABLED: 'true',
        DETOUR_DETECTOR_VERSION: 'v2',
      },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
    });

    await ops.create({ routeId: '1', durationMinutes: 5 });
    await ops.clear({ routeId: '1' });

    expect(db._writes[0].collectionName).toBe('activeDetourEventsV2');
    expect(db._writes[0].docId).toBe('simulated:1');
    expect(db._writes[0].data).toEqual(expect.objectContaining({
      eventId: 'simulated:1',
      detourEventId: 'simulated:1',
      routeId: '1',
    }));
    expect(db._deletes).toEqual([
      { collectionName: 'activeDetourEventsV2', docId: 'simulated:1' },
    ]);
  });

  test('farmers market preset writes simulated Route 11 detour', async () => {
    const db = makeDbMock();
    const ops = createDetourSimulationOps({
      env: { NODE_ENV: 'development', DETOUR_SIMULATION_ENABLED: 'true' },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
    });

    const result = await ops.create({ preset: 'farmers-market', durationMinutes: 15 });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({
      ok: true,
      simulated: true,
      preset: 'farmers-market',
      routeIds: ['11'],
    }));
    expect(db._writes).toHaveLength(1);
    expect(db._writes.map((write) => write.docId)).toEqual(['11']);
    expect(db._writes[0].data).toEqual(expect.objectContaining({
      routeId: '11',
      confidence: 'high',
      vehicleCount: 2,
      simulated: true,
      testPreset: 'farmers-market',
      title: "Farmer's Market Detour - Route 11",
      likelyDetourPolyline: expect.any(Array),
      segments: expect.any(Array),
    }));
    expect(db._writes[0].data.likelyDetourPolyline.length).toBeGreaterThanOrEqual(3);
  });

  test('farmers market geometry uses Owen, McDonald, and Mulcaster for Route 11', () => {
    const route11 = buildFarmersMarketGeometry('11', 'shape-1');

    expect(route11.entryPoint).toEqual({ latitude: 44.39043, longitude: -79.69007 });
    expect(route11.exitPoint).toEqual({ latitude: 44.39267, longitude: -79.68558 });
    expect(route11.skippedSegmentPolyline).toEqual([
      { latitude: 44.39047, longitude: -79.6855 },
      { latitude: 44.39267, longitude: -79.68558 },
    ]);
    expect(route11.likelyDetourRoadNames).toEqual(['Owen Street', 'McDonald Street', 'Mulcaster Street']);
    expect(route11.likelyDetourPolyline).toEqual([
      { latitude: 44.39043, longitude: -79.69007 },
      { latitude: 44.39262, longitude: -79.68792 },
      { latitude: 44.39267, longitude: -79.68558 },
    ]);
    expect(route11.segments[0].suppressStopDerivation).toBe(true);
  });

  test('saunders welham preset writes simulated Route 12A and 12B detours', async () => {
    const db = makeDbMock();
    const ops = createDetourSimulationOps({
      env: { NODE_ENV: 'development', DETOUR_SIMULATION_ENABLED: 'true' },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
    });

    const result = await ops.create({ preset: 'saunders-welham', durationMinutes: 20 });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({
      ok: true,
      simulated: true,
      preset: 'saunders-welham',
      routeIds: ['12A', '12B'],
      segmentCount: 2,
    }));
    expect(db._writes).toHaveLength(2);
    expect(db._writes.map((write) => write.docId)).toEqual(['12A', '12B']);
    expect(db._writes[0].data).toEqual(expect.objectContaining({
      routeId: '12A',
      confidence: 'high',
      vehicleCount: 2,
      simulated: true,
      testPreset: 'saunders-welham',
      title: 'Saunders/Welham Detour - Route 12',
      description: 'Test detour around the Saunders Road and Welham Road intersection closure.',
      detourPathLabel: 'Saunders/Welham test detour',
      likelyDetourPolyline: expect.any(Array),
      skippedSegmentPolyline: expect.any(Array),
      segments: expect.any(Array),
    }));
    expect(db._writes[0].data.likelyDetourRoadNames).toEqual(['Welham Road', 'Mapleview Drive East', 'Bayview Drive']);
    expect(db._writes[1].data.likelyDetourRoadNames).toEqual(['Bayview Drive', 'Mapleview Drive East', 'Welham Road']);
  });

  test('saunders welham geometry bypasses the closed intersection through Mapleview and Welham', () => {
    const route12A = buildSaundersWelhamGeometry('12A', 'shape-1');
    const route12B = buildSaundersWelhamGeometry('12B', 'shape-1');

    expect(route12A.skippedSegmentPolyline).toEqual([
      { latitude: 44.33425, longitude: -79.66897 },
      { latitude: 44.33229, longitude: -79.6773 },
    ]);
    expect(route12A.likelyDetourPolyline).toEqual([
      { latitude: 44.33425, longitude: -79.66897 },
      { latitude: 44.33922, longitude: -79.67001 },
      { latitude: 44.33651, longitude: -79.6785 },
      { latitude: 44.33229, longitude: -79.6773 },
    ]);

    expect(route12B.skippedSegmentPolyline).toEqual([
      { latitude: 44.33289, longitude: -79.67783 },
      { latitude: 44.3341, longitude: -79.66898 },
    ]);
    expect(route12B.likelyDetourPolyline).toEqual([
      { latitude: 44.33289, longitude: -79.67783 },
      { latitude: 44.33651, longitude: -79.6785 },
      { latitude: 44.33937, longitude: -79.66986 },
      { latitude: 44.3341, longitude: -79.66898 },
    ]);
    expect(route12B.likelyDetourRoadNames).toEqual(['Bayview Drive', 'Mapleview Drive East', 'Welham Road']);
  });

  test('dunlop ferndale anne preset writes simulated Route 2A and 2B detours', async () => {
    const db = makeDbMock();
    const ops = createDetourSimulationOps({
      env: { NODE_ENV: 'development', DETOUR_SIMULATION_ENABLED: 'true' },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
    });

    const result = await ops.create({ preset: 'dunlop-ferndale-anne', durationMinutes: 20 });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({
      ok: true,
      simulated: true,
      preset: 'dunlop-ferndale-anne',
      routeIds: ['2A', '2B'],
      segmentCount: 2,
    }));
    expect(db._writes).toHaveLength(2);
    expect(db._writes.map((write) => write.docId)).toEqual(['2A', '2B']);
    expect(db._writes[0].data).toEqual(expect.objectContaining({
      routeId: '2A',
      confidence: 'high',
      vehicleCount: 2,
      simulated: true,
      testPreset: 'dunlop-ferndale-anne',
      title: 'Dunlop/Ferndale/Anne Detour - Route 2',
      description: 'Test detour around a Dunlop Street West closure between Ferndale Drive and Anne Street.',
      detourPathLabel: 'Dunlop/Ferndale/Anne test detour',
      likelyDetourPolyline: expect.any(Array),
      skippedSegmentPolyline: expect.any(Array),
      segments: expect.any(Array),
    }));
    expect(db._writes[0].data.likelyDetourRoadNames).toEqual(['Ferndale Drive', 'Tiffin Street', 'Anne Street']);
    expect(db._writes[1].data.likelyDetourRoadNames).toEqual(['Ferndale Drive', 'Tiffin Street', 'Anne Street']);
    expect(db._writes[0].data.serviceRejoinPoint).toBeNull();
    expect(db._writes[0].data.segments[0].serviceRejoinPoint).toBeNull();
    expect(db._writes[1].data.exitPoint).toEqual({ latitude: 44.38237, longitude: -79.70522 });
    expect(db._writes[1].data.serviceRejoinPoint).toEqual({ latitude: 44.3833, longitude: -79.7059 });
    expect(db._writes[1].data.segments[0].serviceRejoinPoint).toEqual({ latitude: 44.3833, longitude: -79.7059 });
  });

  test('dunlop ferndale anne geometry keeps the 2B path on Anne instead of forcing a Dunlop endpoint turn', () => {
    const route2A = buildDunlopFerndaleAnneGeometry('2A', 'shape-1');
    const route2B = buildDunlopFerndaleAnneGeometry('2B', 'shape-1');

    expect(route2A.skippedSegmentPolyline).toEqual([
      { latitude: 44.37657, longitude: -79.71875 },
      { latitude: 44.38237, longitude: -79.70522 },
    ]);
    expect(route2A.likelyDetourPolyline).toEqual([
      { latitude: 44.37657, longitude: -79.71875 },
      { latitude: 44.36922, longitude: -79.71495 },
      { latitude: 44.37307, longitude: -79.69797 },
      { latitude: 44.38237, longitude: -79.70522 },
    ]);
    expect(route2A.serviceRejoinPoint).toBeNull();
    expect(route2A.segments[0].serviceRejoinPoint).toBeNull();

    expect(route2B.skippedSegmentPolyline).toEqual([
      { latitude: 44.37657, longitude: -79.71875 },
      { latitude: 44.38237, longitude: -79.70522 },
    ]);
    expect(route2B.likelyDetourPolyline).toEqual([
      { latitude: 44.37657, longitude: -79.71875 },
      { latitude: 44.36922, longitude: -79.71495 },
      { latitude: 44.37307, longitude: -79.69797 },
      { latitude: 44.3833, longitude: -79.7059 },
    ]);
    expect(route2B.exitPoint).toEqual({ latitude: 44.38237, longitude: -79.70522 });
    expect(route2B.serviceRejoinPoint).toEqual({ latitude: 44.3833, longitude: -79.7059 });
    expect(route2B.likelyDetourPolyline[route2B.likelyDetourPolyline.length - 1]).toEqual(
      route2B.serviceRejoinPoint
    );
    expect(route2B.likelyDetourPolyline[route2B.likelyDetourPolyline.length - 1]).not.toEqual(
      route2B.exitPoint
    );
    expect(route2B.likelyDetourRoadNames).toEqual(['Ferndale Drive', 'Tiffin Street', 'Anne Street']);
    expect(route2B.segments[0].serviceRejoinPoint).toEqual(route2B.serviceRejoinPoint);
    expect(route2B.segments[0].likelyDetourPolyline).toEqual(route2B.likelyDetourPolyline);
  });

  test('wellington owen grove preset writes simulated Route 7A and 7B detours', async () => {
    const db = makeDbMock();
    const ops = createDetourSimulationOps({
      env: { NODE_ENV: 'development', DETOUR_SIMULATION_ENABLED: 'true' },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
    });

    const result = await ops.create({ preset: 'wellington-owen-grove', durationMinutes: 20 });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({
      ok: true,
      simulated: true,
      preset: 'wellington-owen-grove',
      routeIds: ['7A', '7B'],
      segmentCount: 2,
    }));
    expect(db._writes).toHaveLength(2);
    expect(db._writes.map((write) => write.docId)).toEqual(['7A', '7B']);
    expect(db._writes[0].data).toEqual(expect.objectContaining({
      routeId: '7A',
      confidence: 'high',
      vehicleCount: 2,
      simulated: true,
      testPreset: 'wellington-owen-grove',
      title: 'Wellington/Owen/Grove Detour - Route 7',
      description: 'Test detour around a Grove Street East closure between Bayfield Street and Owen Street.',
      detourPathLabel: 'Wellington/Owen/Grove test detour',
      likelyDetourPolyline: expect.any(Array),
      skippedSegmentPolyline: expect.any(Array),
      segments: expect.any(Array),
    }));
    expect(db._writes[0].data.likelyDetourRoadNames).toEqual([
      'Bayfield Street',
      'Wellington Street East',
      'Owen Street',
      'Grove Street East',
    ]);
    expect(db._writes[1].data.likelyDetourRoadNames).toEqual([
      'Grove Street East',
      'Owen Street',
      'Wellington Street East',
      'Bayfield Street',
    ]);
  });

  test('legacy Route 7 preset aliases publish the replacement Wellington/Owen/Grove detour', async () => {
    const db = makeDbMock();
    const ops = createDetourSimulationOps({
      env: { NODE_ENV: 'development', DETOUR_SIMULATION_ENABLED: 'true' },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
    });

    const result = await ops.create({ preset: 'grove-stvincent-duckworth', durationMinutes: 20 });

    expect(result.status).toBe(200);
    expect(result.body.preset).toBe('wellington-owen-grove');
    expect(db._writes.map((write) => write.data.testPreset)).toEqual([
      'wellington-owen-grove',
      'wellington-owen-grove',
    ]);
  });

  test('wellington owen grove geometry is a local Route 7 workaround in both directions', () => {
    const route7A = buildWellingtonOwenGroveGeometry('7A', 'shape-1');
    const route7B = buildWellingtonOwenGroveGeometry('7B', 'shape-1');

    expect(route7A.skippedSegmentPolyline).toEqual([
      { latitude: 44.394131, longitude: -79.69412 },
      { latitude: 44.39659223, longitude: -79.69624255 },
      { latitude: 44.3984896, longitude: -79.69232901 },
    ]);
    expect(route7A.likelyDetourPolyline[0]).toEqual({ latitude: 44.394178, longitude: -79.694003 });
    expect(route7A.likelyDetourPolyline).toContainEqual({ latitude: 44.395391, longitude: -79.690151 });
    expect(route7A.likelyDetourPolyline[route7A.likelyDetourPolyline.length - 1]).toEqual(
      { latitude: 44.398408, longitude: -79.692668 }
    );
    expect(route7A.likelyDetourRoadNames).toEqual([
      'Bayfield Street',
      'Wellington Street East',
      'Owen Street',
      'Grove Street East',
    ]);

    expect(route7B.skippedSegmentPolyline).toEqual([
      { latitude: 44.39829531, longitude: -79.6930308 },
      { latitude: 44.39644259, longitude: -79.6963538 },
      { latitude: 44.39395278, longitude: -79.6942707 },
    ]);
    expect(route7B.likelyDetourPolyline[0]).toEqual(route7A.likelyDetourPolyline[route7A.likelyDetourPolyline.length - 1]);
    expect(route7B.likelyDetourPolyline[route7B.likelyDetourPolyline.length - 1]).toEqual(route7A.likelyDetourPolyline[0]);
    expect(route7B.likelyDetourRoadNames).toEqual([
      'Grove Street East',
      'Owen Street',
      'Wellington Street East',
      'Bayfield Street',
    ]);
    expect(route7B.segments[0].skippedSegmentPolyline).toEqual(route7B.skippedSegmentPolyline);
    expect(route7B.segments[0].likelyDetourPolyline).toEqual(route7B.likelyDetourPolyline);
  });

  test('yonge big bay little preset writes simulated Route 8A detour', async () => {
    const db = makeDbMock();
    const ops = createDetourSimulationOps({
      env: { NODE_ENV: 'development', DETOUR_SIMULATION_ENABLED: 'true' },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
    });

    const result = await ops.create({ preset: 'yonge-bigbay-little', durationMinutes: 20 });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({
      ok: true,
      simulated: true,
      preset: 'yonge-bigbay-little',
      routeIds: ['8A'],
      segmentCount: 1,
    }));
    expect(db._writes).toHaveLength(1);
    expect(db._writes[0].docId).toBe('8A');
    expect(db._writes[0].data).toEqual(expect.objectContaining({
      routeId: '8A',
      confidence: 'high',
      vehicleCount: 2,
      simulated: true,
      testPreset: 'yonge-bigbay-little',
      title: 'Yonge/Big Bay/Little Detour - Route 8A',
      description: 'Test detour around a Yonge Street closure between Little Avenue and Big Bay Point Road.',
      detourPathLabel: 'Yonge/Big Bay/Little test detour',
      likelyDetourPolyline: expect.any(Array),
      skippedSegmentPolyline: expect.any(Array),
      segments: expect.any(Array),
    }));
    expect(db._writes[0].data.likelyDetourRoadNames).toEqual(['Little Avenue', 'Huronia Road', 'Big Bay Point Road']);
  });

  test('named presets use road-matched geometry when road matching is enabled', async () => {
    const db = makeDbMock();
    const matchedPath = [
      { latitude: 44.36632, longitude: -79.66255 },
      { latitude: 44.3654, longitude: -79.6681 },
      { latitude: 44.3602, longitude: -79.6672 },
      { latitude: 44.35334, longitude: -79.66451 },
      { latitude: 44.35652, longitude: -79.64698 },
    ];
    const matchGeometry = jest.fn(async (geometry) => ({
      ...geometry,
      roadMatchSource: 'osrm-route',
      roadMatchConfidence: 'high',
      likelyDetourPolyline: matchedPath,
      segments: geometry.segments.map((segment) => ({
        ...segment,
        roadMatchSource: 'osrm-route',
        roadMatchConfidence: 'high',
        likelyDetourPolyline: matchedPath,
      })),
    }));
    const ops = createDetourSimulationOps({
      env: {
        NODE_ENV: 'development',
        DETOUR_SIMULATION_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example',
      },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
      matchGeometry,
    });

    const result = await ops.create({ preset: 'yonge-bigbay-little', durationMinutes: 20 });

    expect(result.status).toBe(200);
    expect(matchGeometry).toHaveBeenCalledTimes(1);
    expect(matchGeometry).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        preferRouteMatching: true,
        routeShapePolyline: expect.any(Array),
      })
    );
    expect(db._writes).toHaveLength(1);
    expect(db._writes[0].data.roadMatchSource).toBe('osrm-route');
    expect(db._writes[0].data.roadMatchConfidence).toBe('high');
    expect(db._writes[0].data.likelyDetourPolyline).toEqual(matchedPath);
    expect(db._writes[0].data.segments[0].roadMatchSource).toBe('osrm-route');
    expect(db._writes[0].data.segments[0].likelyDetourPolyline).toEqual(matchedPath);
  });

  test('yonge big bay little geometry bypasses Yonge through Huronia', () => {
    const route8A = buildYongeBigBayLittleGeometry('8A', 'shape-1');

    expect(route8A.skippedSegmentPolyline.length).toBeGreaterThan(10);
    expect(route8A.skippedSegmentPolyline[0]).toEqual({ latitude: 44.36632, longitude: -79.66255 });
    expect(route8A.skippedSegmentPolyline[route8A.skippedSegmentPolyline.length - 1]).toEqual(
      { latitude: 44.35652, longitude: -79.64698 }
    );
    expect(route8A.skippedSegmentPolyline).toContainEqual({ latitude: 44.36106, longitude: -79.65601 });
    expect(route8A.likelyDetourPolyline).toEqual([
      { latitude: 44.36632, longitude: -79.66255 },
      { latitude: 44.3648, longitude: -79.6712 },
      { latitude: 44.35334, longitude: -79.66451 },
      { latitude: 44.35652, longitude: -79.64698 },
    ]);
    expect(route8A.segments[0].skippedSegmentPolyline).toEqual(route8A.skippedSegmentPolyline);
    expect(route8A.segments[0].likelyDetourPolyline).toEqual(route8A.likelyDetourPolyline);
  });

  test('create decorates simulated geometry with road-matched path when available', async () => {
    const db = makeDbMock();
    const matchedPoint = { latitude: 44.391, longitude: -79.722 };
    const ops = createDetourSimulationOps({
      env: {
        NODE_ENV: 'development',
        DETOUR_SIMULATION_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example',
      },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
      matchGeometry: async (geometry) => ({
        ...geometry,
        likelyDetourPolyline: [
          matchedPoint,
          { latitude: 44.392, longitude: -79.721 },
          { latitude: 44.393, longitude: -79.720 },
        ],
        roadMatchSource: 'osrm-route',
        roadMatchConfidence: 'medium',
        segments: geometry.segments.map((segment) => ({
          ...segment,
          likelyDetourPolyline: [
            matchedPoint,
            { latitude: 44.392, longitude: -79.721 },
            { latitude: 44.393, longitude: -79.720 },
          ],
          roadMatchSource: 'osrm-route',
          roadMatchConfidence: 'medium',
        })),
      }),
    });

    const result = await ops.create({ routeId: '1', durationMinutes: 5 });

    expect(result.status).toBe(200);
    expect(result.body.roadMatchSource).toBe('osrm-route');
    expect(result.body.roadMatchConfidence).toBe('medium');
    expect(db._writes[0].data.roadMatchSource).toBe('osrm-route');
    expect(db._writes[0].data.likelyDetourPolyline[0]).toEqual(matchedPoint);
    expect(db._writes[0].data.segments[0].roadMatchSource).toBe('osrm-route');
  });

  test('create tries wider simulated paths until road matching avoids the closed segment', async () => {
    const db = makeDbMock();
    const calls = [];
    const ops = createDetourSimulationOps({
      env: {
        NODE_ENV: 'development',
        DETOUR_SIMULATION_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example',
        DETOUR_SIMULATION_OFFSET_CANDIDATES_METERS: '275,1000',
      },
      loadStaticData: async () => makeStaticData(),
      getFirestore: () => db,
      matchGeometry: jest.fn(async (geometry) => {
        calls.push(geometry.inferredDetourPolyline[1].latitude);
        if (calls.length === 1) return geometry;

        return {
          ...geometry,
          roadMatchSource: 'osrm-route',
          likelyDetourPolyline: [
            { latitude: 44.391, longitude: -79.722 },
            { latitude: 44.399, longitude: -79.730 },
          ],
          segments: geometry.segments.map((segment) => ({
            ...segment,
            roadMatchSource: 'osrm-route',
            likelyDetourPolyline: [
              { latitude: 44.391, longitude: -79.722 },
              { latitude: 44.399, longitude: -79.730 },
            ],
          })),
        };
      }),
    });

    const result = await ops.create({ routeId: '1', durationMinutes: 5 });

    expect(result.status).toBe(200);
    expect(result.body.roadMatchSource).toBe('osrm-route');
    expect(calls).toHaveLength(2);
    expect(db._writes[0].data.roadMatchSource).toBe('osrm-route');
  });

  test('buildMatchedSimulationGeometry chooses the most logical road-matched candidate', async () => {
    const { shape } = selectRouteAndShape(makeStaticData(), '1');
    const calls = [];

    const result = await buildMatchedSimulationGeometry({
      shape,
      shapeId: 'shape-1',
      options: {},
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example',
        DETOUR_SIMULATION_OFFSET_CANDIDATES_METERS: '1000,1500',
      },
      matchGeometry: jest.fn(async (geometry) => {
        calls.push(geometry.inferredDetourPolyline[1].latitude);

        const shortLogicalPath = [
          geometry.entryPoint,
          { latitude: geometry.entryPoint.latitude + 0.004, longitude: geometry.entryPoint.longitude - 0.002 },
          geometry.exitPoint,
        ];
        const longPath = [
          geometry.entryPoint,
          { latitude: geometry.entryPoint.latitude + 0.020, longitude: geometry.entryPoint.longitude - 0.020 },
          { latitude: geometry.exitPoint.latitude + 0.020, longitude: geometry.exitPoint.longitude - 0.020 },
          geometry.exitPoint,
        ];
        const likelyDetourPolyline = calls.length === 1 ? longPath : shortLogicalPath;

        return {
          ...geometry,
          roadMatchSource: 'osrm-route',
          likelyDetourPolyline,
          segments: geometry.segments.map((segment) => ({
            ...segment,
            roadMatchSource: 'osrm-route',
            likelyDetourPolyline,
          })),
        };
      }),
    });

    expect(calls).toHaveLength(2);
    expect(result.likelyDetourPolyline).toHaveLength(3);
  });

  test('offset candidate parsing respects explicit simulation offsets', () => {
    expect(getSimulationOffsetCandidates({ offsetMeters: 700 }, {
      DETOUR_SIMULATION_OFFSET_CANDIDATES_METERS: '275,1000',
    })).toEqual([700]);
    expect(getSimulationOffsetCandidates({}, {
      DETOUR_SIMULATION_OFFSET_CANDIDATES_METERS: '275,1000,1000,bad',
    })).toEqual([275, 1000]);
  });

  test('clear deletes only the requested simulated route document', async () => {
    const db = makeDbMock();
    const ops = createDetourSimulationOps({
      env: { NODE_ENV: 'development', DETOUR_SIMULATION_ENABLED: 'true' },
      getFirestore: () => db,
    });

    const result = await ops.clear({ routeId: '1' });

    expect(result.status).toBe(200);
    expect(db._deletes).toEqual([
      { collectionName: 'activeDetours', docId: '1' },
    ]);
  });
});
