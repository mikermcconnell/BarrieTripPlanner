const SAVED_PLACE_LABELS = {
  home: { label: 'Home', icon: 'Home', isPinned: true },
  work: { label: 'Work', icon: 'Work', isPinned: true },
  school: { label: 'School', icon: 'School', isPinned: false },
  grocery: { label: 'Grocery', icon: 'Grocery', isPinned: false },
  gym: { label: 'Gym', icon: 'Gym', isPinned: false },
  doctor: { label: 'Doctor', icon: 'Doctor', isPinned: false },
  route: { label: 'Route', icon: 'Route', isPinned: false },
  custom: { label: 'Custom', icon: 'MapPin', isPinned: false },
};

const toFiniteNumber = (value) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(number) ? number : null;
};

const normalizeSavedLocation = (location) => {
  if (!location || typeof location !== 'object') return null;

  const lat = toFiniteNumber(location.lat ?? location.latitude);
  const lon = toFiniteNumber(location.lon ?? location.lng ?? location.longitude);
  if (lat === null || lon === null) return null;

  const name = String(
    location.name ||
    location.shortName ||
    location.label ||
    location.addressText ||
    location.displayName ||
    'Saved place'
  ).trim();
  const addressText = String(
    location.addressText ||
    location.displayName ||
    location.shortName ||
    location.name ||
    name
  ).trim();

  return {
    name: name || 'Saved place',
    addressText: addressText || name || 'Saved place',
    lat,
    lon,
  };
};

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const locationKey = (location) => {
  const normalized = normalizeSavedLocation(location);
  if (!normalized) return 'location';
  return `${slugify(normalized.name)}-${normalized.lat.toFixed(5)}-${normalized.lon.toFixed(5)}`;
};

const buildSavedPlacePayload = ({ labelType = 'custom', name, icon, location, isPinned } = {}) => {
  const normalized = normalizeSavedLocation(location);
  if (!normalized) return null;

  const label = SAVED_PLACE_LABELS[labelType] || SAVED_PLACE_LABELS.custom;
  const resolvedName = String(name || (labelType === 'custom' ? normalized.name : label.label)).trim();

  return {
    id: labelType === 'custom' ? `custom-${locationKey(normalized)}` : labelType,
    name: resolvedName || label.label,
    labelType: SAVED_PLACE_LABELS[labelType] ? labelType : 'custom',
    icon: icon || label.icon,
    addressText: normalized.addressText,
    lat: normalized.lat,
    lon: normalized.lon,
    isPinned: isPinned ?? label.isPinned,
  };
};

const buildSavedTripPayload = ({ name, icon = 'Route', from, to, timePreference = null, itinerary = null } = {}) => {
  const normalizedFrom = normalizeSavedLocation(from);
  const normalizedTo = normalizeSavedLocation(to);
  if (!normalizedFrom || !normalizedTo) return null;

  const resolvedName = String(name || `${normalizedFrom.name} to ${normalizedTo.name}`).trim();
  const id = `trip-${locationKey(normalizedFrom)}-to-${locationKey(normalizedTo)}`;
  const summary = itinerary
    ? {
        duration: itinerary.duration ?? null,
        transfers: Number.isFinite(itinerary.transfers) ? itinerary.transfers : null,
        walkDistance: itinerary.walkDistance ?? null,
      }
    : null;

  return {
    id,
    name: resolvedName || 'Saved trip',
    icon,
    from: normalizedFrom,
    to: normalizedTo,
    timePreference,
    summary,
    isPinned: false,
  };
};

const getSavedLocationPoint = (location) => {
  const normalized = normalizeSavedLocation(location);
  return normalized ? { lat: normalized.lat, lon: normalized.lon } : null;
};

const getSavedPlaceDisplayName = (place) => place?.name || place?.addressText || 'Saved place';

const getSavedTripDisplayName = (trip) => (
  trip?.name || `${trip?.from?.name || 'Start'} to ${trip?.to?.name || 'Destination'}`
);

const getSavedPlaceTargetField = ({ to } = {}) => (
  to ? 'from' : 'to'
);

module.exports = {
  SAVED_PLACE_LABELS,
  buildSavedPlacePayload,
  buildSavedTripPayload,
  getSavedLocationPoint,
  getSavedPlaceTargetField,
  getSavedPlaceDisplayName,
  getSavedTripDisplayName,
  normalizeSavedLocation,
};
