const EARTH_RADIUS_METERS = 6371000;
const toRadians = (degrees) => degrees * (Math.PI / 180);

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const pointToSegmentDistance = (point, segmentStart, segmentEnd) => {
  const x = point.longitude;
  const y = point.latitude;
  const x1 = segmentStart.longitude;
  const y1 = segmentStart.latitude;
  const x2 = segmentEnd.longitude;
  const y2 = segmentEnd.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return haversineDistance(y, x, y1, x1);
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return haversineDistance(y, x, closestY, closestX);
};

const pointToPolylineDistance = (point, polyline) => {
  if (!polyline || polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return haversineDistance(point.latitude, point.longitude, polyline[0].latitude, polyline[0].longitude);
  }
  let minDistance = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    minDistance = Math.min(minDistance, pointToSegmentDistance(point, polyline[i], polyline[i + 1]));
  }
  return minDistance;
};

module.exports = {
  EARTH_RADIUS_METERS,
  toRadians,
  haversineDistance,
  pointToSegmentDistance,
  pointToPolylineDistance,
};
