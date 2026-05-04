import {
  ROUTE_LINE_LABEL_MARKERS,
  buildRouteLineLabelMarkers,
  pickPrimaryLabelCoordinate,
} from '../utils/routeLineLabelMarkers';

const point = (latitude, longitude) => ({ latitude, longitude });
const shape = (routeId, coordinates, color = '#1167B1') => ({
  id: `shape-${routeId}`, routeId, color, coordinates,
});
const names = new Map([['1', '1'], ['2', '2'], ['4', '4'], ['8A', '8A'], ['12B', '12B']]);

describe('route line label markers', () => {
  test('does not show general labels below zoom 14', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('1', [point(44.38, -79.69), point(44.39, -79.68)])],
      currentZoom: 13.75,
      routeShortNameMap: names,
      selectedRouteIds: new Set(),
    });
    expect(markers).toEqual([]);
  });

  test('shows selected route labels at zoom 13.5', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('1', [point(44.38, -79.69), point(44.39, -79.68)])],
      currentZoom: 13.5,
      routeShortNameMap: names,
      selectedRouteIds: new Set(['1']),
    });
    expect(markers[0]).toMatchObject({ routeId: '1', label: '1', slot: 'primary', isSelected: true });
  });

  test('shows one primary label per visible route at zoom 14 when labels do not collide', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [
        shape('1', [point(44.38, -79.69), point(44.39, -79.68)]),
        shape('2', [point(44.42, -79.72), point(44.43, -79.71)]),
      ],
      currentZoom: 14,
      routeShortNameMap: names,
      selectedRouteIds: new Set(),
    });
    expect(markers.map((m) => m.routeId)).toEqual(['1', '2']);
    expect(markers.every((m) => m.slot === 'primary')).toBe(true);
  });

  test('skips routes without short names', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('99', [point(44.38, -79.69), point(44.39, -79.68)])],
      currentZoom: 14,
      routeShortNameMap: names,
      selectedRouteIds: new Set(),
    });
    expect(markers).toEqual([]);
  });

  test('keeps selected labels before colliding general labels', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [
        shape('1', [point(44.3800, -79.6900), point(44.3900, -79.6800)]),
        shape('2', [point(44.3801, -79.6901), point(44.3901, -79.6801)]),
      ],
      currentZoom: 14,
      routeShortNameMap: names,
      selectedRouteIds: new Set(['2']),
      collisionDistance: 0.02,
    });
    expect(markers).toHaveLength(1);
    expect(markers[0].routeId).toBe('2');
  });

  test('adds second label for long routes at zoom 15 when it fits', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('8A', [
        point(44.30, -79.80), point(44.34, -79.76), point(44.38, -79.72),
        point(44.42, -79.68), point(44.46, -79.64), point(44.50, -79.60),
      ])],
      currentZoom: 15,
      routeShortNameMap: names,
      selectedRouteIds: new Set(),
      collisionDistance: 0.001,
    });
    expect(markers.map((m) => m.slot)).toEqual(['primary', 'secondary']);
  });

  test('does not show labels during trip preview mode', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('1', [point(44.38, -79.69), point(44.39, -79.68)])],
      currentZoom: 15,
      routeShortNameMap: names,
      selectedRouteIds: new Set(['1']),
      isTripPreviewMode: true,
    });
    expect(markers).toEqual([]);
  });

  test('caps labels and prioritizes selected then hovered routes', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [
        shape('1', [point(44.31, -79.71), point(44.32, -79.70)]),
        shape('2', [point(44.35, -79.75), point(44.36, -79.74)]),
        shape('4', [point(44.39, -79.79), point(44.40, -79.78)]),
      ],
      currentZoom: 14,
      routeShortNameMap: names,
      selectedRouteIds: new Set(['4']),
      hoveredRouteId: '2',
      maxLabels: 2,
    });
    expect(markers.map((m) => m.routeId)).toEqual(['4', '2']);
  });

  test('picks midpoint of longest segment for primary placement', () => {
    expect(pickPrimaryLabelCoordinate([
      point(44.00, -79.00),
      point(44.01, -79.01),
      point(44.09, -79.09),
    ])).toEqual({ latitude: 44.05, longitude: -79.05 });
  });

  test('uses fallback route color when shape color is missing', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('12B', [point(44.38, -79.69), point(44.39, -79.68)], null)],
      currentZoom: 14,
      routeShortNameMap: names,
      selectedRouteIds: new Set(),
    });
    expect(markers[0].color).toBe(ROUTE_LINE_LABEL_MARKERS.FALLBACK_COLOR);
  });
});
