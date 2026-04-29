const {
  shouldAutoClearStaleDetour,
  computeStaleThresholdMs,
  routeFamilyHasRecentVehicle,
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

  test('clears stale detours after the headway-aware threshold when vehicles are live', () => {
    const decision = shouldAutoClearStaleDetour({
      routeId: '8A',
      detour: { geometry: { lastEvidenceAt: sundayAt4pmEt - 140 * 60 * 1000 } },
      vehicles: [{ routeId: '8B' }],
      scheduleIndex: makeScheduleIndex(),
      now: sundayAt4pmEt,
    });

    expect(decision.shouldClear).toBe(true);
    expect(decision.reason).toBe('stale-evidence-with-live-route-family-vehicles');
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
