import { shouldRenderRouteShape } from '../utils/detourFocusUtils';

describe('shouldRenderRouteShape', () => {
  test('renders all shapes when detour focus is inactive', () => {
    expect(shouldRenderRouteShape({
      routeId: '100',
      hasDetourFocus: false,
      focusedDetourRouteId: '100',
    })).toBe(true);

    expect(shouldRenderRouteShape({
      routeId: '101',
      hasDetourFocus: false,
      focusedDetourRouteId: null,
    })).toBe(true);
  });

  test('keeps the focused route corridor visible in focused detour mode', () => {
    expect(shouldRenderRouteShape({
      routeId: '100',
      hasDetourFocus: true,
      focusedDetourRouteId: '100',
    })).toBe(true);
  });

  test('hides overlapping corridors from other routes in focused detour mode', () => {
    expect(shouldRenderRouteShape({
      routeId: '101',
      hasDetourFocus: true,
      focusedDetourRouteId: '100',
    })).toBe(false);
  });

  test('matches route ids across string and numeric forms', () => {
    expect(shouldRenderRouteShape({
      routeId: 100,
      hasDetourFocus: true,
      focusedDetourRouteId: '100',
    })).toBe(true);
  });
});
