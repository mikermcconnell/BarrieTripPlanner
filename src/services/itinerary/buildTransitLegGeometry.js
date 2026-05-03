import {
  extractShapeSegment,
  encodePolyline,
} from '../../utils/polylineUtils';
import { extractShapeSegmentByWaypoints } from './transitShapeUtils';

export const buildTransitLegGeometry = ({
  tripId,
  tripIndex,
  shapes,
  from,
  to,
  intermediateStops = [],
}) => {
  const trip = tripIndex?.[tripId];
  const shapeId = trip?.shapeId;
  const shapeCoords = shapeId ? shapes?.[shapeId] : null;

  if (shapeCoords && shapeCoords.length >= 2) {
    const orderedWaypointSegment = extractShapeSegmentByWaypoints(shapeCoords, [
      from,
      ...intermediateStops,
      to,
    ]);

    const segment = orderedWaypointSegment.length >= 2
      ? orderedWaypointSegment
      : extractShapeSegment(shapeCoords, from.lat, from.lon, to.lat, to.lon);

    if (segment && segment.length >= 2) {
      return {
        points: encodePolyline(segment),
        length: segment.length,
      };
    }
  }

  const fallbackCoords = [
    { latitude: from.lat, longitude: from.lon },
    ...intermediateStops.map((stop) => ({ latitude: stop.lat, longitude: stop.lon })),
    { latitude: to.lat, longitude: to.lon },
  ];

  return {
    points: encodePolyline(fallbackCoords),
    length: fallbackCoords.length,
  };
};

export default buildTransitLegGeometry;
