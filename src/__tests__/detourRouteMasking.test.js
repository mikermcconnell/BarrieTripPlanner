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

const route10LoopShape = [
  { latitude: 44.387753, longitude: -79.690237 },
  { latitude: 44.389600, longitude: -79.691871 },
  { latitude: 44.392476, longitude: -79.685620 },
  { latitude: 44.391061, longitude: -79.685633 },
  { latitude: 44.390601, longitude: -79.685566 },
  { latitude: 44.390480, longitude: -79.687700 },
  { latitude: 44.387993, longitude: -79.689192 },
  { latitude: 44.387753, longitude: -79.690237 },
];

const route10ClosedTailSegment = route10LoopShape.slice(3);

const route10AlternatePath = [
  route10LoopShape[4],
  { latitude: 44.388694, longitude: -79.685528 },
  route10LoopShape[6],
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

  test('masks the correct tail of a loop route when the terminal point appears twice', () => {
    const segments = getRouteShapeVisibleSegments({
      shape: {
        routeId: '10',
        coordinates: route10LoopShape,
      },
      detourOverlays: [{
        routeId: '10',
        segmentStopDetails: [{
          skippedSegmentPolyline: route10ClosedTailSegment,
        }],
      }],
      bufferMeters: 35,
    });

    expect(segments).toEqual([
      route10LoopShape.slice(0, 4),
    ]);
  });

  test('removes the regular route line where the active detour path is already rendered', () => {
    const segments = getRouteShapeVisibleSegments({
      shape: {
        routeId: '10',
        coordinates: route10LoopShape,
      },
      detourOverlays: [{
        routeId: '10',
        segmentStopDetails: [{
          skippedSegmentPolyline: [
            route10LoopShape[5],
            route10LoopShape[6],
          ],
          likelyDetourPolyline: route10AlternatePath,
        }],
      }],
      bufferMeters: 35,
    });

    expect(segments).toEqual([
      route10LoopShape.slice(0, 5),
      route10LoopShape.slice(6),
    ]);
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
