const {
  upsertCandidateObservation,
  pruneExpiredCandidates,
  findMatchingCandidate,
  hasEnoughUniqueEvidence,
} = require('../detour/candidateMemory');

describe('normal detour candidate memory', () => {
  test('matches candidates on same route, shape, and nearby progress window', () => {
    const candidates = new Map();
    const first = {
      routeId: '8A',
      shapeId: 'shape-8a',
      progressMinMeters: 1000,
      progressMaxMeters: 1250,
      timestampMs: 1000,
      vehicleId: 'bus-1',
      tripId: 'trip-1',
      evidencePoints: [],
    };
    const second = {
      routeId: '8A',
      shapeId: 'shape-8a',
      progressMinMeters: 1280,
      progressMaxMeters: 1450,
      timestampMs: 60 * 60 * 1000,
      vehicleId: 'bus-2',
      tripId: 'trip-2',
      evidencePoints: [],
    };

    upsertCandidateObservation(candidates, first, { maxGapMeters: 350 });
    const match = findMatchingCandidate(candidates, second, { maxGapMeters: 350 });

    expect(match).toBeDefined();
    expect(match.candidate.routeId).toBe('8A');
  });

  test('requires two unique vehicle-first signatures before promotion', () => {
    const candidates = new Map();
    const first = {
      routeId: '8A',
      shapeId: 'shape-8a',
      progressMinMeters: 1000,
      progressMaxMeters: 1250,
      timestampMs: 1000,
      vehicleId: 'bus-1',
      tripId: 'trip-1',
      evidencePoints: [],
    };
    const repeat = { ...first, timestampMs: 2000 };
    const second = {
      ...first,
      vehicleId: 'bus-2',
      tripId: 'trip-2',
      timestampMs: 60 * 60 * 1000,
    };

    const candidate = upsertCandidateObservation(candidates, first, { maxGapMeters: 350 });
    upsertCandidateObservation(candidates, repeat, { maxGapMeters: 350 });
    expect(hasEnoughUniqueEvidence(candidate, { minUniqueSignatures: 2 })).toBe(false);

    const promoted = upsertCandidateObservation(candidates, second, { maxGapMeters: 350 });
    expect(hasEnoughUniqueEvidence(promoted, { minUniqueSignatures: 2 })).toBe(true);
  });

  test('counts the same vehicle on a later trip as a second unique trip signature', () => {
    const candidates = new Map();
    const first = {
      routeId: '8A',
      shapeId: 'shape-8a',
      progressMinMeters: 1000,
      progressMaxMeters: 1250,
      timestampMs: 1000,
      vehicleId: 'bus-1',
      tripId: 'trip-1',
      evidencePoints: [],
    };
    const sameBusLaterTrip = {
      ...first,
      tripId: 'trip-2',
      timestampMs: 60 * 60 * 1000,
    };

    const candidate = upsertCandidateObservation(candidates, first, { maxGapMeters: 350 });
    upsertCandidateObservation(candidates, sameBusLaterTrip, { maxGapMeters: 350 });

    expect(hasEnoughUniqueEvidence(candidate, { minUniqueSignatures: 2 })).toBe(true);
  });

  test('does not count the same trip twice when the vehicle ID changes', () => {
    const candidates = new Map();
    const first = {
      routeId: '8A',
      shapeId: 'shape-8a',
      progressMinMeters: 1000,
      progressMaxMeters: 1250,
      timestampMs: 1000,
      vehicleId: 'bus-avl-before-reset',
      tripId: 'trip-1',
      evidencePoints: [],
    };
    const sameTripNewVehicleId = {
      ...first,
      vehicleId: 'bus-avl-after-reset',
      timestampMs: 60 * 1000,
    };

    const candidate = upsertCandidateObservation(candidates, first, { maxGapMeters: 350 });
    upsertCandidateObservation(candidates, sameTripNewVehicleId, { maxGapMeters: 350 });

    expect(candidate.observations).toHaveLength(1);
    expect(hasEnoughUniqueEvidence(candidate, { minUniqueSignatures: 2 })).toBe(false);
  });

  test('does not promote unstable vehicle-only identities from one-point observations', () => {
    const candidates = new Map();
    const base = {
      routeId: '8A',
      shapeId: 'shape-8a',
      progressMinMeters: 1000,
      progressMaxMeters: 1000,
      timestampMs: 1000,
      tripId: null,
      evidencePoints: [{ timestampMs: 1000 }],
    };

    const candidate = upsertCandidateObservation(candidates, {
      ...base,
      vehicleId: 'unstable-avl-1',
    }, { maxGapMeters: 350 });
    upsertCandidateObservation(candidates, {
      ...base,
      vehicleId: 'unstable-avl-2',
      timestampMs: 2000,
      evidencePoints: [{ timestampMs: 2000 }],
    }, { maxGapMeters: 350 });
    upsertCandidateObservation(candidates, {
      ...base,
      vehicleId: 'unstable-avl-3',
      timestampMs: 3000,
      evidencePoints: [{ timestampMs: 3000 }],
    }, { maxGapMeters: 350 });

    expect(candidate.observations).toHaveLength(3);
    expect(hasEnoughUniqueEvidence(candidate, { minUniqueSignatures: 2 })).toBe(false);
  });

  test('keeps repeated observations from the same signature compact', () => {
    const candidates = new Map();
    const first = {
      routeId: '8A',
      shapeId: 'shape-8a',
      progressMinMeters: 1000,
      progressMaxMeters: 1250,
      timestampMs: 1000,
      vehicleId: 'bus-1',
      tripId: 'trip-1',
      evidencePoints: [],
    };

    const candidate = upsertCandidateObservation(candidates, first, { maxGapMeters: 350 });
    upsertCandidateObservation(candidates, { ...first, timestampMs: 2000 }, { maxGapMeters: 350 });

    expect(candidate.observations).toHaveLength(1);
  });

  test('prunes candidates outside the confirmation window', () => {
    const candidates = new Map();
    upsertCandidateObservation(candidates, {
      routeId: '8A',
      shapeId: 'shape-8a',
      progressMinMeters: 1000,
      progressMaxMeters: 1250,
      timestampMs: 1000,
      vehicleId: 'bus-1',
      tripId: 'trip-1',
      evidencePoints: [],
    }, { maxGapMeters: 350 });

    pruneExpiredCandidates(candidates, {
      nowMs: 4 * 60 * 60 * 1000,
      windowMs: 3 * 60 * 60 * 1000,
    });

    expect(candidates.size).toBe(0);
  });

  test('route-scoped pruning does not expire unrelated route candidates', () => {
    const candidates = new Map();
    upsertCandidateObservation(candidates, {
      routeId: '8A',
      shapeId: 'shape-8a',
      progressMinMeters: 1000,
      progressMaxMeters: 1250,
      timestampMs: 1000,
      vehicleId: 'bus-1',
      tripId: 'trip-1',
      evidencePoints: [],
    }, { maxGapMeters: 350 });
    upsertCandidateObservation(candidates, {
      routeId: '2A',
      shapeId: 'shape-2a',
      progressMinMeters: 1000,
      progressMaxMeters: 1250,
      timestampMs: 1000,
      vehicleId: 'bus-9',
      tripId: 'trip-9',
      evidencePoints: [],
    }, { maxGapMeters: 350 });

    pruneExpiredCandidates(candidates, {
      nowMs: 4 * 60 * 60 * 1000,
      windowMs: 3 * 60 * 60 * 1000,
      routeId: '8A',
    });

    expect([...candidates.values()].map((candidate) => candidate.routeId)).toEqual(['2A']);
  });

  test('ignores invalid candidate observations', () => {
    const candidates = new Map();
    const result = upsertCandidateObservation(candidates, {
      routeId: '8A',
      shapeId: 'shape-8a',
      progressMinMeters: NaN,
      progressMaxMeters: 1250,
      timestampMs: 1000,
      vehicleId: 'bus-1',
      tripId: 'trip-1',
      evidencePoints: [],
    }, { maxGapMeters: 350 });

    expect(result).toBeNull();
    expect(candidates.size).toBe(0);
  });
});
