const {
  evaluateAutoBoardConfidence,
  evaluateAutoAlightConfidence,
  evaluateBoardingBusDepartureStatus,
  getBoardingStopThresholdMeters,
  getUserVehicleThresholdMeters,
  shouldTreatBusAsArrivedAtBoarding,
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

  test('shows a soft at-stop status when a real-time bus is near the boarding stop', () => {
    const result = evaluateBoardingBusDepartureStatus({
      hasArrived: true,
      matchQuality: 'trip_id',
      vehicleStopDistance: 28,
    });

    expect(result.status).toBe('at_stop');
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  test('warns when the matched real-time bus was at the stop and then moves away', () => {
    const result = evaluateBoardingBusDepartureStatus({
      hasArrived: true,
      locationAccuracy: 18,
      matchQuality: 'trip_id',
      previousSnapshot: {
        vehicleCorridorProgress: 4,
        vehicleStopDistance: 34,
      },
      vehicleCorridorDistance: 12,
      vehicleCorridorProgress: 64,
      vehicleStopDistance: 122,
    });

    expect(result.status).toBe('likely_departed');
    expect(result.confidence).toBeGreaterThanOrEqual(0.72);
    expect(result.signals.vehicleDepartedStop).toBe(true);
    expect(result.signals.vehicleProgressingAlongCorridor).toBe(true);
  });

  test('does not warn on route-nearest matches because the vehicle identity is uncertain', () => {
    const result = evaluateBoardingBusDepartureStatus({
      matchQuality: 'route_nearest',
      previousSnapshot: {
        vehicleCorridorProgress: 4,
        vehicleStopDistance: 34,
      },
      vehicleCorridorDistance: 12,
      vehicleCorridorProgress: 64,
      vehicleStopDistance: 122,
    });

    expect(result.status).toBe('none');
  });

  test('does not show bus-is-here when the matched bus is downstream but departure is still far away', () => {
    const nowMs = new Date('2026-05-01T12:00:00Z').getTime();

    expect(shouldTreatBusAsArrivedAtBoarding({
      matchQuality: 'trip_id',
      nowMs,
      scheduledDeparture: nowMs + 12 * 60 * 1000,
      stopsAway: 0,
      vehicleStopDistance: 240,
    })).toBe(false);
  });

  test('shows bus-is-here when the scheduled boarding time is within one minute', () => {
    const nowMs = new Date('2026-05-01T12:00:00Z').getTime();

    expect(shouldTreatBusAsArrivedAtBoarding({
      matchQuality: 'trip_id',
      nowMs,
      scheduledDeparture: nowMs + 60 * 1000,
      stopsAway: 0,
      vehicleStopDistance: 240,
    })).toBe(true);
  });

  test('shows bus-is-here when the vehicle is physically at the boarding stop', () => {
    const nowMs = new Date('2026-05-01T12:00:00Z').getTime();

    expect(shouldTreatBusAsArrivedAtBoarding({
      matchQuality: 'route_nearest',
      nowMs,
      scheduledDeparture: nowMs + 12 * 60 * 1000,
      stopsAway: 0,
      vehicleStopDistance: 32,
    })).toBe(true);
  });
});
