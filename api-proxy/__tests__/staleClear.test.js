const {
  shouldAutoClearStaleDetour,
  routeFamilyHasRecentVehicle,
  evaluateStaleRiderVisibility,
  isLowConfidenceValidationOnlyDetour,
} = require('../detour/staleClear');

describe('detour GPS-clear policy', () => {
  const now = Date.parse('2026-04-26T20:00:00Z');

  test('uses route-family vehicles for branch routes like 8A and 8B', () => {
    expect(routeFamilyHasRecentVehicle('8A', [{ routeId: '8B' }])).toBe(true);
    expect(routeFamilyHasRecentVehicle('8A', [{ routeId: '10' }])).toBe(false);
  });

  test('does not auto-clear based on age when same-route service is reporting', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: {
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        geometry: { lastEvidenceAt: now - 24 * 60 * 60 * 1000 },
      },
      vehicles: [{ routeId: '8A' }],
      now,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('gps-clear-required');
  });

  test('does not auto-clear when no route-family vehicles are reporting', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: { geometry: { lastEvidenceAt: now - 24 * 60 * 60 * 1000 } },
      vehicles: [{ routeId: '10' }],
      now,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('no-recent-route-family-vehicle');
  });

  test('does not suppress low-confidence validation-only output based on age', () => {
    const detour = {
      vehicleCount: 1,
      uniqueVehicleCount: 1,
      currentVehicleCount: 0,
      confidence: 'low',
      canShowDetourPath: false,
      skippedSegmentPolyline: null,
      likelyDetourPolyline: null,
      geometry: {
        confidence: 'low',
        canShowDetourPath: false,
        lastEvidenceAt: now - 24 * 60 * 60 * 1000,
        segments: [{ confidence: 'low', canShowDetourPath: false }],
      },
    };

    expect(isLowConfidenceValidationOnlyDetour(detour)).toBe(true);
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour,
      vehicles: [{ routeId: '8A' }],
      now,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('gps-clear-required');
    expect(decision.validationOnly).toBeUndefined();
  });
});

describe('detour rider visibility policy', () => {
  const now = Date.parse('2026-04-26T20:00:00Z');

  test('fails safe when schedule and segment-passage evidence are unavailable', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '8A',
      detour: {
        confidence: 'high',
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        canShowDetourPath: false,
        geometry: {
          lastEvidenceAt: now - 24 * 60 * 60 * 1000,
          canShowDetourPath: true,
          segments: [{
            canShowDetourPath: true,
            skippedSegmentPolyline: [
              { latitude: 44.34517, longitude: -79.66986 },
              { latitude: 44.34485, longitude: -79.67219 },
            ],
          }],
          skippedSegmentPolyline: [
            { latitude: 44.34517, longitude: -79.66986 },
            { latitude: 44.34485, longitude: -79.67219 },
          ],
          inferredDetourPolyline: null,
          likelyDetourPolyline: null,
        },
      },
      vehicles: [{ routeId: '8A' }],
      now,
    });

    expect(decision.riderVisible).toBe(true);
    expect(decision.staleForReview).toBe(false);
    expect(decision.reason).toBe('gps-clear-required');
    expect(decision.policySource).toBe('fail-safe');
  });

  test('keeps old evidence visible when the exact route is not reporting', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '8A',
      detour: {
        confidence: 'high',
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        geometry: { lastEvidenceAt: now - 24 * 60 * 60 * 1000 },
      },
      vehicles: [{ routeId: '8B' }],
      now,
    });

    expect(decision.riderVisible).toBe(true);
    expect(decision.staleForReview).toBe(false);
    expect(decision.reason).toBe('gps-clear-required');
  });

  test('keeps renderable Hooper detours rider-visible until GPS clear proof', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '12B',
      detour: {
        confidence: 'high',
        vehicleCount: 5,
        uniqueVehicleCount: 5,
        currentVehicleCount: 0,
        geometry: {
          confidence: 'high',
          canShowDetourPath: true,
          lastEvidenceAt: now - 24 * 60 * 60 * 1000,
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
        },
      },
      vehicles: [],
      now,
    });

    expect(decision.riderVisible).toBe(true);
    expect(decision.staleForReview).toBe(false);
    expect(decision.reason).toBe('gps-clear-required');
  });

  test('keeps backend-suppressed detours hidden until fresh evidence reconfirms them', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '400',
      detour: {
        riderVisible: false,
        riderVisibilityReason: 'stale-sparse-evidence',
        staleForReview: true,
        confidence: 'high',
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        geometry: {
          canShowDetourPath: true,
          lastEvidenceAt: now - 24 * 60 * 60 * 1000,
          inferredDetourPolyline: [
            { latitude: 44.391, longitude: -79.698 },
            { latitude: 44.391, longitude: -79.694 },
          ],
        },
      },
      previousSnapshot: {
        riderVisible: true,
        riderVisibilityReason: 'gps-clear-required',
      },
      vehicles: [],
      now,
    });

    expect(decision.riderVisible).toBe(false);
    expect(decision.staleForReview).toBe(true);
    expect(decision.reason).toBe('stale-sparse-evidence');
  });

  test('keeps explicitly suppressed detours hidden even with current vehicles', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '10',
      detour: {
        riderVisible: false,
        riderVisibilityReason: 'stale-mixed-evidence',
        staleForReview: true,
        confidence: 'high',
        vehicleCount: 5,
        uniqueVehicleCount: 5,
        currentVehicleCount: 5,
        geometry: {
          canShowDetourPath: false,
          segments: [{ geometryTrustBlockedReason: 'stale-mixed-evidence' }],
        },
      },
      now,
    });

    expect(decision.riderVisible).toBe(false);
    expect(decision.staleForReview).toBe(true);
    expect(decision.reason).toBe('stale-mixed-evidence');
  });

  test('keeps detours rider-visible when a vehicle is currently in the detour', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '8A',
      detour: {
        confidence: 'high',
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
        geometry: { lastEvidenceAt: now - 24 * 60 * 60 * 1000 },
      },
      now,
    });

    expect(decision.riderVisible).toBe(true);
    expect(decision.reason).toBe('current-detour-vehicle');
  });

  test('does not let a stale Route 8B event reappear without strictly newer GPS evidence', () => {
    const previousSnapshot = {
      riderVisible: false,
      riderVisibilityReason: 'stale-evidence-awaiting-gps-clear',
      latestGpsEvidenceAt: now - 2 * 60 * 60 * 1000,
      uniqueVehicleCount: 2,
    };
    const decision = evaluateStaleRiderVisibility({
      routeId: '8B',
      detour: {
        latestGpsEvidenceAt: previousSnapshot.latestGpsEvidenceAt,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
      },
      previousSnapshot,
      vehicles: [{ routeId: '8B' }],
      now,
    });

    expect(decision).toMatchObject({
      riderVisible: false,
      staleForReview: true,
      reason: 'stale-evidence-awaiting-gps-clear',
    });
  });

  test('allows a stale Route 8B event to reappear after newer GPS evidence reconfirms it', () => {
    const previousEvidenceAt = now - 2 * 60 * 60 * 1000;
    const decision = evaluateStaleRiderVisibility({
      routeId: '8B',
      detour: {
        latestGpsEvidenceAt: previousEvidenceAt + 1000,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
      },
      previousSnapshot: {
        riderVisible: false,
        riderVisibilityReason: 'stale-evidence-awaiting-gps-clear',
        latestGpsEvidenceAt: previousEvidenceAt,
        uniqueVehicleCount: 2,
      },
      vehicles: [{ routeId: '8B' }],
      now,
    });

    expect(decision).toMatchObject({
      riderVisible: true,
      staleForReview: false,
      reason: 'current-detour-vehicle',
    });
  });

  test('suppresses zero-evidence active detours for riders', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '8A',
      detour: {
        confidence: 'high',
        vehicleCount: 0,
        uniqueVehicleCount: 0,
        currentVehicleCount: 0,
        geometry: { lastEvidenceAt: now - 10 * 60 * 1000 },
      },
      now,
    });

    expect(decision.riderVisible).toBe(false);
    expect(decision.staleForReview).toBe(true);
    expect(decision.reason).toBe('zero-confirmed-vehicle-count');
  });
});

describe('schedule-aware stale rider visibility', () => {
  const shape = [
    { latitude: 44.38, longitude: -79.72 },
    { latitude: 44.38, longitude: -79.71 },
    { latitude: 44.38, longitude: -79.70 },
    { latitude: 44.38, longitude: -79.69 },
  ];
  const shapes = new Map([['8b-shape', shape], ['opposite-shape', [...shape].reverse()]]);
  const calendar = {
    sunday: true,
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    startDate: '20260101',
    endDate: '20261231',
  };

  function makeSchedule({
    starts = [9 * 3600, 10 * 3600, 11 * 3600, 12 * 3600],
    calendarRecord = calendar,
    calendarDates = new Map(),
  } = {}) {
    return {
      timeZone: 'America/Toronto',
      tripsByRouteId: new Map([['8B', starts.map((startTimeSeconds, index) => ({
        tripId: `8b-trip-${index + 1}`,
        routeId: '8B',
        serviceId: 'service',
        directionId: '1',
        shapeId: '8b-shape',
        startTimeSeconds,
        endTimeSeconds: startTimeSeconds + 50 * 60,
      }))]]),
      calendarByServiceId: new Map([['service', calendarRecord]]),
      calendarDatesByServiceId: new Map([['service', calendarDates]]),
    };
  }

  function makeDetour(evidenceAt) {
    return {
      routeId: '8B',
      uniqueVehicleCount: 2,
      currentVehicleCount: 0,
      latestGpsEvidenceAt: evidenceAt,
      eventWindow: {
        shapeId: '8b-shape',
        coreStartProgressMeters: 500,
        coreEndProgressMeters: 1500,
      },
      geometry: {
        lastEvidenceAt: evidenceAt,
        skippedSegmentPolyline: [shape[1], shape[2]],
      },
    };
  }

  function snapshotAfter(detour, decision) {
    return {
      ...detour,
      riderVisible: decision.riderVisible,
      riderVisibilityReason: decision.reason,
      staleVisibilityTracking: decision.staleVisibilityTracking,
      riderVisibilityPolicySource: decision.policySource,
      riderVisibilityMissedOpportunityCount: decision.missedOpportunityCount,
      riderVisibilityActiveServiceAgeMs: decision.activeServiceAgeMs,
      riderVisibilityMaxActiveServiceAgeMs: decision.maxActiveServiceAgeMs,
      riderVisibilityHeadwayMs: decision.headwayMs,
      riderVisibilityDirectionId: decision.directionId,
      riderVisibilityPassageTargetAvailable: decision.passageTargetAvailable,
    };
  }

  function vehicle({
    tripId,
    coordinate,
    timestampMs,
    routeId = '8B',
    directionId = '1',
    tripScheduleRelationship,
  }) {
    return {
      routeId,
      tripId,
      directionId,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      timestamp: Math.floor(timestampMs / 1000),
      tripScheduleRelationship,
    };
  }

  function buildTripMapping(extra = []) {
    return new Map([
      ['8b-trip-1', { routeId: '8B', directionId: 1, shapeId: '8b-shape' }],
      ['8b-trip-2', { routeId: '8B', directionId: 1, shapeId: '8b-shape' }],
      ['8b-trip-3', { routeId: '8B', directionId: 1, shapeId: '8b-shape' }],
      ['8b-trip-4', { routeId: '8B', directionId: 1, shapeId: '8b-shape' }],
      ...extra,
    ]);
  }

  test('does not hide the Blake event when the first Sunday trip has not reached it', () => {
    const now = Date.parse('2026-08-09T13:14:00Z'); // 9:14 AM in Barrie
    const evidenceAt = Date.parse('2026-08-08T22:00:00Z');
    const detour = makeDetour(evidenceAt);
    const scheduleIndex = makeSchedule({
      starts: [9 * 3600 + 11 * 60, 10 * 3600 + 11 * 60, 11 * 3600 + 11 * 60],
    });
    const decision = evaluateStaleRiderVisibility({
      routeId: '8B',
      detour,
      vehicles: [vehicle({ tripId: '8b-trip-1', coordinate: shape[0], timestampMs: now })],
      scheduleIndex,
      shapes,
      tripMapping: buildTripMapping(),
      now,
    });

    expect(decision).toMatchObject({
      riderVisible: true,
      reason: 'gps-clear-required',
      policySource: 'observed-passage-opportunities',
      missedOpportunityCount: 0,
    });
  });

  test('retains details after one missed passage and hides them after two distinct passages', () => {
    const baseNow = Date.parse('2026-08-09T15:00:00Z');
    const evidenceAt = baseNow - 4 * 60 * 60 * 1000;
    const detour = makeDetour(evidenceAt);
    const context = {
      routeId: '8B',
      detour,
      scheduleIndex: makeSchedule(),
      shapes,
      tripMapping: buildTripMapping(),
    };

    let decision = evaluateStaleRiderVisibility({
      ...context,
      vehicles: [vehicle({ tripId: '8b-trip-1', coordinate: shape[0], timestampMs: baseNow })],
      now: baseNow,
    });
    let previousSnapshot = snapshotAfter(detour, decision);
    decision = evaluateStaleRiderVisibility({
      ...context,
      previousSnapshot,
      vehicles: [vehicle({ tripId: '8b-trip-1', coordinate: shape[3], timestampMs: baseNow + 2 * 60 * 1000 })],
      now: baseNow + 2 * 60 * 1000,
    });
    expect(decision).toMatchObject({ riderVisible: true, missedOpportunityCount: 1 });

    previousSnapshot = snapshotAfter(detour, decision);
    decision = evaluateStaleRiderVisibility({
      ...context,
      previousSnapshot,
      vehicles: [vehicle({ tripId: '8b-trip-2', coordinate: shape[0], timestampMs: baseNow + 5 * 60 * 1000 })],
      now: baseNow + 5 * 60 * 1000,
    });
    previousSnapshot = snapshotAfter(detour, decision);
    decision = evaluateStaleRiderVisibility({
      ...context,
      previousSnapshot,
      vehicles: [vehicle({ tripId: '8b-trip-2', coordinate: shape[3], timestampMs: baseNow + 7 * 60 * 1000 })],
      now: baseNow + 7 * 60 * 1000,
    });

    expect(decision).toMatchObject({
      riderVisible: false,
      reason: 'stale-evidence-awaiting-gps-clear',
      policySource: 'observed-passage-opportunities',
      missedOpportunityCount: 2,
    });
  });

  test('does not count Route 8A, opposite-direction, cancelled, or unobserved trips', () => {
    const baseNow = Date.parse('2026-08-09T15:00:00Z');
    const evidenceAt = baseNow - 4 * 60 * 60 * 1000;
    const detour = makeDetour(evidenceAt);
    const tripMapping = buildTripMapping([
      ['8a-trip', { routeId: '8A', directionId: 0, shapeId: '8b-shape' }],
      ['opposite-trip', { routeId: '8B', directionId: 0, shapeId: 'opposite-shape' }],
      ['cancelled-trip', { routeId: '8B', directionId: 1, shapeId: '8b-shape' }],
    ]);
    const context = {
      routeId: '8B',
      detour,
      scheduleIndex: makeSchedule(),
      shapes,
      tripMapping,
    };

    let previousSnapshot = null;
    const invalidPassages = [
      vehicle({ tripId: '8a-trip', routeId: '8A', directionId: '0', coordinate: shape[0], timestampMs: baseNow }),
      vehicle({ tripId: '8a-trip', routeId: '8A', directionId: '0', coordinate: shape[3], timestampMs: baseNow + 60_000 }),
      vehicle({ tripId: 'opposite-trip', directionId: '0', coordinate: shape[0], timestampMs: baseNow + 2 * 60_000 }),
      vehicle({ tripId: 'opposite-trip', directionId: '0', coordinate: shape[3], timestampMs: baseNow + 3 * 60_000 }),
      vehicle({ tripId: 'cancelled-trip', coordinate: shape[0], timestampMs: baseNow + 4 * 60_000, tripScheduleRelationship: 3 }),
      vehicle({ tripId: 'cancelled-trip', coordinate: shape[3], timestampMs: baseNow + 5 * 60_000, tripScheduleRelationship: 3 }),
    ];

    let decision;
    for (const invalidVehicle of invalidPassages) {
      decision = evaluateStaleRiderVisibility({
        ...context,
        previousSnapshot,
        vehicles: [invalidVehicle],
        now: invalidVehicle.timestamp * 1000,
      });
      previousSnapshot = snapshotAfter(detour, decision);
    }
    decision = evaluateStaleRiderVisibility({
      ...context,
      previousSnapshot,
      vehicles: [],
      now: baseNow + 6 * 60_000,
    });

    expect(decision).toMatchObject({ riderVisible: true, missedOpportunityCount: 0 });
  });

  test('does not count far-away GPS points that only project across the segment', () => {
    const baseNow = Date.parse('2026-08-09T15:00:00Z');
    const evidenceAt = baseNow - 4 * 60 * 60 * 1000;
    const detour = makeDetour(evidenceAt);
    const context = {
      routeId: '8B',
      detour,
      scheduleIndex: makeSchedule(),
      shapes,
      tripMapping: buildTripMapping(),
    };

    let decision = evaluateStaleRiderVisibility({
      ...context,
      vehicles: [vehicle({
        tripId: '8b-trip-1',
        coordinate: { latitude: 45.38, longitude: shape[0].longitude },
        timestampMs: baseNow,
      })],
      now: baseNow,
    });
    decision = evaluateStaleRiderVisibility({
      ...context,
      previousSnapshot: snapshotAfter(detour, decision),
      vehicles: [vehicle({
        tripId: '8b-trip-1',
        coordinate: { latitude: 45.38, longitude: shape[3].longitude },
        timestampMs: baseNow + 2 * 60_000,
      })],
      now: baseNow + 2 * 60_000,
    });

    expect(decision).toMatchObject({ riderVisible: true, missedOpportunityCount: 0 });
  });

  test('counts the same scheduled trip id on separate service days as separate passages', () => {
    const evidenceAt = Date.parse('2026-08-08T20:00:00Z');
    const detour = makeDetour(evidenceAt);
    const context = {
      routeId: '8B',
      detour,
      scheduleIndex: makeSchedule(),
      shapes,
      tripMapping: buildTripMapping(),
    };

    const sundayStart = Date.parse('2026-08-09T13:00:00Z');
    let decision = evaluateStaleRiderVisibility({
      ...context,
      vehicles: [vehicle({ tripId: '8b-trip-1', coordinate: shape[0], timestampMs: sundayStart })],
      now: sundayStart,
    });
    decision = evaluateStaleRiderVisibility({
      ...context,
      previousSnapshot: snapshotAfter(detour, decision),
      vehicles: [vehicle({ tripId: '8b-trip-1', coordinate: shape[3], timestampMs: sundayStart + 2 * 60_000 })],
      now: sundayStart + 2 * 60_000,
    });
    expect(decision).toMatchObject({ riderVisible: true, missedOpportunityCount: 1 });

    const mondayStart = Date.parse('2026-08-10T13:00:00Z');
    decision = evaluateStaleRiderVisibility({
      ...context,
      previousSnapshot: snapshotAfter(detour, decision),
      vehicles: [vehicle({ tripId: '8b-trip-1', coordinate: shape[0], timestampMs: mondayStart })],
      now: mondayStart,
    });
    decision = evaluateStaleRiderVisibility({
      ...context,
      previousSnapshot: snapshotAfter(detour, decision),
      vehicles: [vehicle({ tripId: '8b-trip-1', coordinate: shape[3], timestampMs: mondayStart + 2 * 60_000 })],
      now: mondayStart + 2 * 60_000,
    });

    expect(decision).toMatchObject({
      riderVisible: false,
      reason: 'stale-evidence-awaiting-gps-clear',
      missedOpportunityCount: 2,
    });
  });

  test('uses about 130 in-service minutes for an hourly fallback', () => {
    const evidenceAt = Date.parse('2026-08-09T13:00:00Z'); // 9:00 AM
    const detour = makeDetour(evidenceAt);
    const scheduleIndex = makeSchedule();

    const atThreshold = evaluateStaleRiderVisibility({
      routeId: '8B',
      detour,
      scheduleIndex,
      now: Date.parse('2026-08-09T15:10:00Z'),
    });
    const beyondThreshold = evaluateStaleRiderVisibility({
      routeId: '8B',
      detour,
      scheduleIndex,
      now: Date.parse('2026-08-09T15:11:00Z'),
    });

    expect(atThreshold).toMatchObject({
      riderVisible: true,
      policySource: 'active-service-time-fallback',
      activeServiceAgeMs: 130 * 60 * 1000,
      maxActiveServiceAgeMs: 130 * 60 * 1000,
    });
    expect(beyondThreshold).toMatchObject({
      riderVisible: false,
      reason: 'stale-evidence-awaiting-gps-clear',
      activeServiceAgeMs: 131 * 60 * 1000,
      maxActiveServiceAgeMs: 130 * 60 * 1000,
    });
  });

  test('overnight time contributes zero to the fallback clock', () => {
    const evidenceAt = Date.parse('2026-08-09T22:50:00Z'); // Sunday 6:50 PM
    const scheduleIndex = makeSchedule({
      starts: [9 * 3600, 12 * 3600, 15 * 3600, 18 * 3600],
    });
    const decision = evaluateStaleRiderVisibility({
      routeId: '8B',
      detour: makeDetour(evidenceAt),
      scheduleIndex,
      now: Date.parse('2026-08-10T12:59:00Z'), // Monday 8:59 AM
    });

    expect(decision).toMatchObject({
      riderVisible: true,
      policySource: 'active-service-time-fallback',
      activeServiceAgeMs: 0,
    });
  });

  test('honours holiday calendar additions and removals', () => {
    const mondayCalendar = { ...calendar, monday: false };
    const addedSchedule = makeSchedule({
      calendarRecord: mondayCalendar,
      calendarDates: new Map([['20260810', 1]]),
    });
    const addedEvidenceAt = Date.parse('2026-08-10T13:00:00Z');
    const addedDecision = evaluateStaleRiderVisibility({
      routeId: '8B',
      detour: makeDetour(addedEvidenceAt),
      scheduleIndex: addedSchedule,
      now: Date.parse('2026-08-10T15:11:00Z'),
    });

    const removedSchedule = makeSchedule({
      calendarDates: new Map([['20260809', 2]]),
    });
    const removedEvidenceAt = Date.parse('2026-08-09T13:00:00Z');
    const removedDecision = evaluateStaleRiderVisibility({
      routeId: '8B',
      detour: makeDetour(removedEvidenceAt),
      scheduleIndex: removedSchedule,
      now: Date.parse('2026-08-09T15:11:00Z'),
    });

    expect(addedDecision.riderVisible).toBe(false);
    expect(addedDecision.activeServiceAgeMs).toBe(131 * 60 * 1000);
    expect(removedDecision).toMatchObject({ riderVisible: true, policySource: 'fail-safe' });
  });

  test('counts post-DST service minutes by the Barrie service day', () => {
    const evidenceAt = Date.parse('2026-03-08T13:00:00Z'); // 9:00 AM after spring-forward
    const decision = evaluateStaleRiderVisibility({
      routeId: '8B',
      detour: makeDetour(evidenceAt),
      scheduleIndex: makeSchedule(),
      now: Date.parse('2026-03-08T15:11:00Z'),
    });

    expect(decision).toMatchObject({
      riderVisible: false,
      activeServiceAgeMs: 131 * 60 * 1000,
    });
  });

  test('missing schedule data keeps the event visible', () => {
    const now = Date.parse('2026-08-09T15:11:00Z');
    const decision = evaluateStaleRiderVisibility({
      routeId: '8B',
      detour: makeDetour(now - 24 * 60 * 60 * 1000),
      scheduleIndex: null,
      now,
    });

    expect(decision).toMatchObject({
      riderVisible: true,
      policySource: 'fail-safe',
    });
  });
});
