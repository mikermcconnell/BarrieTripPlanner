const MAX_LOOKUP_POINTS = 5;
const MAX_ROAD_NAMES = 4;

const getSegmentPath = (segment) => {
  if (Array.isArray(segment?.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2) {
    return segment.inferredDetourPolyline;
  }
  if (Array.isArray(segment?.skippedSegmentPolyline) && segment.skippedSegmentPolyline.length >= 2) {
    return segment.skippedSegmentPolyline;
  }
  return [];
};

const pointKey = (point) =>
  point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    ? `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`
    : null;

const dedupePoints = (points) => {
  const seen = new Set();
  return points.filter((point) => {
    const key = pointKey(point);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const clampIndex = (index, length) => Math.max(0, Math.min(length - 1, index));

const samplePoints = (points, limit) => {
  if (!Array.isArray(points) || points.length <= limit) return points || [];

  const sampled = [];
  for (let i = 0; i < limit; i += 1) {
    const ratio = limit === 1 ? 0 : i / (limit - 1);
    const index = clampIndex(Math.round(ratio * (points.length - 1)), points.length);
    sampled.push(points[index]);
  }

  return dedupePoints(sampled);
};

export const extractRoadName = (result) => {
  const address = result?.address || {};
  const raw =
    address.road ||
    address.pedestrian ||
    address.footway ||
    address.cycleway ||
    address.path ||
    null;

  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }

  const fallback = result?.shortName || result?.displayName || '';
  const firstPart = fallback.split(',')[0]?.trim() || '';
  const normalized = firstPart.replace(/^\d+\s+/, '').trim();
  return normalized || null;
};

export const getDetourLookupPoints = (detour) => {
  const segments = Array.isArray(detour?.segments) && detour.segments.length > 0
    ? detour.segments
    : detour
      ? [detour]
      : [];

  const candidates = [];

  segments.forEach((segment) => {
    if (segment?.entryPoint) candidates.push(segment.entryPoint);

    const path = getSegmentPath(segment);
    if (path.length >= 3) {
      const interiorIndices = path.length >= 5
        ? [
          Math.floor(path.length / 3),
          Math.floor((path.length - 1) / 2),
          Math.floor((path.length * 2) / 3),
        ]
        : [Math.floor((path.length - 1) / 2)];

      interiorIndices.forEach((index) => {
        const point = path[clampIndex(index, path.length)];
        if (point) candidates.push(point);
      });
    }

    if (segment?.exitPoint) candidates.push(segment.exitPoint);
  });

  return samplePoints(dedupePoints(candidates), MAX_LOOKUP_POINTS);
};

export const dedupeRoadNames = (roadNames) => {
  const seen = new Set();
  return (roadNames || []).filter((roadName) => {
    const normalized = String(roadName || '').trim();
    if (!normalized) return false;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildDetourRoadSummary = (roadNames) =>
  dedupeRoadNames(roadNames).slice(0, MAX_ROAD_NAMES);

