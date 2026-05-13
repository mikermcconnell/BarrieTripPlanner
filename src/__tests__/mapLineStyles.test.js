import {
  BUS_APPROACH_LINE_CAP,
  BUS_APPROACH_LINE_DASH_PATTERN,
  BUS_APPROACH_LINE_OPACITY,
  BUS_APPROACH_LINE_OUTLINE_COLOR,
  BUS_APPROACH_LINE_OUTLINE_WIDTH,
  BUS_APPROACH_LINE_STROKE_WIDTH,
  ROUTE_LINE_CONTEXT_OPACITY,
  ROUTE_LINE_MUTED_COLOR,
  ROUTE_LINE_MUTED_OPACITY,
  ROUTE_LINE_OUTLINE_COLOR,
  ROUTE_LINE_WIDTH_SCALE,
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

  test('route line polish uses white halos and soft muted context lines', () => {
    expect(ROUTE_LINE_OUTLINE_COLOR).toBe('#FFFFFF');
    expect(ROUTE_LINE_MUTED_COLOR).toBe('#B6C0CC');
    expect(ROUTE_LINE_MUTED_OPACITY).toBeGreaterThanOrEqual(0.3);
    expect(ROUTE_LINE_CONTEXT_OPACITY).toBeGreaterThan(ROUTE_LINE_MUTED_OPACITY);
    expect(ROUTE_LINE_CONTEXT_OPACITY).toBeGreaterThanOrEqual(0.4);
    expect(ROUTE_LINE_WIDTH_SCALE).toBe(1.5);
  });
});
