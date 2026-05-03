function parseLatLon(value, fieldName) {
  const raw = String(value).trim();
  const validNumberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  if (!validNumberPattern.test(raw)) {
    throw new Error(`"${fieldName}" must be a valid number`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`"${fieldName}" must be a valid number`);
  }
  return parsed;
}

function validateLatitude(value, fieldName) {
  if (value < -90 || value > 90) {
    throw new Error(`"${fieldName}" must be between -90 and 90`);
  }
}

function validateLongitude(value, fieldName) {
  if (value < -180 || value > 180) {
    throw new Error(`"${fieldName}" must be between -180 and 180`);
  }
}

function parseCoordinatePair(value, fieldName) {
  const parts = String(value).split(',').map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`"${fieldName}" must use "lat,lon" format`);
  }
  const lat = parseLatLon(parts[0], `${fieldName}.lat`);
  const lon = parseLatLon(parts[1], `${fieldName}.lon`);
  validateLatitude(lat, `${fieldName}.lat`);
  validateLongitude(lon, `${fieldName}.lon`);
  return { lat, lon };
}

function normalizeQuery(value) {
  const query = String(value || '').trim();
  if (query.length < 2) {
    throw new Error('Query parameter "q" is required (min 2 chars)');
  }
  if (query.length > 120) {
    throw new Error('Query parameter "q" is too long (max 120 chars)');
  }
  return query;
}

function parseOptionalTimestamp(value, fieldName) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const parsed = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`"${fieldName}" must be a unix timestamp in ms or an ISO date string`);
  }
  return parsed;
}

module.exports = {
  parseLatLon,
  validateLatitude,
  validateLongitude,
  parseCoordinatePair,
  normalizeQuery,
  parseOptionalTimestamp,
};
