const DEFAULT_EVENT_PROGRESS_BUCKET_METERS = 100;
const DEFAULT_CORE_HALF_WIDTH_METERS = 100;
const DEFAULT_CONFIRM_PADDING_METERS = 250;
const DEFAULT_CLEAR_PADDING_METERS = 400;
const DEFAULT_WEAK_CLEAR_PADDING_METERS = 150;
const DEFAULT_MIN_CLEAR_SPAN_METERS = 1000;
const DEFAULT_WEAK_MIN_CLEAR_SPAN_METERS = 300;
const DEFAULT_NEARBY_GAP_METERS = 250;
const DEFAULT_GEO_PADDING_METERS = 120;
const METERS_PER_LATITUDE_DEGREE = 111_320;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  const upper = Number.isFinite(max) && max >= min ? max : Infinity;
  return Math.max(min, Math.min(upper, value));
}

function clean(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function roundDown(value, bucket = DEFAULT_EVENT_PROGRESS_BUCKET_METERS) {
  return Math.floor(Number(value || 0) / bucket) * bucket;
}

function roundUp(value, bucket = DEFAULT_EVENT_PROGRESS_BUCKET_METERS) {
  return Math.ceil(Number(value || 0) / bucket) * bucket;
}

function makeEventId({ routeId, shapeId, startProgressMeters, endProgressMeters, bucketMeters = DEFAULT_EVENT_PROGRESS_BUCKET_METERS }) {
  const start = roundDown(startProgressMeters, bucketMeters);
  const end = Math.max(start + bucketMeters, roundUp(endProgressMeters, bucketMeters));
  return `${clean(routeId, 'route')}:${clean(shapeId, 'shape')}:${start}-${end}`;
}

function normalizeCoordinate(coordinate) {
  if (!coordinate || typeof coordinate !== 'object') return null;
  const latitude = numberOrNull(coordinate.latitude ?? coordinate.lat);
  const longitude = numberOrNull(coordinate.longitude ?? coordinate.lon ?? coordinate.lng);
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

function buildGeoBounds(coordinates) {
  const points = coordinates.map(normalizeCoordinate).filter(Boolean);
  if (points.length === 0) return null;
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const centerLatitude = latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length;
  const latitudePadding = DEFAULT_GEO_PADDING_METERS / METERS_PER_LATITUDE_DEGREE;
  const longitudePadding = DEFAULT_GEO_PADDING_METERS /
    Math.max(1, METERS_PER_LATITUDE_DEGREE * Math.cos(centerLatitude * Math.PI / 180));
  return {
    minLatitude: Math.min(...latitudes) - latitudePadding,
    maxLatitude: Math.max(...latitudes) + latitudePadding,
    minLongitude: Math.min(...longitudes) - longitudePadding,
    maxLongitude: Math.max(...longitudes) + longitudePadding,
  };
}

function buildInitialEventWindow({
  routeId,
  shapeId,
  progressMeters,
  coordinate,
  shapeLengthMeters,
  coreHalfWidthMeters = DEFAULT_CORE_HALF_WIDTH_METERS,
}) {
  const progress = numberOrNull(progressMeters);
  if (progress == null) return null;
  const shapeLength = numberOrNull(shapeLengthMeters) ?? Infinity;
  const coreStart = clamp(progress - coreHalfWidthMeters, 0, shapeLength);
  const coreEnd = clamp(progress + coreHalfWidthMeters, 0, shapeLength);
  const geoCenter = normalizeCoordinate(coordinate);
  return {
    routeId: clean(routeId, ''),
    shapeId: clean(shapeId, ''),
    coreStartProgressMeters: coreStart,
    coreEndProgressMeters: coreEnd,
    confirmStartProgressMeters: clamp(coreStart - DEFAULT_CONFIRM_PADDING_METERS, 0, shapeLength),
    confirmEndProgressMeters: clamp(coreEnd + DEFAULT_CONFIRM_PADDING_METERS, 0, shapeLength),
    clearStartProgressMeters: clamp(coreStart - DEFAULT_CLEAR_PADDING_METERS, 0, shapeLength),
    clearEndProgressMeters: clamp(coreEnd + DEFAULT_CLEAR_PADDING_METERS, 0, shapeLength),
    geoCenter,
    geoBounds: buildGeoBounds(geoCenter ? [geoCenter] : []),
    frozen: false,
  };
}

function boundsFor(eventWindow, type = 'core') {
  const prefix = type === 'clear' ? 'clear' : type === 'confirm' ? 'confirm' : 'core';
  const start = numberOrNull(eventWindow?.[`${prefix}StartProgressMeters`]);
  const end = numberOrNull(eventWindow?.[`${prefix}EndProgressMeters`]);
  if (start == null || end == null) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function pointMatchesEventWindow(point, eventWindow, type = 'confirm') {
  const bounds = boundsFor(eventWindow, type);
  const progress = numberOrNull(point?.progressMeters);
  if (!bounds || progress == null) return false;
  const pointShapeId = clean(point?.shapeId, '');
  const windowShapeId = clean(eventWindow?.shapeId, '');
  if (pointShapeId && windowShapeId && pointShapeId !== windowShapeId) return false;
  return progress >= bounds.start && progress <= bounds.end;
}

function windowsOverlapOrNear(first, second, maxGapMeters = DEFAULT_NEARBY_GAP_METERS) {
  if (clean(first?.shapeId, '') !== clean(second?.shapeId, '')) return false;
  const a = boundsFor(first, 'confirm');
  const b = boundsFor(second, 'confirm');
  if (!a || !b) return false;
  const gap = a.end < b.start ? b.start - a.end : b.end < a.start ? a.start - b.end : 0;
  return gap <= maxGapMeters;
}

function expandProvisionalEventWindow(eventWindow, point, { shapeLengthMeters } = {}) {
  if (!eventWindow || eventWindow.frozen) return eventWindow;
  if (!pointMatchesEventWindow(point, eventWindow, 'confirm')) return eventWindow;
  const progress = numberOrNull(point.progressMeters);
  const core = boundsFor(eventWindow, 'core');
  const shapeLength = numberOrNull(shapeLengthMeters) ?? Infinity;
  const coreStart = clamp(Math.min(core.start, progress), 0, shapeLength);
  const coreEnd = clamp(Math.max(core.end, progress), 0, shapeLength);
  const geoPoint = normalizeCoordinate(point.coordinate);
  const geoCenter = eventWindow.geoCenter || geoPoint;
  return {
    ...eventWindow,
    coreStartProgressMeters: coreStart,
    coreEndProgressMeters: coreEnd,
    confirmStartProgressMeters: clamp(coreStart - DEFAULT_CONFIRM_PADDING_METERS, 0, shapeLength),
    confirmEndProgressMeters: clamp(coreEnd + DEFAULT_CONFIRM_PADDING_METERS, 0, shapeLength),
    clearStartProgressMeters: clamp(coreStart - DEFAULT_CLEAR_PADDING_METERS, 0, shapeLength),
    clearEndProgressMeters: clamp(coreEnd + DEFAULT_CLEAR_PADDING_METERS, 0, shapeLength),
    geoCenter,
    geoBounds: buildGeoBounds([geoCenter, geoPoint].filter(Boolean)) || eventWindow.geoBounds,
  };
}

function freezeEventWindow(eventWindow) {
  return eventWindow ? { ...eventWindow, frozen: true } : null;
}

function buildClearWindowForEvent(eventWindow, { shapeLengthMeters, quality = 'normal' } = {}) {
  const core = boundsFor(eventWindow, 'core');
  if (!core) return null;
  const weak = quality === 'weak';
  const shapeLength = numberOrNull(shapeLengthMeters) ?? Infinity;
  const minSpan = weak ? DEFAULT_WEAK_MIN_CLEAR_SPAN_METERS : DEFAULT_MIN_CLEAR_SPAN_METERS;
  const padding = weak ? DEFAULT_WEAK_CLEAR_PADDING_METERS : DEFAULT_CLEAR_PADDING_METERS;
  const coreSpan = Math.max(1, core.end - core.start);
  const targetSpan = Math.max(minSpan, coreSpan + padding * 2);
  const extraPadding = Math.max(0, (targetSpan - coreSpan) / 2);
  return {
    startProgressMeters: clamp(core.start - extraPadding, 0, shapeLength),
    endProgressMeters: clamp(core.end + extraPadding, 0, shapeLength),
    sourceStartProgressMeters: core.start,
    sourceEndProgressMeters: core.end,
    minCoverageRatio: weak ? 0.75 : 0.95,
    shapeId: eventWindow.shapeId || null,
  };
}

module.exports = {
  DEFAULT_EVENT_PROGRESS_BUCKET_METERS,
  makeEventId,
  buildInitialEventWindow,
  pointMatchesEventWindow,
  expandProvisionalEventWindow,
  freezeEventWindow,
  windowsOverlapOrNear,
  buildClearWindowForEvent,
  boundsFor,
};
