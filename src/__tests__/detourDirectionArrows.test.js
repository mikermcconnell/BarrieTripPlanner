const {
  getDirectionArrowPoints,
  getDirectionalArrowPoints,
} = require('../utils/detourDirectionArrows');

const EAST_WEST_PATH = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 1 },
];

describe('detour direction arrows', () => {
  test('keeps existing forward-only arrow behavior by default', () => {
    const arrows = getDirectionArrowPoints(EAST_WEST_PATH, 1);

    expect(arrows).toHaveLength(1);
    expect(Math.round(arrows[0].bearing)).toBe(90);
  });

  test('returns forward and reverse arrows for bidirectional detours', () => {
    const arrows = getDirectionalArrowPoints(EAST_WEST_PATH, {
      mode: 'both',
      arrowCount: 1,
    });

    expect(arrows).toHaveLength(2);
    expect(arrows.map((arrow) => arrow.direction)).toEqual(['forward', 'reverse']);
    expect(arrows.map((arrow) => Math.round(arrow.bearing))).toEqual([90, 270]);
  });

  test('offsets bidirectional arrows to opposite sides of the detour path', () => {
    const arrows = getDirectionalArrowPoints(EAST_WEST_PATH, {
      mode: 'both',
      arrowCount: 1,
      bidirectionalOffsetMeters: 7,
    });

    const [forward, reverse] = arrows;

    expect(forward.point.longitude).toBeCloseTo(0.5, 4);
    expect(reverse.point.longitude).toBeCloseTo(0.5, 4);
    expect(forward.point.latitude).toBeLessThan(0);
    expect(reverse.point.latitude).toBeGreaterThan(0);
  });

  test('returns no arrows when mode is none', () => {
    expect(getDirectionalArrowPoints(EAST_WEST_PATH, { mode: 'none' })).toEqual([]);
  });
});
