export const FEATURED_STOP_CODES = [
  '9003', // Barrie Allandale Transit Terminal
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
];

const ALLANDALE_TERMINAL_STOP_CODES = new Set([
  '9003',
  '9004',
  '9005',
  '9006',
  '9009',
  '9012',
  '9013',
]);

const getStopCode = (stop) => String(
  stop?.code ??
  stop?.stopCode ??
  stop?.stop_code ??
  stop?.id ??
  stop?.stop_id ??
  ''
).trim();

const getStopName = (stop) => String(stop?.name ?? stop?.stopName ?? stop?.stop_name ?? '')
  .trim()
  .toLowerCase();

const findAllandaleTerminalStop = (stops, stopByCode) => {
  for (const code of ALLANDALE_TERMINAL_STOP_CODES) {
    const stop = stopByCode.get(code);
    if (stop) return stop;
  }

  return stops.find((stop) => getStopName(stop).includes('allandale transit terminal'));
};

export const getHighlightedStops = (stops = [], limit = 20) => {
  const stopByCode = new Map();
  stops.forEach((stop) => {
    const code = getStopCode(stop);
    if (code && !stopByCode.has(code)) {
      stopByCode.set(code, stop);
    }
  });

  const highlighted = [];
  const highlightedCodes = new Set();

  FEATURED_STOP_CODES.forEach((code) => {
    const stop = code === '9003'
      ? findAllandaleTerminalStop(stops, stopByCode)
      : stopByCode.get(code);
    const stopCode = getStopCode(stop);
    if (!stop || highlightedCodes.has(stopCode)) return;

    highlighted.push(stop);
    highlightedCodes.add(stopCode);
  });

  if (highlighted.length >= limit) {
    return highlighted.slice(0, limit);
  }

  const fallbackStops = stops.filter((stop) => !highlightedCodes.has(getStopCode(stop)));

  return [...highlighted, ...fallbackStops].slice(0, limit);
};
