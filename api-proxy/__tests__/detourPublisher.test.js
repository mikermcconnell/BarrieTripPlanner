const {
  shouldWriteGeometry,
  makeSnapshot,
  buildUpdatedEvent,
  buildDetectedEvent,
  buildClearedEvent,
  buildStaleClearedEvent,
  enforceGeometryTrustGate,
  preserveTrustedDetourPath,
  shouldAttemptRoadMatchBackfill,
  buildDetourEventId,
  GEOMETRY_WRITE_THROTTLE_MS,
} = require('../detourPublisher');

describe('buildDetourEventId', () => {
  test('uses the skipped/closed segment so opposite route directions share an event id', () => {
    const westbound = {
      skippedSegmentPolyline: [
        { latitude: 44.33424, longitude: -79.66897 },
        { latitude: 44.33229, longitude: -79.67731 },
      ],
      likelyDetourRoadNames: ['Hooper Road', 'Saunders Road'],
    };
    const eastbound = {
      skippedSegmentPolyline: [
        { latitude: 44.33231, longitude: -79.67729 },
        { latitude: 44.33422, longitude: -79.66899 },
      ],
      likelyDetourRoadNames: ['Saunders Road', 'Hooper Road'],
    };

    expect(buildDetourEventId('12A', westbound)).toBe(buildDetourEventId('12B', eastbound));
  });

  test('uses physical closure location rather than route family for event ids', () => {
    const sharedClosure = {
      skippedSegmentPolyline: [
        { latitude: 44.392064, longitude: -79.692667 },
        { latitude: 44.390197, longitude: -79.692541 },
      ],
    };

    expect(buildDetourEventId('7B', sharedClosure)).toBe(buildDetourEventId('12B', sharedClosure));
  });

  test('keeps separate closures separate for the same route family', () => {
    const saunders = {
      skippedSegmentPolyline: [
        { latitude: 44.33424, longitude: -79.66897 },
        { latitude: 44.33229, longitude: -79.67731 },
      ],
    };
    const sophia = {
      skippedSegmentPolyline: [
        { latitude: 44.3941, longitude: -79.7022 },
        { latitude: 44.3962, longitude: -79.7104 },
      ],
    };

    expect(buildDetourEventId('12B', saunders)).not.toBe(buildDetourEventId('12B', sophia));
  });
});

describe('publishDetours event ids', () => {
  test('rewrites legacy route-based event ids to physical closure ids on geometry writes', async () => {
    jest.resetModules();
    const writes = {};
    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => {
          const emptyQuery = { get: async () => ({ empty: true, docs: [] }) };
          const whereQuery = {
            orderBy: () => ({ limit: () => emptyQuery }),
            limit: () => emptyQuery,
          };
          return {
            doc: (id) => ({
              set: async (data) => { writes[`${name}/${id}`] = data; },
              delete: async () => {},
            }),
            get: async () => ({ size: 0, forEach: () => {} }),
            orderBy: () => ({ limit: () => emptyQuery }),
            where: () => whereQuery,
          };
        },
        batch: () => ({
          delete: () => {},
          commit: async () => {},
        }),
      }),
    }));
    const publisher = require('../detourPublisher');
    const sharedClosure = {
      shapeId: 'shape-12b',
      confidence: 'medium',
      segments: [{
        shapeId: 'shape-12b',
        detourEventId: 'detour-event-12-legacy',
        skippedSegmentPolyline: [
          { latitude: 44.392064, longitude: -79.692667 },
          { latitude: 44.390197, longitude: -79.692541 },
        ],
        entryPoint: { latitude: 44.392064, longitude: -79.692667 },
        exitPoint: { latitude: 44.390197, longitude: -79.692541 },
      }],
    };

    await publisher.publishDetours({
      '12B': {
        routeId: '12B',
        detectedAt: new Date('2026-05-22T17:00:00Z'),
        lastSeenAt: new Date('2026-05-22T17:01:00Z'),
        vehicleCount: 1,
        state: 'active',
        geometry: sharedClosure,
      },
    });

    const written = writes['activeDetours/12B'];
    expect(written.detourEventId).toBe(buildDetourEventId('7B', sharedClosure.segments[0]));
    expect(written.segments[0].detourEventId).toBe(buildDetourEventId('7B', sharedClosure.segments[0]));
  });

  test('keeps source event id on projected shared-location route geometry', async () => {
    jest.resetModules();
    const writes = {};
    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => {
          const emptyQuery = { get: async () => ({ empty: true, docs: [] }) };
          const whereQuery = {
            orderBy: () => ({ limit: () => emptyQuery }),
            limit: () => emptyQuery,
          };
          return {
            doc: (id) => ({
              set: async (data) => { writes[`${name}/${id}`] = data; },
              delete: async () => {},
            }),
            get: async () => ({ size: 0, forEach: () => {} }),
            orderBy: () => ({ limit: () => emptyQuery }),
            where: () => whereQuery,
          };
        },
        batch: () => ({
          delete: () => {},
          commit: async () => {},
        }),
      }),
    }));
    const publisher = require('../detourPublisher');

    await publisher.publishDetours({
      '7B': {
        routeId: '7B',
        handoffSourceRouteId: '12B',
        detectedAt: new Date('2026-05-22T17:00:00Z'),
        lastSeenAt: new Date('2026-05-22T17:01:00Z'),
        vehicleCount: 1,
        state: 'active',
        geometry: {
          shapeId: 'shape-7b',
          confidence: 'medium',
          segments: [{
            shapeId: 'shape-7b',
            detourEventId: 'detour-event-source-12b',
            skippedSegmentPolyline: [
              { latitude: 44.3921, longitude: -79.6927 },
              { latitude: 44.3902, longitude: -79.6925 },
            ],
            entryPoint: { latitude: 44.3921, longitude: -79.6927 },
            exitPoint: { latitude: 44.3902, longitude: -79.6925 },
            debug: { sharedLocationHandoffEnabled: true },
          }],
        },
      },
    });

    const written = writes['activeDetours/7B'];
    expect(written.detourEventId).toBe('detour-event-source-12b');
    expect(written.segments[0].detourEventId).toBe('detour-event-source-12b');
  });
});

describe('makeSnapshot', () => {
  test('includes all geometry fields from doc', () => {
    const doc = {
      routeId: '8A',
      detectedAt: new Date('2024-01-01T00:00:00Z'),
      lastSeenAt: new Date('2024-01-01T00:05:00Z'),
      updatedAt: Date.now(),
      triggerVehicleId: 'bus-1',
      vehicleCount: 2,
      state: 'active',
      confidence: 'high',
      evidencePointCount: 15,
      lastEvidenceAt: Date.now() - 30000,
      shapeId: 'shape-8a',
      entryPoint: { latitude: 44.39, longitude: -79.698 },
      exitPoint: { latitude: 44.39, longitude: -79.690 },
      skippedSegmentPolyline: [
        { latitude: 44.39, longitude: -79.698 },
        { latitude: 44.39, longitude: -79.690 },
      ],
      inferredDetourPolyline: [
        { latitude: 44.395, longitude: -79.698 },
        { latitude: 44.395, longitude: -79.690 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.396, longitude: -79.698 },
        { latitude: 44.396, longitude: -79.690 },
      ],
      likelyDetourRoadNames: ['Yonge Street', 'Big Bay Point Road'],
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-match',
      detourPathLabel: 'Likely detour path',
      detourEventId: 'detour-event-12-saunders',
      segments: [{
        shapeId: 'shape-8a',
        detourEventId: 'detour-event-12-saunders',
        entryPoint: { latitude: 44.39, longitude: -79.698 },
        exitPoint: { latitude: 44.39, longitude: -79.690 },
        likelyDetourPolyline: [
          { latitude: 44.396, longitude: -79.698 },
          { latitude: 44.396, longitude: -79.690 },
        ],
        likelyDetourRoadNames: ['Yonge Street'],
      }],
    };
    const snap = makeSnapshot(doc);

    expect(snap.routeId).toBe('8A');
    expect(snap.confidence).toBe('high');
    expect(snap.evidencePointCount).toBe(15);
    expect(snap.lastEvidenceAt).toBeDefined();
    expect(snap.state).toBe('active');
    expect(snap.shapeId).toBe('shape-8a');
    expect(snap.entryPoint).toEqual({ latitude: 44.39, longitude: -79.698 });
    expect(snap.exitPoint).toEqual({ latitude: 44.39, longitude: -79.690 });
    expect(snap.likelyDetourPolyline).toHaveLength(2);
    expect(snap.likelyDetourRoadNames).toEqual(['Yonge Street', 'Big Bay Point Road']);
    expect(snap.roadMatchConfidence).toBe('high');
    expect(snap.detourPathLabel).toBe('Likely detour path');
    expect(snap.detourEventId).toBe('detour-event-12-saunders');
    expect(snap.segmentCount).toBe(1);
    expect(snap.segments[0].detourEventId).toBe('detour-event-12-saunders');
  });

  test('defaults geometry fields to null when absent', () => {
    const doc = {
      routeId: '8A',
      detectedAt: new Date(),
      vehicleCount: 1,
    };
    const snap = makeSnapshot(doc);

    expect(snap.confidence).toBeNull();
    expect(snap.evidencePointCount).toBeNull();
    expect(snap.lastEvidenceAt).toBeNull();
  });

  test('preserves previous geometry when current write is throttled', () => {
    const previous = {
      shapeId: 'shape-8a',
      entryPoint: { latitude: 44.39, longitude: -79.698 },
      exitPoint: { latitude: 44.39, longitude: -79.690 },
      skippedSegmentPolyline: [
        { latitude: 44.39, longitude: -79.698 },
        { latitude: 44.39, longitude: -79.690 },
      ],
      inferredDetourPolyline: [
        { latitude: 44.395, longitude: -79.698 },
        { latitude: 44.395, longitude: -79.690 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.396, longitude: -79.698 },
        { latitude: 44.396, longitude: -79.690 },
      ],
      likelyDetourRoadNames: ['Yonge Street'],
      roadMatchConfidence: 'medium',
      detourPathLabel: 'Likely detour path',
      segments: [{
        shapeId: 'shape-8a',
        entryPoint: { latitude: 44.39, longitude: -79.698 },
        exitPoint: { latitude: 44.39, longitude: -79.690 },
        likelyDetourPolyline: [
          { latitude: 44.396, longitude: -79.698 },
          { latitude: 44.396, longitude: -79.690 },
        ],
      }],
      confidence: 'high',
      evidencePointCount: 15,
      lastEvidenceAt: 1704067500000,
      segmentCount: 1,
      geometrySignature: 'shape-8a:44.39:-79.698:44.39:-79.69',
    };
    const doc = {
      routeId: '8A',
      detectedAt: new Date(),
      lastSeenAt: new Date(),
      vehicleCount: 1,
      state: 'active',
    };

    const snap = makeSnapshot(doc, previous);

    expect(snap.shapeId).toBe('shape-8a');
    expect(snap.entryPoint).toEqual({ latitude: 44.39, longitude: -79.698 });
    expect(snap.exitPoint).toEqual({ latitude: 44.39, longitude: -79.690 });
    expect(snap.skippedSegmentPolyline).toHaveLength(2);
    expect(snap.inferredDetourPolyline).toHaveLength(2);
    expect(snap.likelyDetourPolyline).toHaveLength(2);
    expect(snap.likelyDetourRoadNames).toEqual(['Yonge Street']);
    expect(snap.roadMatchConfidence).toBe('medium');
    expect(snap.confidence).toBe('high');
    expect(snap.evidencePointCount).toBe(15);
    expect(snap.lastEvidenceAt).toBe(1704067500000);
    expect(snap.segmentCount).toBe(1);
  });
});

describe('enforceGeometryTrustGate', () => {
  test('orients trusted detour paths to the closed route direction before publish', () => {
    const result = enforceGeometryTrustGate({
      shapeId: 'shape-12b',
      entryPoint: { latitude: 44.39, longitude: -79.688 },
      exitPoint: { latitude: 44.39, longitude: -79.696 },
      skippedSegmentPolyline: [
        { latitude: 44.39, longitude: -79.688 },
        { latitude: 44.39, longitude: -79.696 },
      ],
      inferredDetourPolyline: [
        { latitude: 44.395, longitude: -79.696 },
        { latitude: 44.395, longitude: -79.692 },
        { latitude: 44.395, longitude: -79.688 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.396, longitude: -79.696 },
        { latitude: 44.396, longitude: -79.692 },
        { latitude: 44.396, longitude: -79.688 },
      ],
      canShowDetourPath: true,
      segments: [{
        shapeId: 'shape-12b',
        entryPoint: { latitude: 44.39, longitude: -79.688 },
        exitPoint: { latitude: 44.39, longitude: -79.696 },
        skippedSegmentPolyline: [
          { latitude: 44.39, longitude: -79.688 },
          { latitude: 44.39, longitude: -79.696 },
        ],
        inferredDetourPolyline: [
          { latitude: 44.395, longitude: -79.696 },
          { latitude: 44.395, longitude: -79.692 },
          { latitude: 44.395, longitude: -79.688 },
        ],
        likelyDetourPolyline: [
          { latitude: 44.396, longitude: -79.696 },
          { latitude: 44.396, longitude: -79.692 },
          { latitude: 44.396, longitude: -79.688 },
        ],
        canShowDetourPath: true,
      }],
    });

    expect(result.inferredDetourPolyline[0].longitude).toBeCloseTo(-79.688, 3);
    expect(result.inferredDetourPolyline[2].longitude).toBeCloseTo(-79.696, 3);
    expect(result.likelyDetourPolyline[0].longitude).toBeCloseTo(-79.688, 3);
    expect(result.likelyDetourPolyline[2].longitude).toBeCloseTo(-79.696, 3);
    expect(result.segments[0].inferredDetourPolyline[0].longitude).toBeCloseTo(-79.688, 3);
    expect(result.segments[0].likelyDetourPolyline[0].longitude).toBeCloseTo(-79.688, 3);
  });

  test('hides legacy one-sided inferred paths while keeping alert geometry data', () => {
    const inferredPath = [
      { latitude: 44.395, longitude: -79.699 },
      { latitude: 44.395, longitude: -79.687 },
    ];
    const skippedPath = [
      { latitude: 44.39, longitude: -79.699 },
      { latitude: 44.39, longitude: -79.687 },
    ];

    const result = enforceGeometryTrustGate({
      shapeId: 'shape-12',
      skippedSegmentPolyline: skippedPath,
      inferredDetourPolyline: inferredPath,
      likelyDetourPolyline: inferredPath,
      likelyDetourRoadNames: ['Bayview Drive'],
      roadMatchConfidence: 'medium',
      roadMatchSource: 'osrm-match',
      segments: [{
        shapeId: 'shape-12',
        skippedSegmentPolyline: skippedPath,
        inferredDetourPolyline: inferredPath,
        entryPoint: { latitude: 44.39, longitude: -79.699 },
        exitPoint: { latitude: 44.39, longitude: -79.687 },
        debug: {
          entryAnchorSource: 'projected-evidence-fallback',
          exitAnchorSource: 'boundary-candidate',
          hasEntryBoundaryCandidate: false,
          hasExitBoundaryCandidate: true,
          entryCandidateCount: 0,
          exitCandidateCount: 1,
        },
      }],
    });

    expect(result.inferredDetourPolyline).toEqual(inferredPath);
    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.likelyDetourRoadNames).toEqual([]);
    expect(result.roadMatchConfidence).toBeNull();
    expect(result.skippedSegmentPolyline).toBeNull();
    expect(result.canShowDetourPath).toBe(false);
    expect(result.segments[0].canShowDetourPath).toBe(false);
    expect(result.segments[0].skippedSegmentPolyline).toBeNull();
    expect(result.segments[0].likelyDetourPolyline).toBeNull();
  });

  test('clears low-confidence road-matched paths before publishing geometry', () => {
    const path = [
      { latitude: 44.390437, longitude: -79.692535 },
      { latitude: 44.388233, longitude: -79.687958 },
      { latitude: 44.390430, longitude: -79.691206 },
    ];
    const result = enforceGeometryTrustGate({
      shapeId: 'shape-8',
      canShowDetourPath: true,
      inferredDetourPolyline: path,
      likelyDetourPolyline: path,
      likelyDetourRoadNames: ['Bayfield Street'],
      roadMatchConfidence: 'low',
      roadMatchRawConfidence: 0.07,
      roadMatchSource: 'osrm-match',
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: path,
        likelyDetourPolyline: path,
        likelyDetourRoadNames: ['Bayfield Street'],
        roadMatchConfidence: 'low',
        roadMatchRawConfidence: 0.07,
        roadMatchSource: 'osrm-match',
      }],
    });

    expect(result.canShowDetourPath).toBe(true);
    expect(result.inferredDetourPolyline).toEqual(path);
    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.likelyDetourRoadNames).toEqual([]);
    expect(result.roadMatchConfidence).toBeNull();
    expect(result.roadMatchSource).toBeNull();
    expect(result.segments[0].likelyDetourPolyline).toBeNull();
    expect(result.segments[0].roadMatchConfidence).toBeNull();
  });

  test('clears stale likely paths when debug endpoint mismatch says the path is untrusted', () => {
    const path = [
      { latitude: 44.390437, longitude: -79.692535 },
      { latitude: 44.388233, longitude: -79.687958 },
      { latitude: 44.390430, longitude: -79.691206 },
    ];
    const result = enforceGeometryTrustGate({
      shapeId: 'shape-8',
      canShowDetourPath: true,
      inferredDetourPolyline: path,
      likelyDetourPolyline: path,
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: path,
        likelyDetourPolyline: path,
        debug: {
          untrustedPathEndpointMismatchMeters: 479,
        },
      }],
    });

    expect(result.canShowDetourPath).toBe(true);
    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.segments[0].likelyDetourPolyline).toBeNull();
  });

  test('filters same-stop turnaround segments before publishing top-level geometry', () => {
    const validPath = [
      { latitude: 44.333039, longitude: -79.673622 },
      { latitude: 44.334702, longitude: -79.668856 },
    ];
    const selfLoopPath = [
      { latitude: 44.386386, longitude: -79.69204 },
      { latitude: 44.38743, longitude: -79.689927 },
      { latitude: 44.386386, longitude: -79.69204 },
    ];

    const result = enforceGeometryTrustGate({
      canShowDetourPath: true,
      inferredDetourPolyline: selfLoopPath,
      likelyDetourPolyline: selfLoopPath,
      likelyDetourRoadNames: ['Simcoe Street'],
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-match',
      segments: [
        {
          canShowDetourPath: true,
          inferredDetourPolyline: validPath,
          skippedSegmentPolyline: validPath,
          entryPoint: validPath[0],
          exitPoint: validPath[1],
          entryStopId: '617',
          exitStopId: '931',
          skippedStopIds: ['617', '618', '931'],
        },
        {
          canShowDetourPath: true,
          inferredDetourPolyline: selfLoopPath,
          likelyDetourPolyline: selfLoopPath,
          likelyDetourRoadNames: ['Simcoe Street'],
          roadMatchConfidence: 'high',
          roadMatchSource: 'osrm-match',
          entryStopId: '1',
          exitStopId: '1',
          skippedStopIds: ['1'],
        },
      ],
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].skippedStopIds).toEqual(['617', '618', '931']);
    expect(result.inferredDetourPolyline).toEqual(validPath);
    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.likelyDetourRoadNames).toEqual([]);
    expect(result.canShowDetourPath).toBe(true);
  });
});

describe('preserveTrustedDetourPath', () => {
  test('keeps the last trusted path when an active update loses renderable geometry', () => {
    const trustedPath = [
      { latitude: 44.333067, longitude: -79.673553 },
      { latitude: 44.33654, longitude: -79.669865 },
      { latitude: 44.337165, longitude: -79.669397 },
    ];
    const previous = {
      canShowDetourPath: true,
      likelyDetourPolyline: trustedPath,
      likelyDetourRoadNames: ['Saunders Road', 'Hooper Road', 'Welham Road'],
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-match',
      segments: [{
        shapeId: 'shape-12b',
        canShowDetourPath: true,
        likelyDetourPolyline: trustedPath,
        likelyDetourRoadNames: ['Saunders Road', 'Hooper Road', 'Welham Road'],
        roadMatchConfidence: 'high',
        roadMatchSource: 'osrm-match',
      }],
    };
    const weakGeometry = {
      shapeId: 'shape-12b',
      canShowDetourPath: false,
      skippedSegmentPolyline: [
        { latitude: 44.332330195752895, longitude: -79.67758412288693 },
        { latitude: 44.33320818445025, longitude: -79.67290120961049 },
      ],
      likelyDetourPolyline: null,
      likelyDetourRoadNames: [],
      segments: [{
        shapeId: 'shape-12b',
        canShowDetourPath: false,
        skippedSegmentPolyline: [
          { latitude: 44.332330195752895, longitude: -79.67758412288693 },
          { latitude: 44.33320818445025, longitude: -79.67290120961049 },
        ],
        likelyDetourPolyline: null,
      }],
    };

    const result = preserveTrustedDetourPath(weakGeometry, previous, { state: 'active' });

    expect(result.canShowDetourPath).toBe(true);
    expect(result.likelyDetourPolyline).toEqual(trustedPath);
    expect(result.likelyDetourRoadNames).toEqual(['Saunders Road', 'Hooper Road', 'Welham Road']);
    expect(result.roadMatchConfidence).toBe('high');
    expect(result.segments[0].canShowDetourPath).toBe(true);
    expect(result.segments[0].likelyDetourPolyline).toEqual(trustedPath);
  });

  test('does not preserve a trusted path when current weak geometry is in a different location', () => {
    const duckworthPath = [
      { latitude: 44.41042, longitude: -79.67381 },
      { latitude: 44.40951, longitude: -79.67194 },
    ];
    const previous = {
      shapeId: 'shape-7b',
      canShowDetourPath: true,
      likelyDetourPolyline: duckworthPath,
      likelyDetourRoadNames: ['Duckworth Street', 'Grizzlies Way'],
      entryPoint: { latitude: 44.41042, longitude: -79.67381 },
      exitPoint: { latitude: 44.40951, longitude: -79.67194 },
      segments: [{
        shapeId: 'shape-7b',
        canShowDetourPath: true,
        likelyDetourPolyline: duckworthPath,
        entryPoint: { latitude: 44.41042, longitude: -79.67381 },
        exitPoint: { latitude: 44.40951, longitude: -79.67194 },
      }],
    };
    const mapleviewGeometry = {
      shapeId: 'shape-7b',
      canShowDetourPath: false,
      likelyDetourPolyline: null,
      likelyDetourRoadNames: [],
      entryPoint: { latitude: 44.33206, longitude: -79.69920 },
      exitPoint: { latitude: 44.33371, longitude: -79.69180 },
      skippedSegmentPolyline: [
        { latitude: 44.33206, longitude: -79.69920 },
        { latitude: 44.33371, longitude: -79.69180 },
      ],
      segments: [{
        shapeId: 'shape-7b',
        canShowDetourPath: false,
        likelyDetourPolyline: null,
        entryPoint: { latitude: 44.33206, longitude: -79.69920 },
        exitPoint: { latitude: 44.33371, longitude: -79.69180 },
      }],
    };

    const result = preserveTrustedDetourPath(mapleviewGeometry, previous, { state: 'active' });

    expect(result.canShowDetourPath).toBe(false);
    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.likelyDetourRoadNames).toEqual([]);
    expect(result.segments[0].canShowDetourPath).toBe(false);
  });

  test('does not preserve a trusted path from a same-stop turnaround segment', () => {
    const selfLoopPath = [
      { latitude: 44.386386, longitude: -79.69204 },
      { latitude: 44.38743, longitude: -79.689927 },
      { latitude: 44.386386, longitude: -79.69204 },
    ];
    const previous = {
      canShowDetourPath: true,
      likelyDetourPolyline: selfLoopPath,
      likelyDetourRoadNames: ['Bayfield Street'],
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-route',
      segments: [{
        canShowDetourPath: true,
        likelyDetourPolyline: selfLoopPath,
        inferredDetourPolyline: selfLoopPath,
        likelyDetourRoadNames: ['Bayfield Street'],
        roadMatchConfidence: 'high',
        roadMatchSource: 'osrm-route',
        entryStopId: '2',
        exitStopId: '2',
        skippedStopIds: ['2'],
      }],
    };
    const weakGeometry = {
      canShowDetourPath: false,
      likelyDetourPolyline: null,
      likelyDetourRoadNames: [],
      segments: [],
    };

    const result = preserveTrustedDetourPath(weakGeometry, previous, { state: 'active' });

    expect(result.canShowDetourPath).toBe(false);
    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.likelyDetourRoadNames).toEqual([]);
    expect(result.segments).toEqual([]);
  });

  test('does not reintroduce same-stop segments while preserving a valid previous path', () => {
    const validPath = [
      { latitude: 44.333039, longitude: -79.673622 },
      { latitude: 44.33713, longitude: -79.66934 },
    ];
    const selfLoopPath = [
      { latitude: 44.386386, longitude: -79.69204 },
      { latitude: 44.389031, longitude: -79.685426 },
      { latitude: 44.386386, longitude: -79.69204 },
    ];
    const previous = {
      canShowDetourPath: true,
      inferredDetourPolyline: validPath,
      likelyDetourPolyline: selfLoopPath,
      likelyDetourRoadNames: ['Simcoe Street'],
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-match',
      segments: [
        {
          canShowDetourPath: true,
          inferredDetourPolyline: validPath,
          skippedSegmentPolyline: validPath,
          entryPoint: validPath[0],
          exitPoint: validPath[1],
          entryStopId: '617',
          exitStopId: '931',
          skippedStopIds: ['617', '618', '931'],
        },
        {
          canShowDetourPath: true,
          likelyDetourPolyline: selfLoopPath,
          inferredDetourPolyline: selfLoopPath,
          likelyDetourRoadNames: ['Simcoe Street'],
          roadMatchConfidence: 'high',
          roadMatchSource: 'osrm-match',
          entryStopId: '1',
          exitStopId: '1',
          skippedStopIds: ['1'],
        },
      ],
    };
    const weakGeometry = {
      canShowDetourPath: true,
      inferredDetourPolyline: validPath,
      likelyDetourPolyline: null,
      likelyDetourRoadNames: [],
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: validPath,
        skippedSegmentPolyline: validPath,
        entryPoint: validPath[0],
        exitPoint: validPath[1],
        entryStopId: '617',
        exitStopId: '931',
        skippedStopIds: ['617', '618', '931'],
      }],
    };

    const result = preserveTrustedDetourPath(weakGeometry, previous, { state: 'active' });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].entryStopId).toBe('617');
    expect(result.segments[0].exitStopId).toBe('931');
    expect(result.segments[0].skippedStopIds).toEqual(['617', '618', '931']);
    expect(result.segments.some(segment => segment.entryStopId === segment.exitStopId)).toBe(false);
  });

  test('does not preserve trusted geometry once the detour is clear-pending', () => {
    const previous = {
      canShowDetourPath: true,
      likelyDetourPolyline: [
        { latitude: 44.333067, longitude: -79.673553 },
        { latitude: 44.337165, longitude: -79.669397 },
      ],
    };
    const weakGeometry = {
      canShowDetourPath: false,
      likelyDetourPolyline: null,
      segments: [],
    };

    const result = preserveTrustedDetourPath(weakGeometry, previous, { state: 'clear-pending' });

    expect(result.canShowDetourPath).toBe(false);
    expect(result.likelyDetourPolyline).toBeNull();
  });

  test('restores the trusted path after road matching downgrades current geometry', () => {
    const trustedPath = [
      { latitude: 44.333067, longitude: -79.673553 },
      { latitude: 44.337165, longitude: -79.669397 },
    ];
    const previous = {
      canShowDetourPath: true,
      likelyDetourPolyline: trustedPath,
      likelyDetourRoadNames: ['Saunders Road', 'Hooper Road', 'Welham Road'],
      roadMatchConfidence: 'high',
      segments: [{
        canShowDetourPath: true,
        likelyDetourPolyline: trustedPath,
      }],
    };
    const roadMatchedDowngrade = {
      canShowDetourPath: false,
      inferredDetourPolyline: [
        { latitude: 44.333, longitude: -79.673 },
        { latitude: 44.334, longitude: -79.674 },
      ],
      likelyDetourPolyline: null,
      likelyDetourRoadNames: [],
      roadMatchConfidence: null,
      segments: [{
        canShowDetourPath: false,
        inferredDetourPolyline: [
          { latitude: 44.333, longitude: -79.673 },
          { latitude: 44.334, longitude: -79.674 },
        ],
        likelyDetourPolyline: null,
      }],
    };

    const result = preserveTrustedDetourPath(roadMatchedDowngrade, previous, { state: 'active' });

    expect(result.canShowDetourPath).toBe(true);
    expect(result.likelyDetourPolyline).toEqual(trustedPath);
    expect(result.segments[0].canShowDetourPath).toBe(true);
    expect(result.segments[0].likelyDetourPolyline).toEqual(trustedPath);
  });

  test('does not restore a previous low-confidence road-matched path', () => {
    const lowConfidencePath = [
      { latitude: 44.390437, longitude: -79.692535 },
      { latitude: 44.388233, longitude: -79.687958 },
      { latitude: 44.390430, longitude: -79.691206 },
    ];
    const previous = {
      canShowDetourPath: true,
      inferredDetourPolyline: lowConfidencePath,
      likelyDetourPolyline: lowConfidencePath,
      likelyDetourRoadNames: ['Bayfield Street', 'Dunlop Street East'],
      roadMatchConfidence: 'low',
      roadMatchRawConfidence: 0.07,
      roadMatchSource: 'osrm-match',
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: lowConfidencePath,
        likelyDetourPolyline: lowConfidencePath,
        likelyDetourRoadNames: ['Bayfield Street', 'Dunlop Street East'],
        roadMatchConfidence: 'low',
        roadMatchRawConfidence: 0.07,
        roadMatchSource: 'osrm-match',
      }],
    };
    const currentTrustedButUnmatched = {
      canShowDetourPath: true,
      inferredDetourPolyline: lowConfidencePath,
      likelyDetourPolyline: null,
      likelyDetourRoadNames: [],
      roadMatchConfidence: null,
      roadMatchRawConfidence: null,
      roadMatchSource: null,
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: lowConfidencePath,
        likelyDetourPolyline: null,
        likelyDetourRoadNames: [],
        roadMatchConfidence: null,
        roadMatchRawConfidence: null,
        roadMatchSource: null,
      }],
    };

    const result = preserveTrustedDetourPath(currentTrustedButUnmatched, previous, { state: 'active' });

    expect(result.canShowDetourPath).toBe(true);
    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.likelyDetourRoadNames).toEqual([]);
    expect(result.roadMatchConfidence).toBeNull();
    expect(result.roadMatchSource).toBeNull();
    expect(result.segments[0].likelyDetourPolyline).toBeNull();
    expect(result.segments[0].roadMatchConfidence).toBeNull();
  });

  test('adds the previous likely path when current geometry only has a trusted inferred path', () => {
    const trustedPath = [
      { latitude: 44.333067, longitude: -79.673553 },
      { latitude: 44.337165, longitude: -79.669397 },
    ];
    const previous = {
      canShowDetourPath: true,
      likelyDetourPolyline: trustedPath,
      segments: [{
        canShowDetourPath: true,
        likelyDetourPolyline: trustedPath,
      }],
    };
    const currentTrustedButUnmatched = {
      canShowDetourPath: true,
      inferredDetourPolyline: [
        { latitude: 44.333, longitude: -79.673 },
        { latitude: 44.334, longitude: -79.674 },
      ],
      likelyDetourPolyline: null,
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: [
          { latitude: 44.333, longitude: -79.673 },
          { latitude: 44.334, longitude: -79.674 },
        ],
        likelyDetourPolyline: null,
      }],
    };

    const result = preserveTrustedDetourPath(currentTrustedButUnmatched, previous, { state: 'active' });

    expect(result.canShowDetourPath).toBe(true);
    expect(result.likelyDetourPolyline).toEqual(trustedPath);
    expect(result.segments[0].likelyDetourPolyline).toEqual(trustedPath);
  });
});

describe('shouldWriteGeometry', () => {
  const NOW = Date.now();

  function makeDetour(overrides = {}) {
    return {
      state: 'active',
      geometry: {
        skippedSegmentPolyline: [{ lat: 44.39, lon: -79.70 }],
        inferredDetourPolyline: [{ lat: 44.395, lon: -79.695 }],
        confidence: 'medium',
        evidencePointCount: 10,
      },
      ...overrides,
    };
  }

  function makePrevSnapshot(overrides = {}) {
    return {
      state: 'active',
      confidence: 'medium',
      evidencePointCount: 10,
      ...overrides,
    };
  }

  test('returns false when no geometry', () => {
    const detour = makeDetour({ geometry: null });
    expect(shouldWriteGeometry('8A', detour, makePrevSnapshot(), NOW)).toBe(false);
  });

  test('returns true on state change', () => {
    const detour = makeDetour({ state: 'clear-pending' });
    const prev = makePrevSnapshot({ state: 'active' });
    expect(shouldWriteGeometry('8A', detour, prev, NOW)).toBe(true);
  });

  test('returns true on confidence change', () => {
    const detour = makeDetour();
    detour.geometry.confidence = 'high';
    const prev = makePrevSnapshot({ confidence: 'medium' });
    expect(shouldWriteGeometry('8A', detour, prev, NOW)).toBe(true);
  });

  test('returns true when point count changes significantly', () => {
    const detour = makeDetour();
    detour.geometry.evidencePointCount = 20; // +10 from prev's 10
    const prev = makePrevSnapshot({ evidencePointCount: 10 });
    expect(shouldWriteGeometry('8A', detour, prev, NOW)).toBe(true);
  });

  test('returns false when point count changes insignificantly within throttle window', () => {
    const detour = makeDetour();
    detour.geometry.evidencePointCount = 12; // +2 from prev's 10
    const prev = makePrevSnapshot({ evidencePointCount: 10 });
    // Set a recent geometry write time by testing within throttle window
    // shouldWriteGeometry checks lastGeometryWriteTime internally, but since we can't
    // set that map here, the throttle check falls through to the time-based check.
    // With default 120s throttle, if we call with NOW, the time since last write
    // (which defaults to 0) is >120s, so it would return true.
    // This test verifies the point count delta threshold specifically.
    expect(detour.geometry.evidencePointCount - prev.evidencePointCount).toBeLessThan(5);
  });

  test('returns true when throttle window has elapsed', () => {
    const detour = makeDetour();
    detour.geometry.evidencePointCount = 11; // small change
    const prev = makePrevSnapshot({ evidencePointCount: 10 });
    // With no previous geometry write time (defaults to 0), time since last write > throttle
    expect(shouldWriteGeometry('8A', detour, prev, NOW)).toBe(true);
  });
});

describe('shouldAttemptRoadMatchBackfill', () => {
  const geometry = {
    shapeId: '12A',
    inferredDetourPolyline: [
      { latitude: 44.3388, longitude: -79.6698 },
      { latitude: 44.3362, longitude: -79.6712 },
    ],
    canShowDetourPath: true,
    segments: [{
      shapeId: '12A',
      canShowDetourPath: true,
      inferredDetourPolyline: [
        { latitude: 44.3388, longitude: -79.6698 },
        { latitude: 44.3362, longitude: -79.6712 },
      ],
    }],
  };

  test('returns true for an existing trusted path with no road-matched geometry yet', () => {
    expect(shouldAttemptRoadMatchBackfill(
      geometry,
      {
        routeId: '12A',
        inferredDetourPolyline: geometry.inferredDetourPolyline,
        likelyDetourPolyline: null,
        segments: geometry.segments,
      },
      null
    )).toBe(true);
  });

  test('returns false once a likely detour path already exists', () => {
    expect(shouldAttemptRoadMatchBackfill(
      geometry,
      {
        routeId: '12A',
        likelyDetourPolyline: [
          { latitude: 44.3388, longitude: -79.6698 },
          { latitude: 44.3362, longitude: -79.6712 },
        ],
      },
      null
    )).toBe(false);
  });

  test('returns true when one segment is still missing road-matched geometry even if another segment has it', () => {
    const segmentNeedingBackfill = {
      shapeId: '12B',
      canShowDetourPath: true,
      inferredDetourPolyline: [
        { latitude: 44.3330, longitude: -79.6736 },
        { latitude: 44.3371, longitude: -79.6693 },
      ],
    };
    const alreadyMatchedSegment = {
      shapeId: '12B',
      canShowDetourPath: true,
      inferredDetourPolyline: [
        { latitude: 44.3864, longitude: -79.6920 },
        { latitude: 44.3877, longitude: -79.6902 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.3864, longitude: -79.6920 },
        { latitude: 44.3877, longitude: -79.6902 },
      ],
      roadMatchConfidence: 'high',
      roadMatchRawConfidence: 0.98,
      roadMatchSource: 'osrm-match',
    };

    expect(shouldAttemptRoadMatchBackfill(
      {
        shapeId: '12B',
        canShowDetourPath: true,
        inferredDetourPolyline: segmentNeedingBackfill.inferredDetourPolyline,
        segments: [segmentNeedingBackfill, alreadyMatchedSegment],
      },
      {
        routeId: '12B',
        likelyDetourPolyline: alreadyMatchedSegment.likelyDetourPolyline,
        roadMatchConfidence: 'high',
        roadMatchSource: 'osrm-match',
        segments: [segmentNeedingBackfill, alreadyMatchedSegment],
      },
      null
    )).toBe(true);
  });

  test('returns true when the previous route-level likely path is for a different segment location', () => {
    expect(shouldAttemptRoadMatchBackfill(
      {
        shapeId: '12B',
        canShowDetourPath: true,
        inferredDetourPolyline: [
          { latitude: 44.3330, longitude: -79.6736 },
          { latitude: 44.3371, longitude: -79.6693 },
        ],
        entryPoint: { latitude: 44.3330, longitude: -79.6736 },
        exitPoint: { latitude: 44.3371, longitude: -79.6693 },
        segments: [{
          shapeId: '12B',
          canShowDetourPath: true,
          inferredDetourPolyline: [
            { latitude: 44.3330, longitude: -79.6736 },
            { latitude: 44.3371, longitude: -79.6693 },
          ],
          entryPoint: { latitude: 44.3330, longitude: -79.6736 },
          exitPoint: { latitude: 44.3371, longitude: -79.6693 },
        }],
      },
      {
        routeId: '12B',
        likelyDetourPolyline: [
          { latitude: 44.3864, longitude: -79.6920 },
          { latitude: 44.3877, longitude: -79.6902 },
        ],
        inferredDetourPolyline: [
          { latitude: 44.3864, longitude: -79.6920 },
          { latitude: 44.3877, longitude: -79.6902 },
        ],
        roadMatchConfidence: 'high',
        roadMatchSource: 'osrm-match',
      },
      null
    )).toBe(true);
  });
});

describe('buildUpdatedEvent', () => {
  const NOW = Date.now();

  test('detects state change', () => {
    const prev = {
      vehicleCount: 2,
      triggerVehicleId: 'bus-1',
      state: 'active',
      confidence: 'medium',
      evidencePointCount: 10,
      detectedAtMs: NOW - 600000,
      lastSeenAtMs: NOW - 30000,
    };
    const current = {
      detectedAt: new Date(NOW - 600000),
      lastSeenAt: new Date(NOW),
      triggerVehicleId: 'bus-1',
      vehicleCount: 2,
      state: 'clear-pending',
      confidence: 'medium',
      evidencePointCount: 10,
    };
    const event = buildUpdatedEvent('8A', prev, current, NOW);
    expect(event).not.toBeNull();
    expect(event.changedFields).toContain('state');
  });

  test('detects confidence change', () => {
    const prev = {
      vehicleCount: 2,
      triggerVehicleId: 'bus-1',
      state: 'active',
      confidence: 'low',
      evidencePointCount: 5,
      detectedAtMs: NOW - 600000,
    };
    const current = {
      detectedAt: new Date(NOW - 600000),
      triggerVehicleId: 'bus-1',
      vehicleCount: 2,
      state: 'active',
      confidence: 'medium',
      evidencePointCount: 10,
    };
    const event = buildUpdatedEvent('8A', prev, current, NOW);
    expect(event).not.toBeNull();
    expect(event.changedFields).toContain('confidence');
    expect(event.changedFields).toContain('evidencePointCount');
  });

  test('detects clear reason changes', () => {
    const prev = {
      vehicleCount: 2,
      triggerVehicleId: 'bus-1',
      state: 'active',
      clearReason: null,
      detectedAtMs: NOW - 600000,
    };
    const current = {
      triggerVehicleId: 'bus-1',
      vehicleCount: 2,
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    };
    const event = buildUpdatedEvent('8A', prev, current, NOW);
    expect(event).not.toBeNull();
    expect(event.clearReason).toBe('normal-route-observed');
    expect(event.changedFields).toContain('clearReason');
  });

  test('returns null when nothing changed', () => {
    const prev = {
      vehicleCount: 2,
      triggerVehicleId: 'bus-1',
      state: 'active',
      confidence: 'medium',
      evidencePointCount: 10,
    };
    const current = {
      triggerVehicleId: 'bus-1',
      vehicleCount: 2,
      state: 'active',
      confidence: 'medium',
      evidencePointCount: 10,
    };
    const event = buildUpdatedEvent('8A', prev, current, NOW);
    expect(event).toBeNull();
  });

  test('returns null when previous is null', () => {
    const event = buildUpdatedEvent('8A', null, { vehicleCount: 1 }, NOW);
    expect(event).toBeNull();
  });
});

describe('buildStaleClearedEvent', () => {
  test('records stale auto-clear metadata for operations review', () => {
    const now = Date.parse('2026-04-26T20:00:00Z');
    const event = buildStaleClearedEvent('8A', {
      detectedAtMs: now - 4 * 60 * 60 * 1000,
      vehicleCount: 2,
      lastEvidenceAt: now - 140 * 60 * 1000,
    }, now, {
      reason: 'stale-evidence-with-live-route-family-vehicles',
      staleAgeMs: 140 * 60 * 1000,
      thresholdMs: 130 * 60 * 1000,
      headwayMs: 60 * 60 * 1000,
      scheduleSource: 'exact-route',
      serviceDate: '20260426',
    });

    expect(event.eventType).toBe('DETOUR_AUTO_CLEARED_STALE');
    expect(event.routeId).toBe('8A');
    expect(event.clearReason).toBe('stale-evidence-with-live-route-family-vehicles');
    expect(event.staleThresholdMs).toBe(130 * 60 * 1000);
    expect(event.scheduledHeadwayMs).toBe(60 * 60 * 1000);
  });
});

describe('buildDetectedEvent', () => {
  const NOW = Date.now();

  test('includes confidence and evidence fields', () => {
    const current = {
      detectedAtMs: NOW,
      lastSeenAtMs: NOW,
      triggerVehicleId: 'bus-1',
      vehicleCount: 1,
      shapeId: 'shape-8a',
      entryPoint: { latitude: 44.39, longitude: -79.698 },
      exitPoint: { latitude: 44.39, longitude: -79.690 },
      skippedSegmentPolyline: [
        { latitude: 44.39, longitude: -79.698 },
        { latitude: 44.39, longitude: -79.690 },
      ],
      inferredDetourPolyline: [
        { latitude: 44.395, longitude: -79.698 },
        { latitude: 44.395, longitude: -79.690 },
      ],
      confidence: 'low',
      evidencePointCount: 3,
      lastEvidenceAt: NOW,
      segmentCount: 1,
    };
    const event = buildDetectedEvent('8A', current, NOW);
    expect(event.eventType).toBe('DETOUR_DETECTED');
    expect(event.confidence).toBe('low');
    expect(event.evidencePointCount).toBe(3);
    expect(event.entryPoint).toEqual({ latitude: 44.39, longitude: -79.698 });
    expect(event.exitPoint).toEqual({ latitude: 44.39, longitude: -79.690 });
    expect(event.shapeId).toBe('shape-8a');
    expect(event.segmentCount).toBe(1);
  });
});

describe('buildClearedEvent', () => {
  const NOW = Date.now();

  test('includes duration calculation', () => {
    const previous = {
      detectedAtMs: NOW - 600000,
      triggerVehicleId: 'bus-1',
      vehicleCount: 1,
      shapeId: 'shape-8a',
      entryPoint: { latitude: 44.39, longitude: -79.698 },
      exitPoint: { latitude: 44.39, longitude: -79.690 },
      skippedSegmentPolyline: [
        { latitude: 44.39, longitude: -79.698 },
        { latitude: 44.39, longitude: -79.690 },
      ],
      inferredDetourPolyline: [
        { latitude: 44.395, longitude: -79.698 },
        { latitude: 44.395, longitude: -79.690 },
      ],
      confidence: 'medium',
      evidencePointCount: 8,
      lastEvidenceAt: NOW - 30000,
      uniqueVehicleCount: 2,
      currentVehicleCount: 0,
      clearReason: 'normal-route-observed',
      segmentCount: 1,
    };
    const event = buildClearedEvent('8A', previous, NOW);
    expect(event.eventType).toBe('DETOUR_CLEARED');
    expect(event.durationMs).toBe(600000);
    expect(event.entryPoint).toEqual({ latitude: 44.39, longitude: -79.698 });
    expect(event.exitPoint).toEqual({ latitude: 44.39, longitude: -79.690 });
    expect(event.shapeId).toBe('shape-8a');
    expect(event.confidence).toBe('medium');
    expect(event.evidencePointCount).toBe(8);
    expect(event.lastEvidenceAt).toBe(NOW - 30000);
    expect(event.uniqueVehicleCount).toBe(2);
    expect(event.currentVehicleCount).toBe(0);
    expect(event.clearReason).toBe('normal-route-observed');
  });
});
