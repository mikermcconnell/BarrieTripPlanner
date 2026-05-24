import { shouldKeepHiddenRouteShapeLayerMounted, shouldRenderRouteShape } from '../utils/detourFocusUtils';

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

  test('keeps sibling variant corridors visible in focused detour mode', () => {
    expect(shouldRenderRouteShape({
      routeId: '12A',
      hasDetourFocus: true,
      focusedDetourRouteId: '12B',
    })).toBe(true);
  });

  test('matches route ids across string and numeric forms', () => {
    expect(shouldRenderRouteShape({
      routeId: 100,
      hasDetourFocus: true,
      focusedDetourRouteId: '100',
    })).toBe(true);
  });

  test('keeps detouring route corridors visible in detour view so before/after routing remains visible', () => {
    expect(shouldRenderRouteShape({
      routeId: '10',
      activeDetourRouteIds: new Set(['10']),
      isDetourView: true,
      hasDetourFocus: false,
      focusedDetourRouteId: null,
    })).toBe(true);

    expect(shouldRenderRouteShape({
      routeId: '11',
      activeDetourRouteIds: new Set(['10']),
      isDetourView: true,
      hasDetourFocus: false,
      focusedDetourRouteId: null,
    })).toBe(true);
  });

  test('treats base route corridors as detouring when a variant is on detour', () => {
    expect(shouldKeepHiddenRouteShapeLayerMounted({
      routeId: '8',
      activeDetourRouteIds: new Set(['8A', '8B']),
      isDetourView: true,
    })).toBe(true);
  });

  test('keeps hidden detouring route layers mounted in detour view to prevent stale native lines', () => {
    expect(shouldKeepHiddenRouteShapeLayerMounted({
      routeId: '8',
      activeDetourRouteIds: new Set(['8A', '8B']),
      isDetourView: true,
    })).toBe(true);

    expect(shouldKeepHiddenRouteShapeLayerMounted({
      routeId: '8',
      activeDetourRouteIds: new Set(['8A', '8B']),
      isDetourView: false,
    })).toBe(false);
  });
});
