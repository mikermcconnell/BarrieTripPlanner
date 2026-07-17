'use strict';

const { createConfirmedEventRefresh } = require('../detourV2/confirmedEventRefresh');

function makeHarness({ direction = 1, directionMode = 'enforce' } = {}) {
  let currentDirection = direction;
  const detour = {
    eventId: 'event-8b',
    routeId: '8B',
    state: 'active',
    uniqueVehicleCount: 2,
    geometry: { paths: [[{ latitude: 1, longitude: 1 }]] },
    latestGpsEvidenceAt: 100,
    lastSeenAt: new Date(100),
  };
  const activeDetours = new Map([[detour.eventId, detour]]);
  const cleared = [];
  const refresh = createConfirmedEventRefresh({
    activeDetours,
    getActiveEventsForRoute: () => [...activeDetours.values()],
    getPathPolylines: (geometry) => geometry?.paths || [],
    getShapeId: () => 'shape-8b',
    getProgressBounds: () => ({ start: 900, end: 1200 }),
    getDistanceToPaths: () => 20,
    resolveProgressDirection: () => currentDirection,
    clearNormalRouteEvidence: (eventId) => cleared.push(eventId),
    directionMode,
    rules: {
      minimumUniqueSignatures: 2,
      offRouteThresholdMeters: 40,
      marginalThresholdMeters: 25,
      pathProximityMeters: 60,
      minimumTraversalMeters: 75,
      reversalToleranceMeters: 75,
      maximumSampleGapMs: 10 * 60 * 1000,
    },
  });
  return {
    activeDetours,
    cleared,
    detour,
    refresh,
    setDirection: (nextDirection) => { currentDirection = nextDirection; },
  };
}

function pendingRefresh(overrides = {}) {
  return {
    eventId: 'event-8b',
    shapeId: 'shape-8b',
    entryProgressMeters: 920,
    marginalProgressMeters: 1000,
    observedAt: 1000,
    expectedProgressDirection: 1,
    ...overrides,
  };
}

describe('confirmed event refresh', () => {
  test('matches only marginal samples near a confirmed event', () => {
    const { refresh } = makeHarness();
    const sample = {
      shapeId: 'shape-8b',
      coordinate: { latitude: 44, longitude: -79 },
      progressMeters: 1000,
      timestampMs: 1000,
    };

    expect(refresh.findMatches('8', sample, 30)).toHaveLength(1);
    expect(refresh.findMatches('8', sample, 20)).toEqual([]);
    expect(refresh.findMatches('8', sample, 50)).toEqual([]);
  });

  test('arms from the prior on-route sample with the event direction', () => {
    const { detour, refresh } = makeHarness();
    const pending = refresh.arm({
      lastOnRouteSample: {
        shapeId: 'shape-8b',
        progressMeters: 920,
        timestampMs: 900,
      },
    }, {
      shapeId: 'shape-8b',
      progressMeters: 1000,
      timestampMs: 1000,
    }, [detour]);

    expect(pending).toEqual([pendingRefresh()]);
  });

  test('refreshes an increasing traversal for an increasing event', () => {
    const { cleared, detour, refresh } = makeHarness({ direction: 1 });
    const result = refresh.finalize({
      pendingConfirmedRefreshes: [pendingRefresh()],
    }, {
      shapeId: 'shape-8b',
      progressMeters: 1100,
      timestampMs: 1100,
    });

    expect(result.refreshedEventIds).toEqual(new Set(['event-8b']));
    expect(detour.lastConfirmedRefreshAt).toBe(1000);
    expect(cleared).toEqual(['event-8b']);
  });

  test('refreshes a decreasing traversal for a decreasing event', () => {
    const { cleared, refresh } = makeHarness({ direction: -1 });
    const result = refresh.finalize({
      pendingConfirmedRefreshes: [pendingRefresh({
        entryProgressMeters: 1100,
        marginalProgressMeters: 1000,
        expectedProgressDirection: -1,
      })],
    }, {
      shapeId: 'shape-8b',
      progressMeters: 920,
      timestampMs: 1100,
    });

    expect(result.refreshedEventIds).toEqual(new Set(['event-8b']));
    expect(cleared).toEqual(['event-8b']);
  });

  test('rejects an opposite-direction traversal and preserves clear evidence', () => {
    const { cleared, detour, refresh } = makeHarness({ direction: 1 });
    const result = refresh.finalize({
      pendingConfirmedRefreshes: [pendingRefresh({
        entryProgressMeters: 1100,
        marginalProgressMeters: 1000,
      })],
    }, {
      shapeId: 'shape-8b',
      progressMeters: 920,
      timestampMs: 1100,
    });

    expect(result.refreshedEventIds).toEqual(new Set());
    expect(result.decisions).toEqual([{
      eventId: 'event-8b',
      refreshed: false,
      reason: 'confirmed-refresh-direction-mismatch',
    }]);
    expect(detour.lastConfirmedRefreshAt).toBeUndefined();
    expect(cleared).toEqual([]);
  });

  test('rejects when event direction changes after the refresh is armed', () => {
    const { refresh, setDirection } = makeHarness({ direction: 1 });
    setDirection(-1);
    const result = refresh.finalize({
      pendingConfirmedRefreshes: [pendingRefresh()],
    }, {
      shapeId: 'shape-8b',
      progressMeters: 1100,
      timestampMs: 1100,
    });

    expect(result.decisions[0].reason).toBe('confirmed-refresh-direction-changed');
    expect(result.refreshedEventIds.size).toBe(0);
  });

  test('does not intercept a marginal sample when direction is unknown in enforcement mode', () => {
    const { detour, refresh } = makeHarness({ direction: null });
    const pending = refresh.arm({
      lastOnRouteSample: {
        shapeId: 'shape-8b',
        progressMeters: 920,
        timestampMs: 900,
      },
    }, {
      shapeId: 'shape-8b',
      progressMeters: 1000,
      timestampMs: 1000,
    }, [detour]);

    expect(pending).toEqual([]);
    expect(refresh.getDirectionStats()).toMatchObject({ unknown: 1, enforcedReject: 1 });
  });

  test('reports a diagnostic mismatch without changing existing refresh behaviour', () => {
    const { cleared, refresh } = makeHarness({ direction: 1, directionMode: 'diagnostic' });
    const result = refresh.finalize({
      pendingConfirmedRefreshes: [pendingRefresh({ entryProgressMeters: 1100 })],
    }, {
      shapeId: 'shape-8b',
      progressMeters: 920,
      timestampMs: 1100,
    });

    expect(result.refreshedEventIds).toEqual(new Set(['event-8b']));
    expect(result.decisions[0].reason).toBe('confirmed-refresh-direction-mismatch');
    expect(refresh.getDirectionStats('8B')).toMatchObject({
      mismatch: 1,
      diagnosticWouldReject: 1,
      refreshed: 1,
    });
    expect(cleared).toEqual(['event-8b']);
  });

  test('preserves diagnostic counters across runtime-state hydration', () => {
    const first = makeHarness({ direction: 1, directionMode: 'diagnostic' });
    first.refresh.arm({
      lastOnRouteSample: {
        shapeId: 'shape-8b',
        progressMeters: 920,
        timestampMs: 900,
      },
    }, {
      shapeId: 'shape-8b',
      progressMeters: 1000,
      timestampMs: 1000,
    }, [first.detour]);

    const second = makeHarness({ direction: 1, directionMode: 'diagnostic' });
    second.refresh.hydrateDirectionStats(first.refresh.serializeDirectionStats());

    expect(second.refresh.getDirectionStats()).toMatchObject({ armedIncreasing: 1 });
    expect(second.refresh.getDirectionStats('8B')).toMatchObject({ armedIncreasing: 1 });
  });
});
