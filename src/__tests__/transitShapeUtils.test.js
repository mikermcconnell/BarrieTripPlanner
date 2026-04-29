const { extractShapeSegment } = require('../utils/polylineUtils');
const { extractShapeSegmentByWaypoints } = require('../services/itinerary/transitShapeUtils');

describe('extractShapeSegmentByWaypoints', () => {
  test('keeps the full forward segment for loop-like routes with nearby endpoints', () => {
    const shape = [
      { latitude: 44.38, longitude: -79.7 },
      { latitude: 44.381, longitude: -79.699 },
      { latitude: 44.385, longitude: -79.695 },
      { latitude: 44.39, longitude: -79.69 },
      { latitude: 44.395, longitude: -79.685 },
      { latitude: 44.398, longitude: -79.682 },
      { latitude: 44.3806, longitude: -79.6994 },
    ];

    const boardingStop = { lat: 44.38, lon: -79.7 };
    const intermediateStop = { lat: 44.395, lon: -79.685 };
    const alightingStop = { lat: 44.3801, lon: -79.6999 };

    const legacySegment = extractShapeSegment(
      shape,
      boardingStop.lat,
      boardingStop.lon,
      alightingStop.lat,
      alightingStop.lon
    );
    const orderedSegment = extractShapeSegmentByWaypoints(shape, [
      boardingStop,
      intermediateStop,
      alightingStop,
    ]);

    expect(legacySegment.length).toBeLessThan(orderedSegment.length);
    expect(orderedSegment).toEqual(shape);
  });

  test('returns an empty segment when ordered waypoints do not advance along the shape', () => {
    const shape = [
      { latitude: 44.38, longitude: -79.7 },
      { latitude: 44.39, longitude: -79.69 },
      { latitude: 44.4, longitude: -79.68 },
    ];

    expect(extractShapeSegmentByWaypoints(shape, [
      { lat: 44.38, lon: -79.7 },
      { lat: 44.38001, lon: -79.70001 },
    ])).toEqual([]);
  });
});
