import {
  DETOUR_ROUTE_LAYER_ORDER,
  getDetourRouteLayerOrder,
  getRoutePolylineLayerIndexes,
  getRoutePolylineRenderKey,
  shouldKeepHiddenRouteShapeLayerMounted,
  shouldRenderRouteShape,
} from '../utils/detourFocusUtils';

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

  test('draws detoured route corridors above non-detoured context routes in detour view', () => {
    const activeDetours = new Set(['11']);

    const detouredOrder = getDetourRouteLayerOrder({
      routeId: '11',
      activeDetourRouteIds: activeDetours,
      isDetourView: true,
      hasDetourFocus: false,
    });
    const contextOrder = getDetourRouteLayerOrder({
      routeId: '10',
      activeDetourRouteIds: activeDetours,
      isDetourView: true,
      hasDetourFocus: false,
    });

    expect(detouredOrder).toBe(DETOUR_ROUTE_LAYER_ORDER.DETOURED_ROUTE);
    expect(contextOrder).toBe(DETOUR_ROUTE_LAYER_ORDER.CONTEXT_ROUTE);
    expect(detouredOrder).toBeGreaterThan(contextOrder);
  });

  test('draws the focused detour family above context routes', () => {
    expect(getDetourRouteLayerOrder({
      routeId: '12B',
      activeDetourRouteIds: new Set(['12A']),
      isDetourView: true,
      hasDetourFocus: true,
      focusedDetourRouteId: '12A',
    })).toBe(DETOUR_ROUTE_LAYER_ORDER.DETOURED_ROUTE);
  });

  test('keeps every native detoured route layer above grey context route layers', () => {
    const context = getRoutePolylineLayerIndexes(DETOUR_ROUTE_LAYER_ORDER.CONTEXT_ROUTE);
    const base = getRoutePolylineLayerIndexes(DETOUR_ROUTE_LAYER_ORDER.BASE_ROUTE);
    const detoured = getRoutePolylineLayerIndexes(DETOUR_ROUTE_LAYER_ORDER.DETOURED_ROUTE);

    expect(detoured.outlineLayerIndex).toBeGreaterThan(context.labelLayerIndex);
    expect(detoured.outlineLayerIndex).toBeGreaterThan(base.labelLayerIndex);
    expect(detoured.fillLayerIndex).toBeGreaterThan(base.fillLayerIndex);
    expect(detoured.labelLayerIndex).toBeLessThan(300);
  });

  test('changes native route render keys when layer band changes', () => {
    const contextKey = getRoutePolylineRenderKey({
      shapeId: '11:shape-main',
      routeLayerOrder: DETOUR_ROUTE_LAYER_ORDER.CONTEXT_ROUTE,
    });
    const detouredKey = getRoutePolylineRenderKey({
      shapeId: '11:shape-main',
      routeLayerOrder: DETOUR_ROUTE_LAYER_ORDER.DETOURED_ROUTE,
    });

    expect(contextKey).not.toBe(detouredKey);
    expect(detouredKey).toContain(`layer-${DETOUR_ROUTE_LAYER_ORDER.DETOURED_ROUTE}`);
  });
});
