import {
  getRouteShapeVisibleSegments,
} from '../utils/detourRouteMasking';

const route12Shape = [
  { latitude: 44.3700, longitude: -79.7000 },
  { latitude: 44.3720, longitude: -79.7000 },
  { latitude: 44.3740, longitude: -79.7000 },
  { latitude: 44.3760, longitude: -79.7000 },
  { latitude: 44.3780, longitude: -79.7000 },
  { latitude: 44.3800, longitude: -79.7000 },
];

const closedRoute12Segment = [
  { latitude: 44.3740, longitude: -79.7000 },
  { latitude: 44.3760, longitude: -79.7000 },
];

describe('detour route masking', () => {
  test('removes the regular route line where a closed detour segment is rendered', () => {
    const segments = getRouteShapeVisibleSegments({
      shape: {
        routeId: '12A',
        coordinates: route12Shape,
      },
      detourOverlays: [{
        routeId: '12A',
        segmentStopDetails: [{
          skippedSegmentPolyline: closedRoute12Segment,
        }],
      }],
      bufferMeters: 35,
    });

    expect(segments).toEqual([
      route12Shape.slice(0, 3),
      route12Shape.slice(3),
    ]);
  });

  test('uses same-family closed geometry to mask sibling Route 12 variants', () => {
    const route12BShape = route12Shape.map((point) => ({
      ...point,
      longitude: point.longitude + 0.00008,
    }));

    const segments = getRouteShapeVisibleSegments({
      shape: {
        routeId: '12B',
        coordinates: route12BShape,
      },
      detourOverlays: [{
        routeId: '12A',
        segmentStopDetails: [{
          skippedSegmentPolyline: closedRoute12Segment,
        }],
      }],
      bufferMeters: 35,
    });

    expect(segments).toEqual([
      route12BShape.slice(0, 3),
      route12BShape.slice(3),
    ]);
  });

  test('keeps regular route context connected to trimmed detour start and end', () => {
    const trimmedClosure = [
      { latitude: 44.3730, longitude: -79.7000 },
      { latitude: 44.3765, longitude: -79.7000 },
    ];

    const segments = getRouteShapeVisibleSegments({
      shape: {
        routeId: '12A',
        coordinates: route12Shape,
      },
      detourOverlays: [{
        routeId: '12A',
        segmentStopDetails: [{
          skippedSegmentPolyline: trimmedClosure,
        }],
      }],
      bufferMeters: 35,
    });

    expect(segments).toHaveLength(2);
    expect(segments[0][segments[0].length - 1]).toEqual(trimmedClosure[0]);
    expect(segments[1][0]).toEqual(trimmedClosure[1]);
  });

  test('keeps the original route line when no detour closure overlaps it', () => {
    const segments = getRouteShapeVisibleSegments({
      shape: {
        routeId: '12A',
        coordinates: route12Shape,
      },
      detourOverlays: [{
        routeId: '8A',
        segmentStopDetails: [{
          skippedSegmentPolyline: closedRoute12Segment,
        }],
      }],
      bufferMeters: 35,
    });

    expect(segments).toEqual([route12Shape]);
  });
});
