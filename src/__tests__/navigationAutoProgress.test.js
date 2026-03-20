const {
  evaluateAutoBoardConfidence,
  evaluateAutoAlightConfidence,
  getBoardingStopThresholdMeters,
  getUserVehicleThresholdMeters,
} = require('../utils/navigationAutoProgress');

describe('navigationAutoProgress', () => {
  test('requires high-confidence multi-signal evidence before auto-boarding', () => {
    const result = evaluateAutoBoardConfidence({
      hasArrived: true,
      locationAccuracy: 14,
      matchQuality: 'trip_id',
      previousSnapshot: {
        userCorridorProgress: 210,
        userStopDistance: 18,
        vehicleCorridorProgress: 240,
        vehicleStopDistance: 22,
      },
      userCorridorDistance: 18,
      userCorridorProgress: 236,
      userSpeed: 3.4,
      userStopDistance: 72,
      userVehicleDistance: 24,
      vehicleCorridorDistance: 12,
      vehicleCorridorProgress: 278,
      vehicleStopDistance: 108,
    });

    expect(result.eligible).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.72);
    expect(result.signals.vehicleDepartedStop).toBe(true);
    expect(result.signals.userLeavingStop).toBe(true);
    expect(result.signals.closeToVehicle).toBe(true);
  });

  test('blocks auto-boarding when GPS accuracy is poor even if the bus has arrived', () => {
    const result = evaluateAutoBoardConfidence({
      hasArrived: true,
      locationAccuracy: 72,
      matchQuality: 'trip_id',
      previousSnapshot: {
        userCorridorProgress: 210,
        userStopDistance: 22,
        vehicleCorridorProgress: 238,
        vehicleStopDistance: 24,
      },
      userCorridorDistance: 20,
      userCorridorProgress: 236,
      userSpeed: 3.1,
      userStopDistance: 70,
      userVehicleDistance: 20,
      vehicleCorridorDistance: 16,
      vehicleCorridorProgress: 276,
      vehicleStopDistance: 100,
    });

    expect(result.eligible).toBe(false);
    expect(result.signals.highAccuracy).toBe(false);
  });

  test('requires stop-ready and stable near-stop evidence before auto-alighting', () => {
    const result = evaluateAutoAlightConfidence({
      distanceToAlighting: 18,
      locationAccuracy: 12,
      nearAlightingStop: true,
      previousSnapshot: {
        distanceToAlighting: 20,
        userCorridorDistance: 14,
        userCorridorProgress: 1460,
      },
      stopsUntilAlighting: 0,
      userCorridorDistance: 16,
      userCorridorProgress: 1468,
      userSpeed: 2.8,
    });

    expect(result.eligible).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.72);
    expect(result.signals.atStop).toBe(true);
    expect(result.signals.stopCountReady).toBe(true);
  });

  test('threshold helpers scale with accuracy but stay bounded', () => {
    expect(getBoardingStopThresholdMeters(5)).toBe(35);
    expect(getBoardingStopThresholdMeters(80)).toBe(70);
    expect(getUserVehicleThresholdMeters(10)).toBe(50);
    expect(getUserVehicleThresholdMeters(80)).toBe(90);
  });
});
