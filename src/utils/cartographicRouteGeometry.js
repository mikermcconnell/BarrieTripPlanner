import {
  calculateBearing,
  douglasPeuckerSimplify,
  haversineDistance,
} from './geometryUtils';

export const CARTOGRAPHIC_ROUTE_PROFILES = Object.freeze({
  city: Object.freeze({
    maxZoom: 13,
    toleranceMeters: 18,
    cornerWindowMeters: 35,
    cornerTurnDegrees: 32,
    cornerSpacingMeters: 35,
    maxLengthReductionRatio: 0.035,
  }),
  corridor: Object.freeze({
    maxZoom: 15,
    toleranceMeters: 10,
    cornerWindowMeters: 25,
    cornerTurnDegrees: 28,
    cornerSpacingMeters: 25,
    maxLengthReductionRatio: 0.025,
  }),
});

const geometryCache = new WeakMap();
const MIN_POINT_SPACING_METERS = 1.5;

const isValidCoordinate = (point) => (
  Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)
);

const distanceBetween = (a, b) => haversineDistance(
  a.latitude,
  a.longitude,
  b.latitude,
  b.longitude
);

const sanitizeCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates)) return [];

  const sanitized = [];
  coordinates.forEach((point) => {
    if (!isValidCoordinate(point)) return;
    const previous = sanitized[sanitized.length - 1];
    if (previous && distanceBetween(previous, point) < MIN_POINT_SPACING_METERS) return;
    sanitized.push(point);
  });

  return sanitized;
};

const buildCumulativeDistances = (coordinates) => {
  const cumulative = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + distanceBetween(
      coordinates[index - 1],
      coordinates[index]
    );
  }
  return cumulative;
};

const findIndexAtOrBefore = (cumulative, target, highLimit) => {
  let low = 0;
  let high = highLimit;
  let result = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulative[middle] <= target) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
};

const findIndexAtOrAfter = (cumulative, target, lowLimit) => {
  let low = lowLimit;
  let high = cumulative.length - 1;
  let result = cumulative.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulative[middle] >= target) {
      result = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return result;
};

const getTurnDegrees = (before, corner, after) => {
  const incoming = calculateBearing(before, corner);
  const outgoing = calculateBearing(corner, after);
  return Math.abs(((outgoing - incoming + 540) % 360) - 180);
};

const findProtectedCornerIndexes = (coordinates, cumulative, profile) => {
  if (coordinates.length < 3) return [0, coordinates.length - 1];

  const candidates = [];
  const routeLength = cumulative[cumulative.length - 1];

  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const progress = cumulative[index];
    if (
      progress < profile.cornerWindowMeters ||
      routeLength - progress < profile.cornerWindowMeters
    ) {
      continue;
    }

    const beforeIndex = findIndexAtOrBefore(
      cumulative,
      progress - profile.cornerWindowMeters,
      index - 1
    );
    const afterIndex = findIndexAtOrAfter(
      cumulative,
      progress + profile.cornerWindowMeters,
      index + 1
    );
    if (beforeIndex >= index || afterIndex <= index) continue;

    const turnDegrees = getTurnDegrees(
      coordinates[beforeIndex],
      coordinates[index],
      coordinates[afterIndex]
    );

    if (turnDegrees >= profile.cornerTurnDegrees) {
      candidates.push({ index, progress, turnDegrees });
    }
  }

  const clustered = [];
  candidates.forEach((candidate) => {
    const previous = clustered[clustered.length - 1];
    if (!previous || candidate.progress - previous.progress >= profile.cornerSpacingMeters) {
      clustered.push(candidate);
      return;
    }

    if (candidate.turnDegrees > previous.turnDegrees) {
      clustered[clustered.length - 1] = candidate;
    }
  });

  return [0, ...clustered.map((candidate) => candidate.index), coordinates.length - 1];
};

const simplifyBetweenProtectedCorners = (coordinates, protectedIndexes, toleranceMeters) => {
  const cleaned = [];

  for (let index = 1; index < protectedIndexes.length; index += 1) {
    const start = protectedIndexes[index - 1];
    const end = protectedIndexes[index];
    const segment = douglasPeuckerSimplify(
      coordinates.slice(start, end + 1),
      toleranceMeters
    );

    if (cleaned.length > 0) cleaned.pop();
    cleaned.push(...segment);
  }

  return cleaned;
};

const measurePathLength = (coordinates) => {
  let length = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    length += distanceBetween(coordinates[index - 1], coordinates[index]);
  }
  return length;
};

const resolveProfile = (zoom) => {
  const safeZoom = Number.isFinite(zoom) ? zoom : CARTOGRAPHIC_ROUTE_PROFILES.city.maxZoom;
  if (safeZoom <= CARTOGRAPHIC_ROUTE_PROFILES.city.maxZoom) {
    return ['city', CARTOGRAPHIC_ROUTE_PROFILES.city];
  }
  if (safeZoom <= CARTOGRAPHIC_ROUTE_PROFILES.corridor.maxZoom) {
    return ['corridor', CARTOGRAPHIC_ROUTE_PROFILES.corridor];
  }
  return ['detail', null];
};

const cleanWithProfile = (coordinates, profile) => {
  const sanitized = sanitizeCoordinates(coordinates);
  if (sanitized.length < 3) return sanitized;

  const cumulative = buildCumulativeDistances(sanitized);
  const originalLength = cumulative[cumulative.length - 1];
  if (originalLength <= 0) return sanitized;

  const protectedIndexes = findProtectedCornerIndexes(sanitized, cumulative, profile);
  let cleaned = simplifyBetweenProtectedCorners(
    sanitized,
    protectedIndexes,
    profile.toleranceMeters
  );

  const minimumAcceptableLength = originalLength * (1 - profile.maxLengthReductionRatio);
  if (measurePathLength(cleaned) < minimumAcceptableLength) {
    cleaned = simplifyBetweenProtectedCorners(
      sanitized,
      protectedIndexes,
      profile.toleranceMeters * 0.6
    );
  }

  if (measurePathLength(cleaned) < minimumAcceptableLength) {
    return sanitized;
  }

  return cleaned;
};

/**
 * Produces a display-only cartographic route path. Raw/processed GTFS shapes remain
 * authoritative for vehicle snapping, routing, stop logic, and detour detection.
 */
export const getCartographicRouteCoordinates = (coordinates, { zoom } = {}) => {
  if (!Array.isArray(coordinates) || coordinates.length < 3) return coordinates || [];

  const [profileKey, profile] = resolveProfile(zoom);
  if (!profile) return coordinates;

  let profileCache = geometryCache.get(coordinates);
  if (!profileCache) {
    profileCache = new Map();
    geometryCache.set(coordinates, profileCache);
  }
  if (profileCache.has(profileKey)) return profileCache.get(profileKey);

  const cleaned = cleanWithProfile(coordinates, profile);
  profileCache.set(profileKey, cleaned);
  return cleaned;
};

export const __TEST_ONLY__ = {
  buildCumulativeDistances,
  findProtectedCornerIndexes,
  getTurnDegrees,
  measurePathLength,
  resolveProfile,
  sanitizeCoordinates,
};
