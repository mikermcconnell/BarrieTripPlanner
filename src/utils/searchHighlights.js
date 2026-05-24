export const FEATURED_STOP_CODES = [
  '777', // Park Place
  '1', // Downtown Hub
  '330', // Georgian College
  '2', // Downtown Hub
  '486', // Maple at Ross
  '485', // Maple at Ross
  '725', // Barrie South GO Station
  '440', // Georgian Mall
  '441', // Georgian Mall
  '192', // Owen Street
  '191', // Owen Street
  '75', // Bayfield at Sophia
  '68', // Grove Street
  '74', // Wellington Street
  '73', // Bayfield at Wellington
  '67', // Grove Street
  '506', // Mapleview at Park Place
  '146', // Brock Street
  '525', // Barrie View Drive
  '147', // Brock Street
];

const getStopCode = (stop) => String(
  stop?.code ??
  stop?.stopCode ??
  stop?.stop_code ??
  stop?.id ??
  stop?.stop_id ??
  ''
).trim();

export const getHighlightedStops = (stops = [], limit = 20) => {
  const stopByCode = new Map();
  stops.forEach((stop) => {
    const code = getStopCode(stop);
    if (code && !stopByCode.has(code)) {
      stopByCode.set(code, stop);
    }
  });

  const highlighted = FEATURED_STOP_CODES
    .map((code) => stopByCode.get(code))
    .filter(Boolean);

  if (highlighted.length >= limit) {
    return highlighted.slice(0, limit);
  }

  const highlightedCodes = new Set(highlighted.map(getStopCode));
  const fallbackStops = stops.filter((stop) => !highlightedCodes.has(getStopCode(stop)));

  return [...highlighted, ...fallbackStops].slice(0, limit);
};
