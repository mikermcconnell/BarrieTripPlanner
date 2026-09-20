import {
  buildHomeVehicleMotionPath,
  getHomeVehicleAnimationDuration,
  getHomeVehicleMovementBearing,
  inferHomeVehicleBearings,
  interpolateHomeVehicleBearing,
  interpolateHomeVehicleMotionPath,
  interpolateHomeVehicles,
} from '../utils/homeVehicleInterpolation';

describe('home vehicle interpolation', () => {
  test('infers a direction from consecutive positions when the feed omits bearing', () => {
    expect(getHomeVehicleMovementBearing(
      { latitude: 44.39, longitude: -79.69 },
      { latitude: 44.391, longitude: -79.69 }
    )).toBeCloseTo(0, 1);

    const vehicles = inferHomeVehicleBearings({
      fromVehicles: [{ id: 'bus-1', coordinate: { latitude: 44.39, longitude: -79.69 } }],
      toVehicles: [{ id: 'bus-1', coordinate: { latitude: 44.391, longitude: -79.69 } }],
    });
    expect(vehicles[0].bearing).toBeCloseTo(0, 1);
  });

  test('preserves feed and prior inferred bearings when movement cannot determine one', () => {
    const coordinate = { latitude: 44.39, longitude: -79.69 };
    const [withFeedBearing, withPriorBearing, withoutBearing] = inferHomeVehicleBearings({
      fromVehicles: [
        { id: 'prior', bearing: 92, coordinate },
        { id: 'unknown', coordinate },
      ],
      toVehicles: [
        { id: 'feed', bearing: 180, coordinate },
        { id: 'prior', bearing: null, coordinate },
        { id: 'unknown', bearing: '', coordinate },
      ],
    });

    expect(withFeedBearing.bearing).toBe(180);
    expect(withPriorBearing.bearing).toBe(92);
    expect(withoutBearing.bearing).toBe('');
  });

  test('interpolates the fleet with one shared progress value', () => {
    const result = interpolateHomeVehicles({
      fromVehicles: [{ id: 'a', coordinate: { latitude: 44, longitude: -79 } }],
      toVehicles: [{ id: 'a', routeId: '400', coordinate: { latitude: 46, longitude: -81 } }],
      progress: 0.5,
    });
    expect(result[0].coordinate).toEqual({ latitude: 45, longitude: -80 });
    expect(result[0].routeId).toBe('400');
  });

  test('follows the route around a corner instead of cutting diagonally', () => {
    const fromCoordinate = { latitude: 44, longitude: -79 };
    const toCoordinate = { latitude: 44.001, longitude: -78.999 };
    const motionPath = buildHomeVehicleMotionPath({
      fromCoordinate,
      toCoordinate,
      snapPath: [
        fromCoordinate,
        { latitude: 44, longitude: -78.999 },
        toCoordinate,
      ],
    });
    const halfway = interpolateHomeVehicleMotionPath(motionPath, 0.5);

    expect(motionPath.length).toBeGreaterThan(2);
    expect(halfway.longitude).toBeCloseTo(-78.999, 5);
    expect(halfway.latitude).toBeGreaterThan(44);
    expect(halfway.latitude).toBeLessThan(44.00025);
  });

  test('falls back to direct movement when GPS is too far from the route', () => {
    const fromCoordinate = { latitude: 44, longitude: -79 };
    const toCoordinate = { latitude: 44.001, longitude: -78.999 };
    const motionPath = buildHomeVehicleMotionPath({
      fromCoordinate,
      toCoordinate,
      snapPath: [
        { latitude: 45, longitude: -80 },
        { latitude: 45.001, longitude: -80 },
      ],
    });

    expect(motionPath).toEqual([fromCoordinate, toCoordinate]);
  });

  test('rotates bearings over the shortest arc', () => {
    expect(interpolateHomeVehicleBearing(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(interpolateHomeVehicleBearing(10, 350, 0.5)).toBeCloseTo(0, 5);
  });

  test('clamps animation duration to safe bounds', () => {
    expect(getHomeVehicleAnimationDuration(100)).toBe(2000);
    expect(getHomeVehicleAnimationDuration(15_000)).toBe(15_750);
    expect(getHomeVehicleAnimationDuration(20_000)).toBe(17_000);
  });
});
