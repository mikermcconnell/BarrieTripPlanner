import { COLORS } from '../config/theme';

export const normalizeHexColor = (color, fallback = COLORS.primary) => {
  if (typeof color !== 'string' || color.trim().length === 0) return fallback;
  const raw = color.trim();
  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
};

export const hexToRgba = (hexColor, opacity = 1) => {
  const normalized = normalizeHexColor(hexColor);
  const hex = normalized.replace('#', '');

  if (hex.length !== 6) {
    return normalized;
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, opacity));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/**
 * Determine if a hex color is "light" (needs dark text) or "dark" (needs white text).
 * Uses relative luminance formula (ITU-R BT.601).
 */
export const isLightColor = (hex) => {
  if (!hex || typeof hex !== 'string') return false;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.6;
};

export const getContrastTextColor = (bgColor, lightText = '#FFFFFF', darkText = '#172B4D') => {
  return isLightColor(bgColor) ? darkText : lightText;
};
