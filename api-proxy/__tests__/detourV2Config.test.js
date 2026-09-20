'use strict';

describe('Auto Detour V2 environment safety thresholds', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      DETOUR_CONSECUTIVE_READINGS: '5',
      DETOUR_MIN_UNIQUE_VEHICLES: '4',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  test('honors stricter configured confirmation requirements', () => {
    const { createDetourV2Detector } = require('../detourV2/detector');
    const detector = createDetourV2Detector({ enforceServiceHours: false });
    const shapes = new Map([['shape-1', [
      { latitude: 44.39, longitude: -79.70 },
      { latitude: 44.39, longitude: -79.68 },
    ]]]);

    detector.processVehicles([{
      id: 'bus-1',
      routeId: '8A',
      tripId: 'trip-1',
      coordinate: { latitude: 44.395, longitude: -79.69 },
      timestampMs: 1000,
    }], shapes, new Map([['8A', ['shape-1']]]));

    expect(detector.getState().candidateEvidence['8A']).toEqual(expect.objectContaining({
      requiredPointCount: 5,
      requiredConfirmingSignatureCount: 4,
    }));
  });
});
