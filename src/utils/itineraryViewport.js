import { haversineDistance } from './geometryUtils';
import { decodePolyline } from './polylineUtils';

const normalizeCoordinate = (point) => {
  if (!point) return null;

  const latitude = point.latitude ?? point.lat;
  const longitude = point.longitude ?? point.lon;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }

  return { latitude, longitude };
};

export const computeCoordinateBounds = (points) => {
  const coordinates = (points || [])
    .map(normalizeCoordinate)
    .filter(Boolean);

  if (coordinates.length === 0) {
    return null;
  }

  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;

  coordinates.forEach(({ latitude, longitude }) => {
    minLat = Math.min(minLat, latitude);
    maxLat = Math.max(maxLat, latitude);
    minLon = Math.min(minLon, longitude);
    maxLon = Math.max(maxLon, longitude);
  });

  return {
    minLat,
    maxLat,
    minLon,
    maxLon,
    ne: [maxLon, maxLat],
    sw: [minLon, minLat],
  };
};

export const computeCoordinateBoundsWithMinSpan = (
  points,
  {
    minLatSpan = 0,
    minLonSpan = 0,
  } = {}
) => {
  const bounds = computeCoordinateBounds(points);
  if (!bounds) return null;

  let { minLat, maxLat, minLon, maxLon } = bounds;
  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;

  if (latSpan < minLatSpan) {
    const latPadding = (minLatSpan - latSpan) / 2;
    minLat -= latPadding;
    maxLat += latPadding;
  }

  if (lonSpan < minLonSpan) {
    const lonPadding = (minLonSpan - lonSpan) / 2;
    minLon -= lonPadding;
    maxLon += lonPadding;
  }

  return {
    minLat,
    maxLat,
    minLon,
    maxLon,
    ne: [maxLon, maxLat],
    sw: [minLon, minLat],
  };
};

export const distanceToBoundsMeters = (bounds, point) => {
  const coordinate = normalizeCoordinate(point);
  if (!bounds || !coordinate) return Infinity;

  const clampedLatitude = Math.min(Math.max(coordinate.latitude, bounds.minLat), bounds.maxLat);
  const clampedLongitude = Math.min(Math.max(coordinate.longitude, bounds.minLon), bounds.maxLon);

  return haversineDistance(
    coordinate.latitude,
    coordinate.longitude,
    clampedLatitude,
    clampedLongitude
  );
};

export const computeLegBounds = (leg) => {
  if (!leg?.from || !leg?.to) {
    return null;
  }

  return computeCoordinateBounds([
    { lat: leg.from.lat, lon: leg.from.lon },
    { lat: leg.to.lat, lon: leg.to.lon },
  ]);
};

export const collectItineraryViewportCoordinates = (
  itinerary,
  {
    includeLegGeometry = true,
    includeIntermediateStops = true,
    includeEndpoints = true,
  } = {}
) => {
  const coordinates = [];

  itinerary?.legs?.forEach((leg) => {
    if (includeEndpoints) {
      const from = normalizeCoordinate(leg?.from);
      const to = normalizeCoordinate(leg?.to);
      if (from) coordinates.push(from);
      if (to) coordinates.push(to);
    }

    if (includeLegGeometry && leg?.legGeometry?.points) {
      coordinates.push(...decodePolyline(leg.legGeometry.points));
    }

    if (includeIntermediateStops && Array.isArray(leg?.intermediateStops)) {
      leg.intermediateStops.forEach((stop) => {
        const coordinate = normalizeCoordinate(stop);
        if (coordinate) {
          coordinates.push(coordinate);
        }
      });
    }
  });

  return coordinates;
};

export const collectItineraryEndpointCoordinates = (itinerary) =>
  collectItineraryViewportCoordinates(itinerary, {
    includeLegGeometry: false,
    includeIntermediateStops: false,
  });
