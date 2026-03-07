/**
 * Shared detour UI helpers
 *
 * Pure functions used by both native and web DetourDetailsSheet components.
 */
import { COLORS } from '../config/theme';

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
