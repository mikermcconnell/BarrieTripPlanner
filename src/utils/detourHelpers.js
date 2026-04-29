/**
 * Shared detour UI helpers
 *
 * Pure functions used by both native and web DetourDetailsSheet components.
 */
import { COLORS } from '../config/theme';

const getStopKey = (stop) => {
  if (!stop) return null;
  const value = stop.id ?? stop.stop_id ?? stop.code ?? stop.name;
  return value == null ? null : String(value).trim().toLowerCase();
};

const getStopListSignature = (stops) => (
  Array.isArray(stops)
    ? stops.map(getStopKey).filter(Boolean).join(',')
    : ''
);

const getPointSignature = (point) => {
  const lat = point?.latitude ?? point?.lat;
  const lon = point?.longitude ?? point?.lon ?? point?.lng;
  if (lat == null || lon == null) return '';
  return `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
};

const getSectionSignature = (section) => {
  const affectedStops = getStopListSignature(section?.affectedStops);
  const skippedStops = getStopListSignature(section?.skippedStops);
  const entry =
    getStopKey(section?.entryStop) ||
    String(section?.entryStopName ?? section?.affectedStops?.[0]?.name ?? '').trim().toLowerCase();
  const exit =
    getStopKey(section?.exitStop) ||
    String(section?.exitStopName ?? section?.affectedStops?.[section?.affectedStops?.length - 1]?.name ?? '').trim().toLowerCase();

  if (affectedStops || skippedStops || entry || exit) {
    return `stops:${entry}|${exit}|${affectedStops}|${skippedStops}`;
  }

  return `points:${getPointSignature(section?.entryPoint)}|${getPointSignature(section?.exitPoint)}|${section?.shapeId ?? ''}`;
};

export function getUniqueDetourSections(sections = []) {
  const normalizedSections = Array.isArray(sections) ? sections.filter(Boolean) : [];
  const seen = new Set();

  return normalizedSections.filter((section) => {
    const signature = getSectionSignature(section);
    if (!signature || seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function formatDetourTime(detectedAt) {
  if (!detectedAt) return null;
  const date = detectedAt instanceof Date ? detectedAt : new Date(detectedAt);
  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 60) {
    return `Active for ${diffMin} min`;
  }
  const hours = Math.floor(diffMin / 60);
  return `Active for ${hours}h ${diffMin % 60}m`;
}

export function getConfidenceChip(confidence) {
  switch (confidence) {
    case 'high':
      return { label: 'Confirmed', color: COLORS.success, bgColor: COLORS.successSubtle };
    case 'medium':
      return { label: 'Detecting...', color: COLORS.warning, bgColor: COLORS.warningSubtle };
    default:
      return { label: 'Low confidence', color: COLORS.textSecondary, bgColor: COLORS.grey200 };
  }
}
