const { __TEST_ONLY__ } = require('../hooks/useAnimatedBusPosition');

describe('useAnimatedBusPosition bearing resolution', () => {
  test('prefers route snapped bearing when feed bearing is perpendicular to the route', () => {
    const bearing = __TEST_ONLY__.resolveTargetBearing({
      currentBearing: null,
      vehicle: { bearing: 0, speed: 8 },
      snappedBearing: 90,
    });

    expect(bearing).toBe(90);
  });

  test('keeps feed bearing when it is opposite the snapped route direction', () => {
    const bearing = __TEST_ONLY__.resolveTargetBearing({
      currentBearing: null,
      vehicle: { bearing: 270, speed: 8 },
      snappedBearing: 90,
    });

    expect(bearing).toBe(270);
  });

  test('uses snapped route bearing for an initial stopped bus when feed bearing is perpendicular', () => {
    const bearing = __TEST_ONLY__.resolveTargetBearing({
      currentBearing: null,
      vehicle: { bearing: 180, speed: 0 },
      snappedBearing: 90,
    });

    expect(bearing).toBe(90);
  });

  test('prefers real movement bearing over stale feed bearing and opposite route bearing', () => {
    const bearing = __TEST_ONLY__.resolveTargetBearing({
      currentBearing: null,
      vehicle: { bearing: 0, speed: 8 },
      snappedBearing: 90,
      movementBearing: 270,
    });

    expect(bearing).toBe(270);
  });

  test('uses movement bearing even when it conflicts with the snapped route', () => {
    const bearing = __TEST_ONLY__.resolveTargetBearing({
      currentBearing: null,
      vehicle: { bearing: 90, speed: 8 },
      snappedBearing: 90,
      movementBearing: 0,
    });

    expect(bearing).toBe(0);
  });

  test('uses a changed feed bearing when speed is missing from the live feed', () => {
    const bearing = __TEST_ONLY__.resolveTargetBearing({
      currentBearing: 0,
      vehicle: { bearing: 147.53, speed: null },
      snappedBearing: null,
      movementBearing: null,
    });

    expect(bearing).toBeCloseTo(147.53, 2);
  });

  test('does not derive movement bearing from tiny GPS drift', () => {
    const movementBearing = __TEST_ONLY__.resolveMovementBearing(
      { latitude: 44.389, longitude: -79.69 },
      { latitude: 44.38901, longitude: -79.69 }
    );

    expect(movementBearing).toBeNull();
  });
});
