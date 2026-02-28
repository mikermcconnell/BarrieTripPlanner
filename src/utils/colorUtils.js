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
