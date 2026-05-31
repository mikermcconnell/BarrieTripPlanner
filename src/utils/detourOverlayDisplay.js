import { haversineDistance } from './geometryUtils';

const DETOUR_LABEL_BASE_PADDING_PX = 28;
const DETOUR_LABEL_APPROX_CHAR_WIDTH_PX = 7;
const DETOUR_LABEL_SAFE_FIT_BUFFER_PX = 18;
const WEB_MERCATOR_EQUATOR_METERS_PER_PIXEL = 156543.03392;

const isFiniteCoordinate = (point) => (
  Number.isFinite(Number(point?.latitude)) &&
  Number.isFinite(Number(point?.longitude))
);

export const getClosureMarkerPoints = (path) => {
  if (!Array.isArray(path) || path.length < 2) {
    return [];
  }

  const indexes = [0, path.length - 1];
  const seen = new Set();

  return indexes
    .map((index) => path[index])
    .filter((point) => {
      if (!point) return false;
      const key = `${point.latitude?.toFixed?.(6) ?? point.latitude}:${point.longitude?.toFixed?.(6) ?? point.longitude}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const getPathDistanceMeters = (path) => {
  const points = Array.isArray(path)
    ? path.filter(isFiniteCoordinate)
    : [];

  if (points.length < 2) return 0;

  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    const distance = haversineDistance(
      previous.latitude,
      previous.longitude,
      point.latitude,
      point.longitude
    );
    return Number.isFinite(distance) ? total + distance : total;
  }, 0);
};

export const getAverageLatitude = (path) => {
  const points = Array.isArray(path)
    ? path.filter(isFiniteCoordinate)
    : [];

  if (points.length === 0) return 44.39;

  return points.reduce((sum, point) => sum + Number(point.latitude), 0) / points.length;
};

export const getMetersPerPixelAtZoom = (zoom, latitude) => (
  (WEB_MERCATOR_EQUATOR_METERS_PER_PIXEL * Math.cos((latitude * Math.PI) / 180)) /
  Math.pow(2, zoom)
);

export const estimateLabelWidthPx = (label) => (
  DETOUR_LABEL_BASE_PADDING_PX + (String(label || '').length * DETOUR_LABEL_APPROX_CHAR_WIDTH_PX)
);

export const canPlaceLineCenterLabel = (path, label, currentZoom) => {
  if (!Array.isArray(path) || path.length < 2) return false;
  if (!Number.isFinite(Number(currentZoom))) return true;

  const distanceMeters = getPathDistanceMeters(path);
  if (distanceMeters <= 0) return false;

  const metersPerPixel = getMetersPerPixelAtZoom(currentZoom, getAverageLatitude(path));
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return true;

  const screenLengthPx = distanceMeters / metersPerPixel;
  return screenLengthPx >= estimateLabelWidthPx(label) + DETOUR_LABEL_SAFE_FIT_BUFFER_PX;
};