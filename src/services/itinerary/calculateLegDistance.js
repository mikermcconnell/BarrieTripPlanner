import { haversineDistance } from '../../utils/geometryUtils';

export const calculateLegDistance = (from, to, intermediateStops = []) => {
  let distance = 0;
  let lastLat = from.lat;
  let lastLon = from.lon;

  intermediateStops.forEach((stop) => {
    distance += haversineDistance(lastLat, lastLon, stop.lat, stop.lon);
    lastLat = stop.lat;
    lastLon = stop.lon;
  });

  distance += haversineDistance(lastLat, lastLon, to.lat, to.lon);
  return Math.round(distance);
};

export default calculateLegDistance;
