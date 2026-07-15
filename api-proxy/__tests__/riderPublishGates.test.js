const {
  buildRiderPublishGates,
} = require('../detour/riderPublishGates');

describe('rider publish gates', () => {
  test('explains the public fields for a rider-visible detour with a trusted path and skipped stops', () => {
    const gates = buildRiderPublishGates({
      routeId: '12B',
      riderVisible: true,
      riderVisibilityReason: 'gps-clear-required',
      uniqueVehicleCount: 2,
      currentVehicleCount: 1,
      evidencePointCount: 4,
      canShowDetourPath: true,
      inferredDetourPolyline: [
        { latitude: 44.3330, longitude: -79.6736 },
        { latitude: 44.3371, longitude: -79.6693 },
      ],
      clearReason: null,
      segments: [{
        canShowDetourPath: true,
        skippedStopIds: ['618'],
        skippedStops: [{ id: '618', code: '618' }],
        inferredDetourPolyline: [
          { latitude: 44.3330, longitude: -79.6736 },
          { latitude: 44.3371, longitude: -79.6693 },
        ],
      }],
    });

    expect(gates).toMatchObject({
      detour: {
        passed: true,
        reason: 'confirmed-multi-vehicle-evidence',
      },
      riderAlert: {
        passed: true,
        reason: 'gps-clear-required',
      },
      likelyPath: {
        passed: true,
        reason: 'trusted-renderable-path',
      },
      skippedStops: {
        passed: true,
        reason: 'explicit-route-scoped-skipped-stops',
      },
      clear: {
        passed: false,
        reason: 'awaiting-normal-route-gps-proof',
      },
    });
  });

  test('keeps a confirmed alert public while geometry and stop details remain unavailable', () => {
    const gates = buildRiderPublishGates({
      routeId: '10',
      riderVisible: false,
      riderVisibilityReason: 'insufficient-geometry',
      alertVisible: true,
      alertVisibilityReason: 'active-detour-details-unavailable',
      uniqueVehicleCount: 2,
      currentVehicleCount: 0,
      canShowDetourPath: false,
      segments: [],
    });

    expect(gates).toMatchObject({
      detour: {
        passed: true,
        reason: 'confirmed-multi-vehicle-evidence',
      },
      riderAlert: {
        passed: true,
        reason: 'active-detour-details-unavailable',
      },
      likelyPath: {
        passed: false,
        reason: 'path-not-trusted',
      },
      skippedStops: {
        passed: false,
        reason: 'no-explicit-skipped-stops',
      },
    });
  });

  test('marks normal-route GPS clear proof separately from rider visibility', () => {
    const gates = buildRiderPublishGates({
      routeId: '8A',
      riderVisible: true,
      clearReason: 'normal-route-observed',
    });

    expect(gates.clear).toEqual({
      passed: true,
      reason: 'normal-route-observed',
    });
  });
});
