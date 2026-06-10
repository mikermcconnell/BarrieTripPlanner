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

  test('keeps confirmed zero-current detours rider-visible no matter how old the evidence is', () => {
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
          canShowDetourPath: false,
          segments: [],
          skippedSegmentPolyline: null,
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
