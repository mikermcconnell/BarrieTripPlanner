const {
  buildMatchedSimulationGeometry,
  buildSyntheticGeometry,
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
  routeShapeMapping.set('10', ['shape-1']);
  routeShapeMapping.set('11', ['shape-1']);

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

  test('farmers market preset writes simulated Route 10 and 11 detours', async () => {
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
      routeIds: ['10', '11'],
    }));
    expect(db._writes).toHaveLength(2);
    expect(db._writes.map((write) => write.docId)).toEqual(['10', '11']);
    expect(db._writes[0].data).toEqual(expect.objectContaining({
      routeId: '10',
      confidence: 'high',
      vehicleCount: 2,
      simulated: true,
      testPreset: 'farmers-market',
      title: "Farmer's Market Detour - Route 10 and 11",
      likelyDetourPolyline: expect.any(Array),
      segments: expect.any(Array),
    }));
    expect(db._writes[0].data.likelyDetourPolyline.length).toBeGreaterThanOrEqual(3);
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
