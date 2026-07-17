'use strict';

const { createConfirmedEventRefresh } = require('../detourV2/confirmedEventRefresh');

function makeHarness() {
  const detour = {
    eventId: 'event-8b',
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
    clearNormalRouteEvidence: (eventId) => cleared.push(eventId),
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
  return { activeDetours, cleared, detour, refresh };
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

  test('arms from the prior on-route sample and keeps one item per event', () => {
    const { detour, refresh } = makeHarness();
    const previousState = {
      lastOnRouteSample: {
        shapeId: 'shape-8b',
        progressMeters: 920,
        timestampMs: 900,
      },
      pendingConfirmedRefreshes: [{
        eventId: 'event-8b',
        shapeId: 'shape-8b',
        entryProgressMeters: 900,
        marginalProgressMeters: 980,
        observedAt: 950,
      }],
    };
    const pending = refresh.arm(previousState, {
      shapeId: 'shape-8b',
      progressMeters: 1000,
      timestampMs: 1000,
    }, [detour]);

    expect(pending).toEqual([{
      eventId: 'event-8b',
      shapeId: 'shape-8b',
      entryProgressMeters: 920,
      marginalProgressMeters: 1000,
      observedAt: 1000,
    }]);
  });

  test('refreshes only after a complete bracketed traversal', () => {
    const { cleared, detour, refresh } = makeHarness();
    const previousState = {
      pendingConfirmedRefreshes: [{
        eventId: 'event-8b',
        shapeId: 'shape-8b',
        entryProgressMeters: 920,
        marginalProgressMeters: 1000,
        observedAt: 1000,
      }],
    };

    expect(refresh.finalize(previousState, {
      shapeId: 'shape-8b',
      progressMeters: 1100,
      timestampMs: 1100,
    })).toEqual(new Set(['event-8b']));
    expect(detour.latestGpsEvidenceAt).toBe(1000);
    expect(detour.lastConfirmedRefreshAt).toBe(1000);
    expect(detour.confirmedRefreshCount).toBe(1);
    expect(cleared).toEqual(['event-8b']);
  });

  test('does not clear normal-route evidence for an incomplete traversal', () => {
    const { cleared, detour, refresh } = makeHarness();
    const previousState = {
      pendingConfirmedRefreshes: [{
        eventId: 'event-8b',
        shapeId: 'shape-8b',
        entryProgressMeters: 920,
        marginalProgressMeters: 1000,
        observedAt: 1000,
      }],
    };

    expect(refresh.finalize(previousState, {
      shapeId: 'shape-8b',
      progressMeters: 960,
      timestampMs: 1100,
    })).toEqual(new Set());
    expect(detour.lastConfirmedRefreshAt).toBeUndefined();
    expect(cleared).toEqual([]);
  });
});
