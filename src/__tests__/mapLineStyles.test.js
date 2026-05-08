import {
  BUS_APPROACH_LINE_CAP,
  BUS_APPROACH_LINE_DASH_PATTERN,
  BUS_APPROACH_LINE_OPACITY,
  BUS_APPROACH_LINE_OUTLINE_COLOR,
  BUS_APPROACH_LINE_OUTLINE_WIDTH,
  BUS_APPROACH_LINE_STROKE_WIDTH,
} from '../config/mapLineStyles';

describe('map line styles', () => {
  test('bus approach line is strong enough to read over a solid trip route', () => {
    expect(BUS_APPROACH_LINE_DASH_PATTERN).toEqual([8, 7]);
    expect(BUS_APPROACH_LINE_STROKE_WIDTH).toBe(5);
    expect(BUS_APPROACH_LINE_OUTLINE_COLOR).toBe('#FFFFFF');
    expect(BUS_APPROACH_LINE_OUTLINE_WIDTH).toBe(2);
    expect(BUS_APPROACH_LINE_CAP).toBe('butt');
    expect(BUS_APPROACH_LINE_OPACITY).toBeGreaterThanOrEqual(0.9);
  });
});
