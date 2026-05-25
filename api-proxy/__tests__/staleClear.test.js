const {
  shouldAutoClearStaleDetour,
  computeStaleThresholdMs,
  routeFamilyHasRecentVehicle,
  evaluateStaleRiderVisibility,
} = require('../detour/staleClear');

function makeScheduleIndex() {
  return {
    timeZone: 'America/Toronto',
    tripsByRouteId: new Map([
      ['8A', [
        { tripId: '8a-1', routeId: '8A', serviceId: 'svc', startTimeSeconds: 15 * 3600 },
        { tripId: '8a-2', routeId: '8A', serviceId: 'svc', startTimeSeconds: 16 * 3600 },
        { tripId: '8a-3', routeId: '8A', serviceId: 'svc', startTimeSeconds: 17 * 3600 },
      ]],
    ]),
    calendarByServiceId: new Map([
      ['svc', {
        monday: false,
        tuesday: false,
        wednesday: false,
        thursday: false,
        friday: false,
        saturday: false,
        sunday: true,
        startDate: '20260401',
        endDate: '20260430',
      }],
    ]),
    calendarDatesByServiceId: new Map(),
  };
}

describe('stale detour auto-clear policy', () => {
  const sundayAt4pmEt = Date.parse('2026-04-26T20:00:00Z');

  test('uses route-family vehicles for branch routes like 8A and 8B', () => {
    expect(routeFamilyHasRecentVehicle('8A', [{ routeId: '8B' }])).toBe(true);
    expect(routeFamilyHasRecentVehicle('8A', [{ routeId: '10' }])).toBe(false);
  });

  test('extends stale threshold for 60-minute Sunday service', () => {
    const result = computeStaleThresholdMs('8A', makeScheduleIndex(), sundayAt4pmEt);

    expect(result.headwayMs).toBe(60 * 60 * 1000);
    expect(result.thresholdMs).toBe(130 * 60 * 1000);
    expect(result.scheduleSource).toBe('exact-route');
  });

  test('does not clear before two scheduled headways have passed', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: { geometry: { lastEvidenceAt: sundayAt4pmEt - 90 * 60 * 1000 } },
      vehicles: [{ routeId: '8B' }],
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('fresh-enough');
  });

  test('does not clear stale detours after the headway-aware threshold without normal-route GPS proof', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: { geometry: { lastEvidenceAt: sundayAt4pmEt - 140 * 60 * 1000 } },
      vehicles: [{ routeId: '8B' }],
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('gps-clear-required');
    expect(decision.staleAgeMs).toBe(140 * 60 * 1000);
    expect(decision.thresholdMs).toBe(130 * 60 * 1000);
  });

  test('does not clear detector-owned zero-current-vehicle detours before the headway-aware threshold', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: {
        detectedAt: sundayAt4pmEt - 20 * 60 * 1000,
        vehicleCount: 1,
        uniqueVehicleCount: 1,
        currentVehicleCount: 0,
        geometry: { lastEvidenceAt: sundayAt4pmEt - 13 * 60 * 1000 },
      },
      vehicles: [{ routeId: '8B' }],
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('fresh-enough');
  });

  test('does not clear retained zero-current-vehicle detours without normal-route GPS proof', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: {
        detectedAt: sundayAt4pmEt - 3 * 60 * 60 * 1000,
        vehicleCount: 1,
        uniqueVehicleCount: 1,
        currentVehicleCount: 0,
        geometry: { lastEvidenceAt: sundayAt4pmEt - 140 * 60 * 1000 },
      },
      vehicles: [{ routeId: '8B' }],
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('gps-clear-required');
    expect(decision.staleAgeMs).toBe(140 * 60 * 1000);
    expect(decision.thresholdMs).toBe(130 * 60 * 1000);
  });

  test('does not clear stale low-confidence validation-only detours without normal-route GPS proof', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: {
        detectedAt: sundayAt4pmEt - 3 * 60 * 60 * 1000,
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
          lastEvidenceAt: sundayAt4pmEt - 70 * 60 * 1000,
          segments: [{
            confidence: 'low',
            canShowDetourPath: false,
            skippedSegmentPolyline: null,
            likelyDetourPolyline: null,
          }],
        },
      },
      vehicles: [],
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('gps-clear-required');
    expect(decision.staleAgeMs).toBe(70 * 60 * 1000);
    expect(decision.thresholdMs).toBe(60 * 60 * 1000);
  });

  test('does not clear current validation-only detours because stale trusted geometry exists', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: {
        detectedAt: sundayAt4pmEt - 3 * 60 * 60 * 1000,
        vehicleCount: 1,
        uniqueVehicleCount: 1,
        currentVehicleCount: 0,
        geometry: {
          confidence: 'low',
          canShowDetourPath: false,
          lastEvidenceAt: sundayAt4pmEt - 70 * 60 * 1000,
          segments: [{
            confidence: 'low',
            canShowDetourPath: false,
            inferredDetourPolyline: [
              { latitude: 44.39, longitude: -79.69 },
              { latitude: 44.40, longitude: -79.68 },
            ],
          }],
        },
      },
      previousSnapshot: {
        confidence: 'medium',
        canShowDetourPath: true,
        likelyDetourPolyline: [
          { latitude: 44.391, longitude: -79.691 },
          { latitude: 44.392, longitude: -79.692 },
        ],
        segments: [{
          confidence: 'medium',
          canShowDetourPath: true,
          likelyDetourPolyline: [
            { latitude: 44.391, longitude: -79.691 },
            { latitude: 44.392, longitude: -79.692 },
          ],
        }],
      },
      vehicles: [],
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('gps-clear-required');
  });

  test('does not clear when no route-family vehicles are currently reporting', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: { geometry: { lastEvidenceAt: sundayAt4pmEt - 140 * 60 * 1000 } },
      vehicles: [{ routeId: '10' }],
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('no-recent-route-family-vehicle');
  });

  test('does not clear during times with no scheduled service', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: { geometry: { lastEvidenceAt: sundayAt4pmEt - 4 * 60 * 60 * 1000 } },
      vehicles: [{ routeId: '8A' }],
      scheduleIndex: {
        timeZone: 'America/Toronto',
        tripsByRouteId: new Map(),
        calendarByServiceId: new Map(),
        calendarDatesByServiceId: new Map(),
      },
      now: sundayAt4pmEt,
    });

    expect(decision.shouldClear).toBe(false);
    expect(decision.reason).toBe('no-scheduled-service');
  });
});


describe('stale rider visibility policy', () => {
  const sundayAt4pmEt = Date.parse('2026-04-26T20:00:00Z');

  test('keeps zero-current detours rider-visible before the headway-aware threshold', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '8A',
      detour: {
        confidence: 'high',
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        geometry: { lastEvidenceAt: sundayAt4pmEt - 90 * 60 * 1000 },
      },
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.riderVisible).toBe(true);
    expect(decision.staleForReview).toBe(false);
    expect(decision.reason).toBe('fresh-enough');
    expect(decision.thresholdMs).toBe(130 * 60 * 1000);
  });



  test('keeps stale detours rider-visible while route-family vehicles are currently reporting', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '8A',
      detour: {
        confidence: 'high',
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        geometry: { lastEvidenceAt: sundayAt4pmEt - 140 * 60 * 1000 },
      },
      vehicles: [{ routeId: '8B' }],
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.riderVisible).toBe(true);
    expect(decision.staleForReview).toBe(true);
    expect(decision.reason).toBe('current-route-family-vehicle');
    expect(decision.staleAgeMs).toBe(140 * 60 * 1000);
    expect(decision.thresholdMs).toBe(130 * 60 * 1000);
  });

  test('suppresses zero-current detours for riders after the headway-aware threshold', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '8A',
      detour: {
        confidence: 'high',
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        geometry: { lastEvidenceAt: sundayAt4pmEt - 140 * 60 * 1000 },
      },
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.riderVisible).toBe(false);
    expect(decision.staleForReview).toBe(true);
    expect(decision.reason).toBe('stale-evidence-gps-clear-required');
    expect(decision.staleAgeMs).toBe(140 * 60 * 1000);
    expect(decision.thresholdMs).toBe(130 * 60 * 1000);
    expect(decision.headwayMs).toBe(60 * 60 * 1000);
  });

  test('keeps detours rider-visible when a vehicle is currently in the detour', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '8A',
      detour: {
        confidence: 'high',
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 1,
        geometry: { lastEvidenceAt: sundayAt4pmEt - 140 * 60 * 1000 },
      },
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
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
        geometry: { lastEvidenceAt: sundayAt4pmEt - 10 * 60 * 1000 },
      },
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.riderVisible).toBe(false);
    expect(decision.staleForReview).toBe(true);
    expect(decision.reason).toBe('zero-confirmed-vehicle-count');
  });

  test('keeps zero-evidence branch detours visible while sibling route-family vehicles are reporting', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '8A',
      detour: {
        confidence: 'high',
        vehicleCount: 0,
        uniqueVehicleCount: 0,
        currentVehicleCount: 0,
        geometry: { lastEvidenceAt: sundayAt4pmEt - 10 * 60 * 1000 },
      },
      vehicles: [{ routeId: '8B' }],
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.riderVisible).toBe(true);
    expect(decision.staleForReview).toBe(false);
    expect(decision.reason).toBe('current-route-family-vehicle');
  });

  test('pauses stale rider suppression when no service is scheduled', () => {
    const decision = evaluateStaleRiderVisibility({
      routeId: '8A',
      detour: {
        confidence: 'high',
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 0,
        geometry: { lastEvidenceAt: sundayAt4pmEt - 4 * 60 * 60 * 1000 },
      },
      scheduleIndex: {
        timeZone: 'America/Toronto',
        tripsByRouteId: new Map(),
        calendarByServiceId: new Map(),
        calendarDatesByServiceId: new Map(),
      },
      now: sundayAt4pmEt,
    });

    expect(decision.riderVisible).toBe(true);
    expect(decision.reason).toBe('no-scheduled-service');
  });
});
