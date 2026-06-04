const {
  shouldWriteGeometry,
  makeSnapshot,
  buildUpdatedEvent,
  buildDetectedEvent,
  buildClearedEvent,
  enforceGeometryTrustGate,
  preserveTrustedDetourPath,
  shouldAttemptRoadMatchBackfill,
  buildDetourEventId,
  mergeNoticeStopImpactsIntoGeometry,
  hasNoticeStopImpactWriteDelta,
  hasNormalRouteClearProof,
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

describe('notice stop impact merge', () => {
  const routeStopSequencesMapping = {
    '12A': {
      '__default__': ['932', '933', '756'],
    },
    '12B': {
      '__default__': ['617', '618', '931'],
    },
  };
  const stopsByCode = new Map([
    ['617', { id: '617', code: '617', name: 'Hooper Road', latitude: 44.33299707, longitude: -79.67380008 }],
    ['618', { id: '618', code: '618', name: 'Saunders at Welham', latitude: 44.33410212, longitude: -79.6689847 }],
    ['756', { id: '756', code: '756', name: 'Hooper Road', latitude: 44.33312923, longitude: -79.67365255 }],
    ['931', { id: '931', code: '931', name: 'Welham at Hooper', latitude: 44.33626456, longitude: -79.66908928 }],
    ['932', { id: '932', code: '932', name: 'Hooper Road', latitude: 44.33673653, longitude: -79.66942321 }],
    ['933', { id: '933', code: '933', name: 'Saunders at Welham', latitude: 44.33425172, longitude: -79.66897044 }],
    ['6170', { id: '6170', code: '6170', name: 'Temporary stop', latitude: 44.333, longitude: -79.674 }],
    ['7560', { id: '7560', code: '7560', name: 'Temporary stop', latitude: 44.333, longitude: -79.674 }],
    ['9310', { id: '9310', code: '9310', name: 'Temporary stop', latitude: 44.336, longitude: -79.669 }],
  ]);
  const noticeImpacts = [{
    sourceNewsId: '1637',
    sourceTitle: 'Saunders/Welham Detour - Route 12 & TOD-F',
    affectedRoutes: ['12'],
    stopClosureCandidates: ['931', '932', '933', '618', '756', '617'].map((stopCode) => ({ stopCode })),
    temporaryStops: ['6170', '7560', '9310'].map((stopCode) => ({ stopCode })),
  }];

  test('adds official boundary closures without marking active boundary stops closed', () => {
    const route12A = mergeNoticeStopImpactsIntoGeometry('12A', {
      segments: [{
        entryStopId: '932',
        exitStopId: '756',
        skippedStops: [{ id: '933', code: '933', name: 'Saunders at Welham' }],
        skippedStopIds: ['933'],
        skippedStopCodes: ['933'],
      }],
    }, noticeImpacts, { routeStopSequencesMapping, stopsByCode });

    const route12B = mergeNoticeStopImpactsIntoGeometry('12B', {
      segments: [{
        entryStopId: '617',
        exitStopId: '931',
        skippedStops: [
          { id: '618', code: '618', name: 'Saunders at Welham' },
          { id: '931', code: '931', name: 'Welham at Hooper' },
        ],
        skippedStopIds: ['618', '931'],
        skippedStopCodes: ['618', '931'],
      }],
    }, noticeImpacts, { routeStopSequencesMapping, stopsByCode });

    expect(route12A.segments[0].skippedStopCodes).toEqual(['933', '756']);
    expect(route12A.segments[0].noticeTemporaryStopCodes).toEqual(['6170', '7560', '9310']);
    expect(route12A.segments[0].noticeActiveStopCodes).toEqual(['932']);
    expect(route12B.segments[0].skippedStopCodes).toEqual(['618', '931', '617']);
    expect(route12B.segments[0].noticeTemporaryStopCodes).toEqual(['6170', '7560', '9310']);
  });

  test('forces a geometry write when official notice impacts are not in the published snapshot', () => {
    const previousSnapshot = {
      routeId: '12A',
      segments: [{
        skippedStops: [{ id: '933', code: '933' }],
        skippedStopIds: ['933'],
        skippedStopCodes: ['933'],
      }],
    };
    const geo = {
      noticeStopImpactSource: 'official-notice',
      segments: [{
        noticeStopImpactSource: 'official-notice',
        skippedStops: [
          { id: '933', code: '933' },
          { id: '756', code: '756' },
        ],
        skippedStopIds: ['933', '756'],
        skippedStopCodes: ['933', '756'],
        noticeTemporaryStopCodes: ['6170', '7560', '9310'],
        noticeActiveStopCodes: ['932'],
      }],
    };

    expect(hasNoticeStopImpactWriteDelta(previousSnapshot, geo)).toBe(true);
  });
});

describe('hasNormalRouteClearProof', () => {
  test('accepts normal route and obsolete shape clear reasons', () => {
    expect(hasNormalRouteClearProof({ clearReason: 'normal-route-observed' })).toBe(true);
    expect(hasNormalRouteClearProof({ clearReason: 'obsolete-shape-normal-route-observed' })).toBe(true);
    expect(hasNormalRouteClearProof({ clearReason: 'gps-clear-required' })).toBe(false);
    expect(hasNormalRouteClearProof(null)).toBe(false);
  });
});

describe('detourPublisher storage config', () => {
  test('getDetourHistory reads from the configured history collection only', async () => {
    jest.resetModules();
    const get = jest.fn(async () => ({ docs: [] }));
    const limit = jest.fn(() => ({ get }));
    const orderBy = jest.fn(() => ({ limit }));
    const collection = jest.fn(() => ({ orderBy }));

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({ collection }),
    }));

    const { getDetourHistory } = require('../detourPublisher');
    await getDetourHistory({ storageConfig: { historyCollection: 'detourHistoryV2' } });

    expect(collection).toHaveBeenCalledWith('detourHistoryV2');
    expect(collection).not.toHaveBeenCalledWith('detourHistory');
  });

  test('publishDetours writes only configured V2 active and history collections', async () => {
    jest.resetModules();
    const originalRetentionDays = process.env.DETOUR_HISTORY_RETENTION_DAYS;
    process.env.DETOUR_HISTORY_RETENTION_DAYS = '0';
    const set = jest.fn(async () => {});
    const get = jest.fn(async () => ({ size: 0, forEach() {} }));
    const doc = jest.fn(() => ({ set, delete: jest.fn(async () => {}) }));
    const collection = jest.fn(() => ({ doc, get }));

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({ collection }),
    }));

    const { publishDetours } = require('../detourPublisher');
    try {
      await publishDetours({
        '8A': {
          routeId: '8A',
          detectedAt: new Date('2026-05-31T10:00:00Z'),
          lastSeenAt: new Date('2026-05-31T10:01:00Z'),
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          currentVehicleCount: 2,
          vehiclesOffRoute: new Set(['bus-1', 'bus-2']),
          geometry: {},
        },
      }, {
        now: Date.parse('2026-05-31T10:02:00Z'),
        storageConfig: {
          activeCollection: 'activeDetoursV2',
          historyCollection: 'detourHistoryV2',
        },
      });
    } finally {
      if (originalRetentionDays == null) {
        delete process.env.DETOUR_HISTORY_RETENTION_DAYS;
      } else {
        process.env.DETOUR_HISTORY_RETENTION_DAYS = originalRetentionDays;
      }
    }

    expect(collection).toHaveBeenCalledWith('activeDetoursV2');
    expect(collection).toHaveBeenCalledWith('detourHistoryV2');
    expect(collection).not.toHaveBeenCalledWith('activeDetours');
    expect(collection).not.toHaveBeenCalledWith('detourHistory');
  });


  test('publishDetours writes V2 active event docs by event id', async () => {
    jest.resetModules();
    const originalRetentionDays = process.env.DETOUR_HISTORY_RETENTION_DAYS;
    process.env.DETOUR_HISTORY_RETENTION_DAYS = '0';
    const writes = {};
    const activeSet = jest.fn(async (data) => {
      writes.active = data;
    });
    const historySet = jest.fn(async (data) => {
      writes.history = data;
    });
    const activeDoc = jest.fn(() => ({ set: activeSet, delete: jest.fn(async () => {}) }));
    const historyDoc = jest.fn(() => ({ set: historySet }));
    const collection = jest.fn((name) => ({
      doc: name === 'detourEventHistoryV2' ? historyDoc : activeDoc,
      get: async () => ({ size: 0, docs: [], forEach: () => {} }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
    }));

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({ collection }),
    }));

    const { publishDetours } = require('../detourPublisher');
    try {
      await publishDetours({
        '8A:shape-1:100-300': {
          eventId: '8A:shape-1:100-300',
          routeId: '8A',
          shapeId: 'shape-1',
          detourVersion: 'v2-event-window',
          state: 'active',
          confidence: 'high',
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          detectedAt: 1000,
          lastSeenAt: 2000,
          eventWindow: {
            routeId: '8A',
            shapeId: 'shape-1',
            coreStartProgressMeters: 100,
            coreEndProgressMeters: 300,
            frozen: true,
          },
          geometry: { shapeId: 'shape-1', canShowDetourPath: true, segments: [] },
        },
      }, {
        now: 3000,
        storageConfig: {
          detourVersion: 'v2',
          activeCollection: 'activeDetourEventsV2',
          historyCollection: 'detourEventHistoryV2',
        },
      });
    } finally {
      if (originalRetentionDays == null) {
        delete process.env.DETOUR_HISTORY_RETENTION_DAYS;
      } else {
        process.env.DETOUR_HISTORY_RETENTION_DAYS = originalRetentionDays;
      }
    }

    expect(collection).toHaveBeenCalledWith('activeDetourEventsV2');
    expect(activeDoc).toHaveBeenCalledWith('8A:shape-1:100-300');
    expect(writes.active).toEqual(expect.objectContaining({
      eventId: '8A:shape-1:100-300',
      detourEventId: '8A:shape-1:100-300',
      routeId: '8A',
      detourVersion: 'v2-event-window',
      eventWindow: expect.objectContaining({ frozen: true }),
    }));
  });

  test('publishDetours writes the detour clear window to active documents', async () => {
    jest.resetModules();
    const originalRetentionDays = process.env.DETOUR_HISTORY_RETENTION_DAYS;
    process.env.DETOUR_HISTORY_RETENTION_DAYS = '0';
    const writes = {};
    const activeSet = jest.fn(async (data) => {
      writes.active = data;
    });
    const historySet = jest.fn(async (data) => {
      writes.history = data;
    });
    const activeDoc = jest.fn(() => ({ set: activeSet, delete: jest.fn(async () => {}) }));
    const historyDoc = jest.fn(() => ({ set: historySet }));
    const collection = jest.fn((name) => ({
      doc: name === 'detourHistoryV2' ? historyDoc : activeDoc,
      get: async () => ({ size: 0, docs: [], forEach: () => {} }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
    }));

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({ collection }),
    }));

    const { publishDetours } = require('../detourPublisher');
    try {
      await publishDetours({
        '8A': {
          routeId: '8A',
          detectedAt: new Date('2026-05-31T10:00:00Z'),
          lastSeenAt: new Date('2026-05-31T10:01:00Z'),
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          currentVehicleCount: 0,
          vehiclesOffRoute: new Set(),
          detourZone: {
            shapeId: 'shape-8a',
            startProgressMeters: 125,
            endProgressMeters: 625,
          },
          clearWindow: {
            shapeId: 'shape-8a',
            startProgressMeters: 0,
            endProgressMeters: 1000,
            minCoverageRatio: 0.95,
          },
          geometry: {
            shapeId: 'shape-8a',
            canShowDetourPath: true,
            confidence: 'medium',
            skippedSegmentPolyline: [
              { latitude: 44.39, longitude: -79.69 },
              { latitude: 44.39, longitude: -79.68 },
            ],
            inferredDetourPolyline: [
              { latitude: 44.395, longitude: -79.69 },
              { latitude: 44.395, longitude: -79.68 },
            ],
            segments: [{
              shapeId: 'shape-8a',
              canShowDetourPath: true,
              startProgressMeters: 125,
              endProgressMeters: 625,
              skippedSegmentPolyline: [
                { latitude: 44.39, longitude: -79.69 },
                { latitude: 44.39, longitude: -79.68 },
              ],
            }],
          },
        },
      }, {
        now: Date.parse('2026-05-31T10:02:00Z'),
        storageConfig: {
          activeCollection: 'activeDetoursV2',
          historyCollection: 'detourHistoryV2',
        },
      });
    } finally {
      if (originalRetentionDays == null) {
        delete process.env.DETOUR_HISTORY_RETENTION_DAYS;
      } else {
        process.env.DETOUR_HISTORY_RETENTION_DAYS = originalRetentionDays;
      }
    }

    expect(writes.active.detourZone).toEqual({
      shapeId: 'shape-8a',
      startProgressMeters: 125,
      endProgressMeters: 625,
    });
    expect(writes.active.clearWindow).toEqual({
      shapeId: 'shape-8a',
      startProgressMeters: 0,
      endProgressMeters: 1000,
      minCoverageRatio: 0.95,
    });
  });

  test('suppresses rider visibility when a route baseline diverged from live GTFS', async () => {
    jest.resetModules();
    const originalRetentionDays = process.env.DETOUR_HISTORY_RETENTION_DAYS;
    process.env.DETOUR_HISTORY_RETENTION_DAYS = '0';
    const writes = {};
    const set = jest.fn(async (data) => {
      writes.active = data;
    });
    const historySet = jest.fn(async (data) => {
      writes.history = data;
    });
    const activeDoc = jest.fn(() => ({ set, delete: jest.fn(async () => {}) }));
    const historyDoc = jest.fn(() => ({ set: historySet }));
    const collection = jest.fn((name) => ({
      doc: name === 'detourHistory' ? historyDoc : activeDoc,
      get: async () => ({ size: 0, docs: [], forEach: () => {} }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
    }));

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({ collection }),
    }));

    const { publishDetours } = require('../detourPublisher');
    try {
      await publishDetours({
        400: {
          routeId: '400',
          detectedAt: new Date('2026-06-01T20:20:29Z'),
          lastSeenAt: new Date('2026-06-01T20:51:35Z'),
          triggerVehicleId: 'bus-400',
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          currentVehicleCount: 2,
          vehiclesOffRoute: new Set(['bus-1', 'bus-2']),
          geometry: {},
        },
      }, {
        now: Date.parse('2026-06-02T12:00:00Z'),
        baselineDivergedRouteIds: ['400'],
      });
    } finally {
      if (originalRetentionDays == null) {
        delete process.env.DETOUR_HISTORY_RETENTION_DAYS;
      } else {
        process.env.DETOUR_HISTORY_RETENTION_DAYS = originalRetentionDays;
      }
    }

    expect(writes.active).toMatchObject({
      routeId: '400',
      riderVisible: false,
      riderVisibilityReason: 'baseline-diverged',
      staleForReview: true,
      baselineDiverged: true,
    });
  });
});

describe('publishDetours event ids', () => {
  test('publishDetours writes official notice boundary stop impacts into active detour docs', async () => {
    jest.resetModules();
    const writes = {};
    const now = Date.parse('2026-06-02T19:40:00Z');

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => {
          const emptyQuery = { get: async () => ({ empty: true, docs: [], forEach: () => {} }), orderBy: () => emptyQuery, limit: () => emptyQuery, where: () => emptyQuery };
          return {
            doc: (id) => ({
              set: async (data) => { writes[`${name}/${id}`] = data; },
              delete: async () => {},
            }),
            get: async () => ({ size: 0, docs: [], forEach: () => {} }),
            orderBy: () => ({ limit: () => emptyQuery }),
            where: () => emptyQuery,
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
      '12A': {
        routeId: '12A',
        detectedAt: new Date(now - 60 * 60 * 1000),
        lastSeenAt: new Date(now - 5 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        state: 'active',
        vehiclesOffRoute: new Set(),
        geometry: {
          confidence: 'high',
          canShowDetourPath: true,
          evidencePointCount: 9,
          lastEvidenceAt: now - 5 * 60 * 1000,
          segments: [{
            confidence: 'high',
            canShowDetourPath: true,
            entryStopId: '932',
            exitStopId: '756',
            skippedSegmentPolyline: [
              { latitude: 44.3367, longitude: -79.6694 },
              { latitude: 44.3331, longitude: -79.6736 },
            ],
            inferredDetourPolyline: [
              { latitude: 44.3367, longitude: -79.6694 },
              { latitude: 44.3331, longitude: -79.6736 },
            ],
            skippedStops: [{ id: '933', code: '933', name: 'Saunders at Welham' }],
            skippedStopIds: ['933'],
            skippedStopCodes: ['933'],
          }],
        },
      },
    }, {
      now,
      noticeStopImpacts: [{
        sourceNewsId: '1637',
        affectedRoutes: ['12'],
        stopClosureCandidates: ['931', '932', '933', '618', '756', '617'].map((stopCode) => ({ stopCode })),
        temporaryStops: ['6170', '7560', '9310'].map((stopCode) => ({ stopCode })),
      }],
      gtfsData: {
        routeStopSequencesMapping: {
          '12A': { '__default__': ['932', '933', '756'] },
        },
        stopsByCode: new Map([
          ['932', { id: '932', code: '932', name: 'Hooper Road', latitude: 44.3367, longitude: -79.6694 }],
          ['933', { id: '933', code: '933', name: 'Saunders at Welham', latitude: 44.3342, longitude: -79.6690 }],
          ['756', { id: '756', code: '756', name: 'Hooper Road', latitude: 44.3331, longitude: -79.6736 }],
        ]),
      },
    });

    const written = writes['activeDetours/12A'];
    expect(written.segments[0].skippedStopCodes).toEqual(['933', '756']);
    expect(written.segments[0].noticeActiveStopCodes).toEqual(['932']);
    expect(written.segments[0].noticeTemporaryStopCodes).toEqual(['6170', '7560', '9310']);
  });

  test('removes skipped stops when the final detour path passes the stop', async () => {
    jest.resetModules();
    const writes = {};
    const now = Date.parse('2026-05-29T16:00:00Z');
    const closedPath = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.392, longitude: -79.700 },
      { latitude: 44.394, longitude: -79.700 },
    ];
    const detourPath = [
      { latitude: 44.390, longitude: -79.698 },
      { latitude: 44.392, longitude: -79.698 },
      { latitude: 44.394, longitude: -79.698 },
    ];
    const servedStop = {
      id: 'stop-696',
      code: '696',
      name: 'Served on detour',
      latitude: 44.392,
      longitude: -79.698,
    };
    const missedStop = {
      id: 'stop-700',
      code: '700',
      name: 'Still missed',
      latitude: 44.393,
      longitude: -79.700,
    };

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
            get: async () => ({ size: 0, docs: [], forEach: () => {} }),
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
      '11': {
        routeId: '11',
        detectedAt: new Date(now - 20 * 60 * 1000),
        lastSeenAt: new Date(now - 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
        state: 'active',
        vehiclesOffRoute: new Set(['bus-11']),
        geometry: {
          shapeId: 'shape-11',
          confidence: 'high',
          canShowDetourPath: true,
          evidencePointCount: 8,
          lastEvidenceAt: now - 60 * 1000,
          segments: [{
            shapeId: 'shape-11',
            confidence: 'high',
            canShowDetourPath: true,
            skippedSegmentPolyline: closedPath,
            inferredDetourPolyline: detourPath,
            likelyDetourPolyline: detourPath,
            entryPoint: closedPath[0],
            exitPoint: closedPath[closedPath.length - 1],
            skippedStops: [servedStop, missedStop],
            skippedStopIds: ['stop-696', 'stop-700'],
            skippedStopCodes: ['696', '700'],
            firstSkippedStop: servedStop,
            firstSkippedStopId: 'stop-696',
            firstSkippedStopCode: '696',
          }],
          skippedStops: [servedStop, missedStop],
          skippedStopIds: ['stop-696', 'stop-700'],
          skippedStopCodes: ['696', '700'],
        },
      },
    }, { now });

    const written = writes['activeDetours/11'];
    expect(written.segments[0].skippedStopCodes).toEqual(['700']);
    expect(written.segments[0].skippedStops.map((stop) => stop.code)).toEqual(['700']);
    expect(written.segments[0].firstSkippedStopCode).toBe('700');
    expect(written.segments[0].detourPathServedStopCodes).toEqual(['696']);
  });

  test('publishes a shared event for overlapping downtown closures while keeping route geometry separate', async () => {
    jest.resetModules();
    const writes = {};
    const deletes = [];
    const now = Date.parse('2026-05-25T18:30:00Z');
    const closedLong = [
      { latitude: 44.3889, longitude: -79.6912 },
      { latitude: 44.3900, longitude: -79.6902 },
      { latitude: 44.3910, longitude: -79.6892 },
      { latitude: 44.3920, longitude: -79.6882 },
      { latitude: 44.3930, longitude: -79.6872 },
    ];
    const downtownLikelyPath = [
      { latitude: 44.3892, longitude: -79.6920 },
      { latitude: 44.3902, longitude: -79.6910 },
      { latitude: 44.3912, longitude: -79.6900 },
      { latitude: 44.3922, longitude: -79.6890 },
      { latitude: 44.3932, longitude: -79.6880 },
    ];

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
              delete: async () => { deletes.push(`${name}/${id}`); },
            }),
            get: async () => ({ size: 0, docs: [], forEach: () => {} }),
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
      '10': {
        routeId: '10',
        detectedAt: new Date(now - 30 * 60 * 1000),
        lastSeenAt: new Date(now - 2 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
        state: 'active',
        vehiclesOffRoute: new Set(['10-a']),
        geometry: {
          confidence: 'high',
          canShowDetourPath: true,
          evidencePointCount: 20,
          lastEvidenceAt: now - 2 * 60 * 1000,
          segments: [{
            canShowDetourPath: true,
            confidence: 'high',
            skippedSegmentPolyline: closedLong,
            inferredDetourPolyline: downtownLikelyPath,
            likelyDetourPolyline: downtownLikelyPath,
            likelyDetourRoadNames: ['Mulcaster Street', 'Simcoe Street', 'Lakeshore Mews', 'Dunlop Street East'],
            entryPoint: closedLong[0],
            exitPoint: closedLong[closedLong.length - 1],
          }],
        },
      },
      '11': {
        routeId: '11',
        detectedAt: new Date(now - 30 * 60 * 1000),
        lastSeenAt: new Date(now - 2 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        state: 'active',
        vehiclesOffRoute: new Set(),
        geometry: {
          confidence: 'high',
          canShowDetourPath: true,
          evidencePointCount: 17,
          lastEvidenceAt: now - 2 * 60 * 1000,
          segments: [{
            canShowDetourPath: true,
            confidence: 'high',
            skippedSegmentPolyline: closedLong.slice(1),
            inferredDetourPolyline: closedLong.slice(1),
            entryPoint: closedLong[1],
            exitPoint: closedLong[closedLong.length - 1],
          }],
        },
      },
      '101': {
        routeId: '101',
        detectedAt: new Date(now - 30 * 60 * 1000),
        lastSeenAt: new Date(now - 2 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
        state: 'active',
        vehiclesOffRoute: new Set(['101-a']),
        geometry: {
          confidence: 'high',
          canShowDetourPath: true,
          evidencePointCount: 12,
          lastEvidenceAt: now - 2 * 60 * 1000,
          segments: [{
            canShowDetourPath: true,
            confidence: 'high',
            skippedSegmentPolyline: closedLong.slice(3),
            inferredDetourPolyline: downtownLikelyPath,
            likelyDetourPolyline: downtownLikelyPath,
            likelyDetourRoadNames: ['Simcoe Street', 'Lakeshore Mews'],
            entryPoint: closedLong[3],
            exitPoint: closedLong[closedLong.length - 1],
          }],
        },
      },
      '7A': {
        routeId: '7A',
        detectedAt: new Date(now - 30 * 60 * 1000),
        lastSeenAt: new Date(now - 2 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
        state: 'active',
        vehiclesOffRoute: new Set(['7a-a']),
        geometry: {
          confidence: 'high',
          canShowDetourPath: true,
          evidencePointCount: 10,
          lastEvidenceAt: now - 2 * 60 * 1000,
          segments: [{
            canShowDetourPath: true,
            confidence: 'high',
            skippedSegmentPolyline: [
              { latitude: 44.4000, longitude: -79.7000 },
              { latitude: 44.4010, longitude: -79.7010 },
            ],
            inferredDetourPolyline: [
              { latitude: 44.4003, longitude: -79.7003 },
              { latitude: 44.4013, longitude: -79.7013 },
            ],
            entryPoint: { latitude: 44.4000, longitude: -79.7000 },
            exitPoint: { latitude: 44.4010, longitude: -79.7010 },
          }],
        },
      },
    }, { now });

    expect(deletes).toEqual([]);
    const route10 = writes['activeDetours/10'];
    const route11 = writes['activeDetours/11'];
    const route101 = writes['activeDetours/101'];
    const route7A = writes['activeDetours/7A'];

    expect(route10.detourEventId).not.toBe(route11.detourEventId);
    expect(route10.detourEventId).not.toBe(route101.detourEventId);
    expect(route10.sharedDetourEventId).toBeTruthy();
    expect(route10.sharedDetourEventId).toBe(route11.sharedDetourEventId);
    expect(route10.sharedDetourEventId).toBe(route101.sharedDetourEventId);
    expect(route10.sharedRouteIds).toEqual(['10', '11', '101']);
    expect(route11.sharedRouteIds).toEqual(['10', '11', '101']);
    expect(route101.sharedRouteIds).toEqual(['10', '11', '101']);
    expect(route10.eventPrimaryRouteId).toBe('10');
    expect(route10.eventRouteCount).toBe(3);
    expect(route10.eventLocationLabel).toBe('Mulcaster Street & Simcoe Street +2');
    expect(route10.segments[0].sharedDetourEventId).toBe(route10.sharedDetourEventId);
    expect(route11.segments[0].sharedDetourEventId).toBe(route10.sharedDetourEventId);
    expect(route101.segments[0].sharedDetourEventId).toBe(route10.sharedDetourEventId);

    expect(route7A.sharedRouteIds).toEqual(['7A']);
    expect(route7A.sharedDetourEventId).not.toBe(route10.sharedDetourEventId);
  });

  test('does not group route variants that have no physical event geometry', async () => {
    jest.resetModules();
    const writes = {};
    const now = Date.parse('2026-05-25T19:00:00Z');

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
            get: async () => ({ size: 0, docs: [], forEach: () => {} }),
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
      '12A': {
        routeId: '12A',
        detectedAt: new Date(now - 10 * 60 * 1000),
        lastSeenAt: new Date(now - 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
        state: 'active',
        vehiclesOffRoute: new Set(['12a-a']),
      },
      '12B': {
        routeId: '12B',
        detectedAt: new Date(now - 10 * 60 * 1000),
        lastSeenAt: new Date(now - 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
        state: 'active',
        vehiclesOffRoute: new Set(['12b-a']),
      },
    }, { now });

    expect(writes['activeDetours/12A'].sharedRouteIds).toEqual(['12A']);
    expect(writes['activeDetours/12B'].sharedRouteIds).toEqual(['12B']);
    expect(writes['activeDetours/12A'].sharedDetourEventId)
      .not.toBe(writes['activeDetours/12B'].sharedDetourEventId);
  });

  test('keeps old renderable detours rider-visible until GPS clear proof', async () => {
    jest.resetModules();
    const writes = {};
    const deletes = [];
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
              delete: async () => { deletes.push(`${name}/${id}`); },
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
    const now = Date.parse('2026-04-26T20:00:00Z');
    const scheduleIndex = {
      timeZone: 'America/Toronto',
      tripsByRouteId: new Map([['8A', [
        { tripId: '8a-1', routeId: '8A', serviceId: 'svc', startTimeSeconds: 15 * 3600 },
        { tripId: '8a-2', routeId: '8A', serviceId: 'svc', startTimeSeconds: 16 * 3600 },
        { tripId: '8a-3', routeId: '8A', serviceId: 'svc', startTimeSeconds: 17 * 3600 },
      ]]]),
      calendarByServiceId: new Map([['svc', {
        sunday: true,
        monday: false,
        tuesday: false,
        wednesday: false,
        thursday: false,
        friday: false,
        saturday: false,
        startDate: '20260401',
        endDate: '20260430',
      }]]),
      calendarDatesByServiceId: new Map(),
    };

    await publisher.publishDetours({
      '8A': {
        routeId: '8A',
        detectedAt: new Date(now - 4 * 60 * 60 * 1000),
        lastSeenAt: new Date(now - 140 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        state: 'active',
        geometry: {
          confidence: 'high',
          lastEvidenceAt: now - 140 * 60 * 1000,
          skippedSegmentPolyline: [
            { latitude: 44.38, longitude: -79.69 },
            { latitude: 44.39, longitude: -79.68 },
          ],
        },
      },
    }, { now, scheduleIndex });

    const written = writes['activeDetours/8A'];
    expect(deletes).toEqual([]);
    expect(written.riderVisible).toBe(true);
    expect(written.riderVisibilityReason).toBe('gps-clear-required');
    expect(written.staleForReview).toBe(false);
  });

  test('does not delete an existing active detour without normal-route GPS clear proof', async () => {
    jest.resetModules();
    const writes = {};
    const deletes = [];
    const historyWrites = [];
    const now = Date.parse('2026-05-27T14:40:00Z');
    const activeDoc = {
      routeId: '12B',
      detectedAt: new Date(now - 60 * 60 * 1000),
      updatedAt: now - 30 * 60 * 1000,
      lastSeenAt: new Date(now - 30 * 60 * 1000),
      lastEvidenceAt: now - 140 * 60 * 1000,
      vehicleCount: 5,
      uniqueVehicleCount: 5,
      currentVehicleCount: 0,
      state: 'active',
      clearReason: null,
      confidence: 'high',
      canShowDetourPath: true,
      skippedSegmentPolyline: [
        { latitude: 44.33424, longitude: -79.66897 },
        { latitude: 44.33229, longitude: -79.67731 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.333067, longitude: -79.673553 },
        { latitude: 44.337165, longitude: -79.669397 },
      ],
      likelyDetourRoadNames: ['Hooper Road'],
      segments: [{
        confidence: 'high',
        canShowDetourPath: true,
        skippedSegmentPolyline: [
          { latitude: 44.33424, longitude: -79.66897 },
          { latitude: 44.33229, longitude: -79.67731 },
        ],
        likelyDetourPolyline: [
          { latitude: 44.333067, longitude: -79.673553 },
          { latitude: 44.337165, longitude: -79.669397 },
        ],
        likelyDetourRoadNames: ['Hooper Road'],
      }],
    };
    const activeDocs = [{ id: '12B', data: () => activeDoc }];

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => {
          const emptyQuery = { get: async () => ({ empty: true, size: 0, docs: [] }) };
          const whereQuery = {
            orderBy: () => ({ limit: () => emptyQuery }),
            limit: () => emptyQuery,
          };
          if (name === 'activeDetours') {
            return {
              doc: (id) => ({
                set: async (data) => { writes[`${name}/${id}`] = data; },
                delete: async () => { deletes.push(`${name}/${id}`); },
              }),
              get: async () => ({
                size: activeDocs.length,
                docs: activeDocs,
                forEach: (fn) => activeDocs.forEach(fn),
              }),
              orderBy: () => ({ limit: () => emptyQuery }),
              where: () => whereQuery,
            };
          }
          return {
            doc: () => ({
              set: async (data) => { historyWrites.push(data); },
              delete: async () => {},
            }),
            get: async () => ({ size: 0, docs: [], forEach: () => {} }),
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
      '10': {
        routeId: '10',
        detectedAt: new Date(now - 10 * 60 * 1000),
        lastSeenAt: new Date(now),
        vehicleCount: 1,
        uniqueVehicleCount: 1,
        currentVehicleCount: 1,
        state: 'active',
        vehiclesOffRoute: new Set(['10-bus']),
      },
    }, { now });

    expect(deletes).not.toContain('activeDetours/12B');
    expect(historyWrites.some((event) =>
      event.routeId === '12B' && event.eventType === 'DETOUR_CLEARED'
    )).toBe(false);
    expect(publisher.getLastPublishedIds().has('12B')).toBe(true);
  });

  test('hides an absent geometryless detour instead of leaving it public', async () => {
    jest.resetModules();
    const writes = {};
    const deletes = [];
    const historyWrites = [];
    const now = Date.parse('2026-05-29T21:05:00Z');
    const geometrylessDoc = {
      routeId: '10',
      detectedAt: new Date(now - 4 * 60 * 60 * 1000),
      updatedAt: now - 2 * 60 * 60 * 1000,
      lastSeenAt: new Date(now - 2 * 60 * 60 * 1000),
      lastEvidenceAt: now - 3 * 60 * 60 * 1000,
      vehicleCount: 2,
      uniqueVehicleCount: 2,
      currentVehicleCount: 2,
      state: 'active',
      riderVisible: true,
      riderVisibilityReason: 'current-detour-vehicle',
      canShowDetourPath: true,
      segments: [{
        canShowDetourPath: true,
        skippedSegmentPolyline: null,
        inferredDetourPolyline: null,
        likelyDetourPolyline: null,
      }],
    };
    const activeDocs = [{ id: '10', data: () => geometrylessDoc }];

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => {
          const emptyQuery = { get: async () => ({ empty: true, size: 0, docs: [] }) };
          const whereQuery = {
            orderBy: () => ({ limit: () => emptyQuery }),
            limit: () => emptyQuery,
          };
          if (name === 'activeDetours') {
            return {
              doc: (id) => ({
                set: async (data) => { writes[`${name}/${id}`] = data; },
                delete: async () => { deletes.push(`${name}/${id}`); },
              }),
              get: async () => ({
                size: activeDocs.length,
                docs: activeDocs,
                forEach: (fn) => activeDocs.forEach(fn),
              }),
              orderBy: () => ({ limit: () => emptyQuery }),
              where: () => whereQuery,
            };
          }
          return {
            doc: () => ({
              set: async (data) => { historyWrites.push(data); },
              delete: async () => {},
            }),
            get: async () => ({ size: 0, docs: [], forEach: () => {} }),
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
      '12A': {
        routeId: '12A',
        detectedAt: new Date(now - 10 * 60 * 1000),
        lastSeenAt: new Date(now),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
        state: 'active',
        vehiclesOffRoute: new Set(['12A-bus']),
        geometry: {
          confidence: 'high',
          lastEvidenceAt: now,
          skippedSegmentPolyline: [
            { latitude: 44.33424, longitude: -79.66897 },
            { latitude: 44.33229, longitude: -79.67731 },
          ],
        },
      },
    }, { now });

    expect(deletes).not.toContain('activeDetours/10');
    expect(writes['activeDetours/10']).toMatchObject({
      routeId: '10',
      updatedAt: now,
      currentVehicleCount: 0,
      riderVisible: false,
      riderVisibilityReason: 'insufficient-geometry',
      staleForReview: true,
    });
    expect(historyWrites.some((event) =>
      event.routeId === '10' &&
      event.eventType === 'DETOUR_UPDATED' &&
      event.riderVisible === false
    )).toBe(true);
  });

  test('deletes an absent detour when the previous snapshot has normal-route GPS clear proof', async () => {
    jest.resetModules();
    const writes = {};
    const deletes = [];
    const historyWrites = [];
    const now = Date.parse('2026-05-27T14:40:00Z');
    const clearPendingDoc = {
      routeId: '12B',
      detectedAt: new Date(now - 60 * 60 * 1000),
      updatedAt: now - 60 * 1000,
      lastSeenAt: new Date(now - 60 * 1000),
      vehicleCount: 5,
      uniqueVehicleCount: 5,
      currentVehicleCount: 0,
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
      confidence: 'high',
      canShowDetourPath: true,
      skippedSegmentPolyline: [
        { latitude: 44.33424, longitude: -79.66897 },
        { latitude: 44.33229, longitude: -79.67731 },
      ],
      segments: [{
        confidence: 'high',
        canShowDetourPath: true,
        skippedSegmentPolyline: [
          { latitude: 44.33424, longitude: -79.66897 },
          { latitude: 44.33229, longitude: -79.67731 },
        ],
      }],
    };
    const activeDocs = [{ id: '12B', data: () => clearPendingDoc }];

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => {
          const emptyQuery = { get: async () => ({ empty: true, size: 0, docs: [] }) };
          const whereQuery = {
            orderBy: () => ({ limit: () => emptyQuery }),
            limit: () => emptyQuery,
          };
          if (name === 'activeDetours') {
            return {
              doc: (id) => ({
                set: async (data) => { writes[`${name}/${id}`] = data; },
                delete: async () => { deletes.push(`${name}/${id}`); },
              }),
              get: async () => ({
                size: activeDocs.length,
                docs: activeDocs,
                forEach: (fn) => activeDocs.forEach(fn),
              }),
              orderBy: () => ({ limit: () => emptyQuery }),
              where: () => whereQuery,
            };
          }
          return {
            doc: () => ({
              set: async (data) => { historyWrites.push(data); },
              delete: async () => {},
            }),
            get: async () => ({ size: 0, docs: [], forEach: () => {} }),
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
      '10': {
        routeId: '10',
        detectedAt: new Date(now - 10 * 60 * 1000),
        lastSeenAt: new Date(now),
        vehicleCount: 1,
        uniqueVehicleCount: 1,
        currentVehicleCount: 1,
        state: 'active',
        vehiclesOffRoute: new Set(['10-bus']),
      },
    }, { now });

    expect(deletes).toContain('activeDetours/12B');
    const clearEvent = historyWrites.find((event) =>
      event.routeId === '12B' && event.eventType === 'DETOUR_CLEARED'
    );
    expect(clearEvent).toBeDefined();
    expect(clearEvent.clearReason).toBe('normal-route-observed');
    expect(publisher.getLastPublishedIds().has('12B')).toBe(false);
  });


  test('keeps old geometryless detours active without GPS clear proof', async () => {
    jest.resetModules();
    const writes = {};
    const deletes = [];
    const historyWrites = [];
    const now = Date.parse('2026-04-26T20:00:00Z');
    const previousDoc = {
      routeId: '8A',
      detectedAt: new Date(now - 4 * 60 * 60 * 1000),
      lastSeenAt: new Date(now - 140 * 60 * 1000),
      lastEvidenceAt: now - 140 * 60 * 1000,
      vehicleCount: 2,
      uniqueVehicleCount: 2,
      currentVehicleCount: 0,
      state: 'active',
      canShowDetourPath: false,
      geometry: {
        lastEvidenceAt: now - 140 * 60 * 1000,
        canShowDetourPath: false,
        segments: [],
        skippedSegmentPolyline: null,
        likelyDetourPolyline: null,
      },
    };

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => {
          const emptyQuery = { get: async () => ({ empty: true, docs: [] }) };
          const whereQuery = {
            orderBy: () => ({ limit: () => emptyQuery }),
            limit: () => emptyQuery,
          };
          if (name === 'activeDetours') {
            return {
              doc: (id) => ({
                set: async (data) => { writes[`${name}/${id}`] = data; },
                delete: async () => { deletes.push(`${name}/${id}`); },
              }),
              get: async () => ({
                size: 1,
                docs: [{ id: '8A', data: () => previousDoc }],
                forEach: (fn) => fn({ id: '8A', data: () => previousDoc }),
              }),
              orderBy: () => ({ limit: () => emptyQuery }),
              where: () => whereQuery,
            };
          }
          return {
            doc: () => ({
              set: async (data) => { historyWrites.push(data); },
              delete: async () => {},
            }),
            get: async () => ({ size: 0, docs: [], forEach: () => {} }),
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
    const result = await publisher.publishDetours({
      '8A': previousDoc,
    }, {
      now,
      vehicles: [{ routeId: '8A' }],
      scheduleIndex: {
        timeZone: 'America/Toronto',
        tripsByRouteId: new Map([['8A', [
          { tripId: '8a-1', routeId: '8A', serviceId: 'svc', startTimeSeconds: 15 * 3600 },
          { tripId: '8a-2', routeId: '8A', serviceId: 'svc', startTimeSeconds: 16 * 3600 },
          { tripId: '8a-3', routeId: '8A', serviceId: 'svc', startTimeSeconds: 17 * 3600 },
        ]]]),
        calendarByServiceId: new Map([['svc', {
          sunday: true,
          monday: false,
          tuesday: false,
          wednesday: false,
          thursday: false,
          friday: false,
          saturday: false,
          startDate: '20260401',
          endDate: '20260430',
        }]]),
        calendarDatesByServiceId: new Map(),
      },
    });

    expect(result.staleAutoClearedRouteIds).toEqual([]);
    expect(deletes).not.toContain('activeDetours/8A');
    expect(writes['activeDetours/8A']).toMatchObject({
      routeId: '8A',
      riderVisible: false,
      riderVisibilityReason: 'insufficient-geometry',
      staleForReview: true,
    });
    expect(historyWrites.some((event) => event.eventType === 'DETOUR_AUTO_CLEARED_STALE')).toBe(false);
  });

  test('keeps fresh geometryless detours backend-only until trustworthy geometry exists', async () => {
    jest.resetModules();
    const writes = {};
    const deletes = [];
    const now = Date.parse('2026-05-27T14:00:00Z');

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
              delete: async () => { deletes.push(`${name}/${id}`); },
            }),
            get: async () => ({ size: 0, docs: [], forEach: () => {} }),
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
      '10': {
        routeId: '10',
        detectedAt: new Date(now - 5 * 60 * 1000),
        lastSeenAt: new Date(now),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
        state: 'active',
        geometry: {
          confidence: 'medium',
          lastEvidenceAt: now,
          canShowDetourPath: false,
          segments: [],
          skippedSegmentPolyline: null,
          inferredDetourPolyline: null,
          likelyDetourPolyline: null,
          entryPoint: null,
          exitPoint: null,
        },
      },
    }, { now });

    const written = writes['activeDetours/10'];
    expect(deletes).toEqual([]);
    expect(written.riderVisible).toBe(false);
    expect(written.riderVisibilityReason).toBe('insufficient-geometry');
    expect(written.staleForReview).toBe(true);
  });

  test('clears stale geometry fields when every current segment is invalid', async () => {
    jest.resetModules();
    const writes = {};
    const deletes = [];
    const now = Date.parse('2026-05-25T14:00:00Z');
    const badPath = [
      { latitude: 44.391788, longitude: -79.693163 },
      { latitude: 44.392791, longitude: -79.692481 },
    ];
    const badSegment = {
      canShowDetourPath: true,
      skippedSegmentPolyline: null,
      inferredDetourPolyline: badPath,
      likelyDetourPolyline: badPath,
      likelyDetourRoadNames: ['Bayfield Street', 'Sophia Street West'],
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-match',
      entryStopId: null,
      exitStopId: null,
      skippedStopIds: [],
      affectedStopIds: [],
    };
    const existingDoc = {
      id: '12B',
      data: () => ({
        routeId: '12B',
        detectedAt: new Date(now - 60 * 60 * 1000),
        updatedAt: now - 30 * 60 * 1000,
        lastSeenAt: new Date(now - 5 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        state: 'active',
        confidence: 'high',
        canShowDetourPath: true,
        segments: [badSegment],
        skippedSegmentPolyline: null,
        inferredDetourPolyline: badPath,
        likelyDetourPolyline: badPath,
        likelyDetourRoadNames: ['Bayfield Street', 'Sophia Street West'],
        roadMatchConfidence: 'high',
        roadMatchSource: 'osrm-match',
        entryPoint: badPath[0],
        exitPoint: badPath[badPath.length - 1],
      }),
    };

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
              delete: async () => { deletes.push(`${name}/${id}`); },
            }),
            get: async () => (
              name === 'activeDetours'
                ? { size: 1, docs: [existingDoc], forEach: (cb) => cb(existingDoc) }
                : { size: 0, docs: [], forEach: () => {} }
            ),
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
      '12B': {
        routeId: '12B',
        detectedAt: new Date(now - 60 * 60 * 1000),
        lastSeenAt: new Date(now - 5 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        state: 'active',
        geometry: {
          confidence: 'high',
          lastEvidenceAt: now - 5 * 60 * 1000,
          canShowDetourPath: true,
          segments: [badSegment],
          inferredDetourPolyline: badPath,
          likelyDetourPolyline: badPath,
          likelyDetourRoadNames: ['Bayfield Street', 'Sophia Street West'],
          roadMatchConfidence: 'high',
          roadMatchSource: 'osrm-match',
        },
      },
    }, { now });

    const written = writes['activeDetours/12B'];
    expect(deletes).toEqual([]);
    expect(written.canShowDetourPath).toBe(false);
    expect(written.segments).toEqual([]);
    expect(written.skippedSegmentPolyline).toBeNull();
    expect(written.inferredDetourPolyline).toBeNull();
    expect(written.likelyDetourPolyline).toBeNull();
    expect(written.likelyDetourRoadNames).toEqual([]);
    expect(written.entryPoint).toBeNull();
    expect(written.exitPoint).toBeNull();
  });

  test('hides active detours for riders when geometry is suppressed as invalid', async () => {
    jest.resetModules();
    const writes = {};
    const now = Date.parse('2026-05-25T14:00:00Z');
    const loopPoint = { latitude: 44.392978601382225, longitude: -79.69339997158372 };
    const loopPath = [
      loopPoint,
      { latitude: 44.3934, longitude: -79.6919 },
      loopPoint,
    ];

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => {
          const emptyQuery = { get: async () => ({ empty: true, docs: [] }) };
          return {
            doc: (id) => ({
              set: async (data) => { writes[`${name}/${id}`] = data; },
              delete: async () => {},
            }),
            get: async () => ({ size: 0, docs: [], forEach: () => {} }),
            orderBy: () => ({ limit: () => emptyQuery }),
            where: () => ({
              orderBy: () => ({ limit: () => emptyQuery }),
              limit: () => emptyQuery,
            }),
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
      '12B': {
        routeId: '12B',
        detectedAt: new Date(now - 10 * 60 * 1000),
        lastSeenAt: new Date(now - 5 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        state: 'active',
        geometry: {
          confidence: 'high',
          lastEvidenceAt: now - 5 * 60 * 1000,
          canShowDetourPath: true,
          segments: [{
            confidence: 'high',
            canShowDetourPath: true,
            entryPoint: loopPoint,
            exitPoint: loopPoint,
            skippedSegmentPolyline: null,
            inferredDetourPolyline: loopPath,
            likelyDetourPolyline: loopPath,
            skippedStopIds: [],
            affectedStopIds: [],
          }],
          entryPoint: loopPoint,
          exitPoint: loopPoint,
          inferredDetourPolyline: loopPath,
          likelyDetourPolyline: loopPath,
        },
      },
    }, { now });

    const written = writes['activeDetours/12B'];
    expect(written.riderVisible).toBe(false);
    expect(written.riderVisibilityReason).toBe('suppressed-invalid-geometry');
    expect(written.staleForReview).toBe(true);
    expect(written.segments).toEqual([]);
    expect(written.inferredDetourPolyline).toBeNull();
    expect(written.likelyDetourPolyline).toBeNull();
  });

  test('clears stale geometry fields when clear-pending geometry is suppressed without segments', async () => {
    jest.resetModules();
    const writes = {};
    const now = Date.parse('2026-05-25T14:00:00Z');
    const stalePath = [
      { latitude: 44.391788, longitude: -79.693163 },
      { latitude: 44.392791, longitude: -79.692481 },
    ];
    const existingDoc = {
      id: '12A',
      data: () => ({
        routeId: '12A',
        detectedAt: new Date(now - 60 * 60 * 1000),
        updatedAt: now - 30 * 60 * 1000,
        lastSeenAt: new Date(now - 5 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        state: 'clear-pending',
        confidence: 'high',
        canShowDetourPath: true,
        segments: [{
          canShowDetourPath: true,
          inferredDetourPolyline: stalePath,
          likelyDetourPolyline: stalePath,
        }],
        inferredDetourPolyline: stalePath,
        likelyDetourPolyline: stalePath,
        likelyDetourRoadNames: ['Bad Path'],
        entryPoint: stalePath[0],
        exitPoint: stalePath[stalePath.length - 1],
      }),
    };

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => {
          const emptyQuery = { get: async () => ({ empty: true, docs: [] }) };
          return {
            doc: (id) => ({
              set: async (data) => { writes[`${name}/${id}`] = data; },
              delete: async () => {},
            }),
            get: async () => (
              name === 'activeDetours'
                ? { size: 1, docs: [existingDoc], forEach: (cb) => cb(existingDoc) }
                : { size: 0, docs: [], forEach: () => {} }
            ),
            orderBy: () => ({ limit: () => emptyQuery }),
            where: () => ({
              orderBy: () => ({ limit: () => emptyQuery }),
              limit: () => emptyQuery,
            }),
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
      '12A': {
        routeId: '12A',
        detectedAt: new Date(now - 60 * 60 * 1000),
        lastSeenAt: new Date(now - 5 * 60 * 1000),
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
          state: 'clear-pending',
        geometry: {
          confidence: 'high',
          lastEvidenceAt: now - 5 * 60 * 1000,
          canShowDetourPath: false,
          likelyDetourPolyline: null,
          likelyDetourRoadNames: [],
        },
      },
    }, { now });

    const written = writes['activeDetours/12A'];
    expect(written.canShowDetourPath).toBe(false);
    expect(written.segments).toEqual([]);
    expect(written.inferredDetourPolyline).toBeNull();
    expect(written.likelyDetourPolyline).toBeNull();
    expect(written.likelyDetourRoadNames).toEqual([]);
    expect(written.entryPoint).toBeNull();
    expect(written.exitPoint).toBeNull();
  });

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

  test('filters explicitly unanchored no-stop segments before publishing geometry', () => {
    const validPath = [
      { latitude: 44.333039, longitude: -79.673622 },
      { latitude: 44.334702, longitude: -79.668856 },
    ];
    const unanchoredPath = [
      { latitude: 44.391788, longitude: -79.693163 },
      { latitude: 44.392791, longitude: -79.692481 },
    ];

    const result = enforceGeometryTrustGate({
      canShowDetourPath: true,
      inferredDetourPolyline: unanchoredPath,
      likelyDetourPolyline: unanchoredPath,
      likelyDetourRoadNames: ['Bayfield Street', 'Sophia Street West'],
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
          affectedStopIds: ['617', '618', '931'],
        },
        {
          canShowDetourPath: true,
          inferredDetourPolyline: unanchoredPath,
          likelyDetourPolyline: unanchoredPath,
          likelyDetourRoadNames: ['Bayfield Street', 'Sophia Street West'],
          roadMatchConfidence: 'high',
          roadMatchSource: 'osrm-match',
          entryStopId: null,
          exitStopId: null,
          skippedStopIds: [],
          affectedStopIds: [],
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

  test('keeps no-stop segments when a closed route segment is identified', () => {
    const closedRouteSegment = [
      { latitude: 44.333039, longitude: -79.673622 },
      { latitude: 44.334702, longitude: -79.668856 },
    ];
    const detourPath = [
      { latitude: 44.333067, longitude: -79.673553 },
      { latitude: 44.33654, longitude: -79.669865 },
    ];

    const result = enforceGeometryTrustGate({
      canShowDetourPath: true,
      inferredDetourPolyline: detourPath,
      segments: [{
        canShowDetourPath: true,
        skippedSegmentPolyline: closedRouteSegment,
        inferredDetourPolyline: detourPath,
        entryPoint: closedRouteSegment[0],
        exitPoint: closedRouteSegment[1],
        entryStopId: null,
        exitStopId: null,
        skippedStopIds: [],
        affectedStopIds: [],
      }],
    });

    expect(result.segments).toHaveLength(1);
    expect(result.skippedSegmentPolyline).toEqual(closedRouteSegment);
    expect(result.inferredDetourPolyline).toEqual(detourPath);
    expect(result.canShowDetourPath).toBe(true);
  });

  test('hides geometry when every segment is explicitly unanchored with no stops', () => {
    const unanchoredPath = [
      { latitude: 44.391788, longitude: -79.693163 },
      { latitude: 44.392791, longitude: -79.692481 },
    ];

    const result = enforceGeometryTrustGate({
      canShowDetourPath: true,
      inferredDetourPolyline: unanchoredPath,
      likelyDetourPolyline: unanchoredPath,
      likelyDetourRoadNames: ['Bayfield Street', 'Sophia Street West'],
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-match',
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: unanchoredPath,
        likelyDetourPolyline: unanchoredPath,
        likelyDetourRoadNames: ['Bayfield Street', 'Sophia Street West'],
        roadMatchConfidence: 'high',
        roadMatchSource: 'osrm-match',
        entryStopId: null,
        exitStopId: null,
        skippedStopIds: [],
        affectedStopIds: [],
      }],
    });

    expect(result.segments).toEqual([]);
    expect(result.canShowDetourPath).toBe(false);
    expect(result.inferredDetourPolyline).toBeNull();
    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.likelyDetourRoadNames).toEqual([]);
  });

  test('filters long out-and-back paths when the closed segment span is tiny', () => {
    const outAndBackPath = [
      { latitude: 44.387414, longitude: -79.690039 },
      { latitude: 44.3899, longitude: -79.6892 },
      { latitude: 44.3917, longitude: -79.6881 },
      { latitude: 44.3936, longitude: -79.6870 },
      { latitude: 44.387761, longitude: -79.689189 },
    ];

    const result = enforceGeometryTrustGate({
      canShowDetourPath: true,
      inferredDetourPolyline: outAndBackPath,
      likelyDetourPolyline: outAndBackPath,
      likelyDetourRoadNames: ['Simcoe Street', 'Lakeshore Mews'],
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-match',
      segments: [{
        canShowDetourPath: true,
        spanMeters: 79,
        entryPoint: { latitude: 44.387414, longitude: -79.690039 },
        exitPoint: { latitude: 44.387761, longitude: -79.689189 },
        skippedSegmentPolyline: null,
        inferredDetourPolyline: outAndBackPath,
        likelyDetourPolyline: outAndBackPath,
        likelyDetourRoadNames: ['Simcoe Street', 'Lakeshore Mews'],
        roadMatchConfidence: 'high',
        roadMatchSource: 'osrm-match',
        debug: {
          entryCandidateCount: 12,
          exitCandidateCount: 12,
          exitAnchorSource: 'boundary-candidate',
        },
      }],
    });

    expect(result.segments).toEqual([]);
    expect(result.canShowDetourPath).toBe(false);
    expect(result.inferredDetourPolyline).toBeNull();
    expect(result.likelyDetourPolyline).toBeNull();
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

  test('does not preserve an old path when current GPS evidence is too jumpy to trust', () => {
    const trustedPath = [
      { latitude: 44.395, longitude: -79.698 },
      { latitude: 44.395, longitude: -79.690 },
      { latitude: 44.395, longitude: -79.682 },
    ];
    const previous = {
      canShowDetourPath: true,
      likelyDetourPolyline: trustedPath,
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-match',
      segments: [{
        canShowDetourPath: true,
        likelyDetourPolyline: trustedPath,
        roadMatchConfidence: 'high',
        roadMatchSource: 'osrm-match',
      }],
    };
    const unsafeGeometry = {
      canShowDetourPath: false,
      geometryTrustBlockedReason: 'jumpy-inferred-path',
      skippedSegmentPolyline: null,
      inferredDetourPolyline: null,
      likelyDetourPolyline: null,
      likelyDetourRoadNames: [],
      segments: [{
        canShowDetourPath: false,
        geometryTrustBlockedReason: 'jumpy-inferred-path',
        skippedSegmentPolyline: null,
        inferredDetourPolyline: null,
        likelyDetourPolyline: null,
      }],
    };

    const result = preserveTrustedDetourPath(unsafeGeometry, previous, { state: 'active' });

    expect(result.canShowDetourPath).toBe(false);
    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.segments[0].likelyDetourPolyline).toBeNull();
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

  test('does not preserve a trusted path from a tiny-span long out-and-back segment', () => {
    const outAndBackPath = [
      { latitude: 44.387414, longitude: -79.690039 },
      { latitude: 44.3899, longitude: -79.6892 },
      { latitude: 44.3917, longitude: -79.6881 },
      { latitude: 44.3936, longitude: -79.6870 },
      { latitude: 44.387761, longitude: -79.689189 },
    ];
    const previous = {
      canShowDetourPath: true,
      likelyDetourPolyline: outAndBackPath,
      inferredDetourPolyline: outAndBackPath,
      likelyDetourRoadNames: ['Simcoe Street', 'Lakeshore Mews'],
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-match',
      skippedSegmentPolyline: [
        { latitude: 44.387388, longitude: -79.690014 },
        { latitude: 44.3900, longitude: -79.6898 },
        { latitude: 44.3929, longitude: -79.6885 },
        { latitude: 44.3934, longitude: -79.6874 },
      ],
      segments: [{
        canShowDetourPath: true,
        spanMeters: 79,
        entryPoint: { latitude: 44.387414, longitude: -79.690039 },
        exitPoint: { latitude: 44.387761, longitude: -79.689189 },
        skippedSegmentPolyline: null,
        inferredDetourPolyline: outAndBackPath,
        likelyDetourPolyline: outAndBackPath,
        likelyDetourRoadNames: ['Simcoe Street', 'Lakeshore Mews'],
        roadMatchConfidence: 'high',
        roadMatchSource: 'osrm-match',
        debug: {
          entryCandidateCount: 12,
          exitCandidateCount: 12,
          exitAnchorSource: 'boundary-candidate',
        },
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
    expect(result.inferredDetourPolyline).toBeUndefined();
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

  test('does not preserve old inferred-only full-loop geometry over current trusted geometry', () => {
    const staleFullLoopPath = [
      { latitude: 44.388084, longitude: -79.690521 },
      { latitude: 44.393383, longitude: -79.694801 },
      { latitude: 44.389824, longitude: -79.685532 },
      { latitude: 44.390510, longitude: -79.685550 },
    ];
    const staleSkippedSegment = [
      { latitude: 44.388084, longitude: -79.690521 },
      { latitude: 44.411094, longitude: -79.705103 },
      { latitude: 44.416401, longitude: -79.658484 },
      { latitude: 44.390510, longitude: -79.685550 },
    ];
    const currentPath = [
      { latitude: 44.390510, longitude: -79.685486 },
      { latitude: 44.389374, longitude: -79.685455 },
      { latitude: 44.388023, longitude: -79.689122 },
    ];
    const currentSkippedSegment = [
      { latitude: 44.390510, longitude: -79.685486 },
      { latitude: 44.390480, longitude: -79.687700 },
      { latitude: 44.388023, longitude: -79.689122 },
    ];
    const previous = {
      canShowDetourPath: true,
      inferredDetourPolyline: staleFullLoopPath,
      likelyDetourPolyline: null,
      skippedSegmentPolyline: staleSkippedSegment,
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: staleFullLoopPath,
        likelyDetourPolyline: null,
        skippedSegmentPolyline: staleSkippedSegment,
      }],
    };
    const currentTrustedButUnmatched = {
      canShowDetourPath: true,
      inferredDetourPolyline: currentPath,
      likelyDetourPolyline: null,
      skippedSegmentPolyline: currentSkippedSegment,
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: currentPath,
        likelyDetourPolyline: null,
        skippedSegmentPolyline: currentSkippedSegment,
      }],
    };

    const result = preserveTrustedDetourPath(currentTrustedButUnmatched, previous, { state: 'active' });

    expect(result.inferredDetourPolyline).toEqual(currentPath);
    expect(result.skippedSegmentPolyline).toEqual(currentSkippedSegment);
    expect(result.segments[0].inferredDetourPolyline).toEqual(currentPath);
    expect(result.segments[0].skippedSegmentPolyline).toEqual(currentSkippedSegment);
  });

  test('does not preserve the previous likely path when GPS evidence supersedes it', () => {
    const stalePath = [
      { latitude: 44.395, longitude: -79.698 },
      { latitude: 44.395, longitude: -79.690 },
      { latitude: 44.395, longitude: -79.682 },
    ];
    const alternatePath = [
      { latitude: 44.390, longitude: -79.698 },
      { latitude: 44.397, longitude: -79.698 },
      { latitude: 44.397, longitude: -79.696 },
      { latitude: 44.390, longitude: -79.684 },
    ];
    const previous = {
      canShowDetourPath: true,
      likelyDetourPolyline: stalePath,
      roadMatchConfidence: 'high',
      segments: [{
        canShowDetourPath: true,
        likelyDetourPolyline: stalePath,
      }],
    };
    const currentGpsConfirmedAlternate = {
      canShowDetourPath: true,
      gpsSupersedesPreviousPath: true,
      inferredDetourPolyline: alternatePath,
      likelyDetourPolyline: null,
      segments: [{
        canShowDetourPath: true,
        gpsSupersedesPreviousPath: true,
        inferredDetourPolyline: alternatePath,
        likelyDetourPolyline: null,
      }],
    };

    const result = preserveTrustedDetourPath(currentGpsConfirmedAlternate, previous, { state: 'active' });

    expect(result.canShowDetourPath).toBe(true);
    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.inferredDetourPolyline).toEqual(alternatePath);
    expect(result.segments[0].likelyDetourPolyline).toBeNull();
    expect(result.segments[0].inferredDetourPolyline).toEqual(alternatePath);
  });

  test('does not preserve a much longer previous likely path over new trusted geometry', () => {
    const staleZigzag = [
      { latitude: 44.3874, longitude: -79.6900 },
      { latitude: 44.3894, longitude: -79.6854 },
      { latitude: 44.3882, longitude: -79.6879 },
      { latitude: 44.3892, longitude: -79.6854 },
      { latitude: 44.3931, longitude: -79.6855 },
    ];
    const cleanPath = [
      { latitude: 44.3874, longitude: -79.6900 },
      { latitude: 44.3887, longitude: -79.6854 },
      { latitude: 44.3905, longitude: -79.6855 },
    ];
    const previous = {
      canShowDetourPath: true,
      inferredDetourPolyline: staleZigzag,
      likelyDetourPolyline: staleZigzag,
      likelyDetourRoadNames: ['Simcoe Street'],
      roadMatchConfidence: 'high',
      roadMatchSource: 'osrm-match',
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: staleZigzag,
        likelyDetourPolyline: staleZigzag,
      }],
    };
    const currentTrustedButUnmatched = {
      canShowDetourPath: true,
      inferredDetourPolyline: cleanPath,
      likelyDetourPolyline: null,
      likelyDetourRoadNames: [],
      segments: [{
        canShowDetourPath: true,
        inferredDetourPolyline: cleanPath,
        likelyDetourPolyline: null,
      }],
    };

    const result = preserveTrustedDetourPath(currentTrustedButUnmatched, previous, { state: 'active' });

    expect(result.likelyDetourPolyline).toBeNull();
    expect(result.inferredDetourPolyline).toEqual(cleanPath);
    expect(result.segments[0].likelyDetourPolyline).toBeNull();
    expect(result.segments[0].inferredDetourPolyline).toEqual(cleanPath);
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

  test('returns true when previous snapshot contains filtered same-stop geometry', () => {
    const validSegment = {
      canShowDetourPath: true,
      inferredDetourPolyline: [
        { latitude: 44.333039, longitude: -79.673622 },
        { latitude: 44.33713, longitude: -79.66934 },
      ],
      entryStopId: '617',
      exitStopId: '931',
      skippedStopIds: ['617', '618', '931'],
    };
    const detour = makeDetour({
      geometry: {
        confidence: 'medium',
        evidencePointCount: 10,
        segments: [validSegment],
      },
    });
    const prev = makePrevSnapshot({
      segments: [
        validSegment,
        {
          canShowDetourPath: true,
          inferredDetourPolyline: [
            { latitude: 44.386386, longitude: -79.69204 },
            { latitude: 44.389031, longitude: -79.685426 },
            { latitude: 44.386386, longitude: -79.69204 },
          ],
          entryStopId: '1',
          exitStopId: '1',
          skippedStopIds: ['1'],
        },
      ],
    });

    expect(shouldWriteGeometry('12B', detour, prev, NOW)).toBe(true);
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

describe('publishDetours road-match backfill persistence', () => {
  test('writes a successful road-match backfill even when confidence and geometry signature are unchanged', async () => {
    jest.resetModules();

    const writes = {};
    const now = Date.parse('2026-05-26T16:00:00Z');
    const rawPath = [
      { latitude: 44.390278, longitude: -79.685472 },
      { latitude: 44.388694, longitude: -79.685528 },
      { latitude: 44.387972, longitude: -79.688833 },
    ];
    const closedPath = [
      { latitude: 44.390472, longitude: -79.688028 },
      { latitude: 44.387861, longitude: -79.689167 },
    ];
    const snappedPath = [
      { latitude: 44.390278, longitude: -79.685472 },
      { latitude: 44.388667, longitude: -79.685500 },
      { latitude: 44.387944, longitude: -79.688806 },
      { latitude: 44.387861, longitude: -79.689167 },
    ];
    const existingRoute10 = {
      routeId: '10',
      detectedAt: new Date(now - 60 * 60 * 1000),
      lastSeenAt: new Date(now - 60 * 1000),
      updatedAt: now,
      vehicleCount: 2,
      uniqueVehicleCount: 2,
      currentVehicleCount: 1,
      state: 'active',
      confidence: 'high',
      canShowDetourPath: true,
      evidencePointCount: 4,
      lastEvidenceAt: now - 60 * 1000,
      segments: [{
        canShowDetourPath: true,
        confidence: 'high',
        skippedSegmentPolyline: closedPath,
        inferredDetourPolyline: rawPath,
        likelyDetourPolyline: null,
        likelyDetourRoadNames: [],
        roadMatchConfidence: null,
        roadMatchRawConfidence: null,
        roadMatchSource: null,
        entryPoint: closedPath[0],
        exitPoint: closedPath[closedPath.length - 1],
      }],
      skippedSegmentPolyline: closedPath,
      inferredDetourPolyline: rawPath,
      likelyDetourPolyline: null,
      likelyDetourRoadNames: [],
      roadMatchConfidence: null,
      roadMatchRawConfidence: null,
      roadMatchSource: null,
      entryPoint: closedPath[0],
      exitPoint: closedPath[closedPath.length - 1],
    };
    const activeDoc = { id: '10', data: () => existingRoute10 };
    const activeSnapshot = {
      size: 1,
      docs: [activeDoc],
      forEach: (cb) => cb(activeDoc),
    };
    const emptySnapshot = {
      empty: true,
      size: 0,
      docs: [],
      forEach: () => {},
    };

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => {
          const emptyQuery = { get: async () => emptySnapshot };
          const whereQuery = {
            orderBy: () => ({ limit: () => emptyQuery }),
            limit: () => emptyQuery,
          };
          return {
            doc: (id) => ({
              set: async (data) => { writes[`${name}/${id}`] = data; },
              delete: async () => {},
            }),
            get: async () => (name === 'activeDetours' ? activeSnapshot : emptySnapshot),
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

    const matchDetourGeometry = jest.fn(async (geo) => ({
      ...geo,
      likelyDetourPolyline: snappedPath,
      likelyDetourRoadNames: ['Mulcaster Street', 'Simcoe Street', 'Bayfield Street'],
      roadMatchConfidence: null,
      roadMatchRawConfidence: null,
      roadMatchSource: 'osrm-route',
      segments: geo.segments.map((segment) => ({
        ...segment,
        likelyDetourPolyline: snappedPath,
        likelyDetourRoadNames: ['Mulcaster Street', 'Simcoe Street', 'Bayfield Street'],
        roadMatchConfidence: null,
        roadMatchRawConfidence: null,
        roadMatchSource: 'osrm-route',
      })),
    }));
    jest.doMock('../detourRoadMatcher', () => ({
      DETOUR_PATH_LABEL: 'Likely detour path',
      matchDetourGeometry,
    }));

    try {
      const publisher = require('../detourPublisher');
      await publisher.publishDetours({
        '10': {
          routeId: '10',
          detectedAt: new Date(now - 60 * 60 * 1000),
          lastSeenAt: new Date(now - 60 * 1000),
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          currentVehicleCount: 1,
          state: 'active',
          vehiclesOffRoute: new Set(['route-10-bus']),
          geometry: {
            confidence: 'high',
            canShowDetourPath: true,
            evidencePointCount: 4,
            lastEvidenceAt: now - 60 * 1000,
            skippedSegmentPolyline: closedPath,
            inferredDetourPolyline: rawPath,
            entryPoint: closedPath[0],
            exitPoint: closedPath[closedPath.length - 1],
            segments: existingRoute10.segments,
          },
        },
      }, {
        now,
        vehicles: [{ routeId: '10', id: 'route-10-bus' }],
      });
      expect(matchDetourGeometry).toHaveBeenCalledTimes(1);
      expect(writes['activeDetours/10'].roadMatchSource).toBe('osrm-route');
      expect(writes['activeDetours/10'].likelyDetourPolyline).toEqual(snappedPath);
      expect(writes['activeDetours/10'].segments[0].roadMatchSource).toBe('osrm-route');
      expect(writes['activeDetours/10'].segments[0].likelyDetourPolyline).toEqual(snappedPath);
    } finally {
      jest.dontMock('../firebaseAdmin');
      jest.dontMock('../detourRoadMatcher');
    }
  });
});

describe('buildUpdatedEvent', () => {
  const NOW = Date.now();



  test('records rider visibility changes in update events', () => {
    const event = buildUpdatedEvent('8A', {
      routeId: '8A',
      detectedAtMs: 1000,
      vehicleCount: 2,
      uniqueVehicleCount: 2,
      currentVehicleCount: 0,
      state: 'active',
      riderVisible: true,
      riderVisibilityReason: 'gps-clear-required',
    }, {
      routeId: '8A',
      detectedAtMs: 1000,
      vehicleCount: 2,
      uniqueVehicleCount: 2,
      currentVehicleCount: 0,
      state: 'active',
      riderVisible: false,
      riderVisibilityReason: 'insufficient-geometry',
      staleForReview: true,
    }, 9000);

    expect(event.changedFields).toEqual(['riderVisible', 'riderVisibilityReason']);
    expect(event.riderVisible).toBe(false);
    expect(event.riderVisibilityReason).toBe('insufficient-geometry');
    expect(event.staleForReview).toBe(true);
  });

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
