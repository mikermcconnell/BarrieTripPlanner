const SAVED_PLACE_LABELS = {
  home: { label: 'Home', icon: 'Home', isPinned: true },
  work: { label: 'Work', icon: 'Work', isPinned: true },
  school: { label: 'School', icon: 'School', isPinned: false },
  grocery: { label: 'Groceries', icon: 'Grocery', isPinned: false },
  gym: { label: 'Gym', icon: 'Gym', isPinned: false },
  doctor: { label: 'Doctor', icon: 'Doctor', isPinned: false },
  route: { label: 'Route', icon: 'Route', isPinned: false },
  custom: { label: 'Custom', icon: 'MapPin', isPinned: false },
};

const SAVED_PLACE_PICKER_LABEL_TYPES = ['home', 'work', 'school', 'grocery', 'gym', 'doctor'];

const normalizeLabelToken = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const SAVED_PLACE_ICON_ALIASES = {
  home: 'Home',
  house: 'Home',
  work: 'Work',
  office: 'Work',
  job: 'Work',
  school: 'School',
  college: 'School',
  university: 'School',
  grocery: 'Grocery',
  groceries: 'Grocery',
  supermarket: 'Grocery',
  gym: 'Gym',
  fitness: 'Gym',
  doctor: 'Doctor',
  medical: 'Doctor',
  clinic: 'Doctor',
};

const SAVED_PLACE_SEARCH_ALIASES = {
  home: ['home', 'house'],
  work: ['work', 'office', 'job'],
  school: ['school', 'college', 'university', 'campus', 'class'],
  grocery: ['grocery', 'groceries', 'supermarket', 'food', 'shopping'],
  gym: ['gym', 'fitness', 'workout', 'recreation'],
  doctor: ['doctor', 'medical', 'clinic', 'health', 'hospital'],
  route: ['route', 'trip', 'commute'],
  custom: ['saved', 'place', 'location', 'favorite', 'favourite'],
};

const getSavedPlacePickerOptions = () => [
  ...SAVED_PLACE_PICKER_LABEL_TYPES.map((labelType) => ({
    labelType,
    label: SAVED_PLACE_LABELS[labelType].label,
    icon: SAVED_PLACE_LABELS[labelType].icon,
  })),
  {
    labelType: 'custom',
    label: 'Save location',
    icon: SAVED_PLACE_LABELS.custom.icon,
  },
];

const getSavedPlaceIconName = (place = {}) => {
  const explicitIcon = String(place?.icon || '').trim();
  if (explicitIcon) {
    return SAVED_PLACE_ICON_ALIASES[normalizeLabelToken(explicitIcon)] || explicitIcon;
  }

  const labelTypeIcon = SAVED_PLACE_LABELS[place?.labelType]?.icon;
  if (labelTypeIcon) return labelTypeIcon;

  const idIcon = SAVED_PLACE_LABELS[place?.id]?.icon;
  if (idIcon) return idIcon;

  const nameToken = normalizeLabelToken(place?.name || place?.label || place?.addressText);
  return SAVED_PLACE_ICON_ALIASES[nameToken] || 'MapPin';
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

const toTimeValue = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const getRecencyScore = (value, now = new Date()) => {
  const time = toTimeValue(value);
  if (!time) return 0;
  const ageDays = Math.max(0, (now.getTime() - time) / 86400000);
  return Math.max(0, 30 - ageDays);
};

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

const getTimeOfDayPlaceScore = (place = {}, now = new Date()) => {
  const hour = now.getHours();
  const type = place?.labelType || place?.id;

  if (hour >= 5 && hour < 10) {
    if (type === 'work' || type === 'school') return 85;
    if (type === 'home') return 20;
  }

  if (hour >= 15 && hour < 20) {
    if (type === 'home') return 85;
    if (type === 'grocery' || type === 'gym') return 45;
    if (type === 'work' || type === 'school') return 15;
  }

  if (hour >= 20 || hour < 5) {
    if (type === 'home') return 80;
  }

  return 0;
};

const getRankedSavedPlaces = (savedPlaces = [], { now = new Date(), limit = null } = {}) => {
  const ranked = [...savedPlaces]
    .filter((place) => normalizeSavedLocation(place))
    .map((place, index) => {
      const meta = SAVED_PLACE_LABELS[place?.labelType] || {};
      const score =
        (place?.isPinned || meta.isPinned ? 1000 : 0) +
        getTimeOfDayPlaceScore(place, now) +
        getRecencyScore(place?.lastUsedAt || place?.updatedAt, now);
      return { place, index, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map(({ place }) => place);

  return Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;
};

const getRankedSavedTrips = (savedTrips = [], { now = new Date(), limit = null } = {}) => {
  const ranked = [...savedTrips]
    .map((trip, index) => {
      const score =
        (trip?.isPinned ? 1000 : 0) +
        Math.min(Number(trip?.useCount) || 0, 20) * 10 +
        getRecencyScore(trip?.lastUsedAt || trip?.updatedAt, now);
      return { trip, index, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map(({ trip }) => trip);

  return Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;
};

const getSavedPlaceSearchTokens = (place = {}) => {
  const labelType = SAVED_PLACE_LABELS[place?.labelType] ? place.labelType : null;
  const iconName = getSavedPlaceIconName(place);
  const normalizedIcon = normalizeLabelToken(iconName);
  const iconAliasTypes = Object.entries(SAVED_PLACE_LABELS)
    .filter(([, meta]) => normalizeLabelToken(meta.icon) === normalizedIcon)
    .map(([key]) => key);

  return [
    place?.id,
    place?.name,
    place?.label,
    place?.addressText,
    place?.displayName,
    iconName,
    labelType,
    labelType ? SAVED_PLACE_LABELS[labelType].label : null,
    ...iconAliasTypes,
    ...iconAliasTypes.flatMap((key) => SAVED_PLACE_SEARCH_ALIASES[key] || []),
    ...(labelType ? SAVED_PLACE_SEARCH_ALIASES[labelType] || [] : []),
  ].map(normalizeLabelToken).filter(Boolean);
};

const findMatchingSavedPlaces = (query, savedPlaces = []) => {
  const token = normalizeLabelToken(query);
  if (!token) return [];

  return savedPlaces
    .map((place) => {
      const normalized = normalizeSavedLocation(place);
      if (!normalized) return null;

      const label = SAVED_PLACE_LABELS[place?.labelType]?.label || '';
      const searchText = getSavedPlaceSearchTokens(place).join(' ');

      if (!searchText.includes(token)) return null;

      const shouldUseSemanticLabel = Boolean(SAVED_PLACE_LABELS[place?.labelType]?.isPinned && label);
      const shortName = shouldUseSemanticLabel ? label : (place?.name || label || normalized.name);
      return {
        id: `saved-${place?.id || locationKey(normalized)}`,
        source: 'saved_place',
        shortName,
        displayName: `Saved place · ${normalized.addressText}`,
        address: place?.address || null,
        lat: normalized.lat,
        lon: normalized.lon,
        savedPlaceId: place?.id || null,
        labelType: place?.labelType || 'custom',
        icon: getSavedPlaceIconName(place),
      };
    })
    .filter(Boolean)
    .slice(0, 4);
};

const getSavedPlaceMapMarkers = (savedPlaces = []) => (
  savedPlaces
    .map((place) => {
      const normalized = normalizeSavedLocation(place);
      if (!normalized) return null;

      const label = SAVED_PLACE_LABELS[place?.labelType]?.label || '';
      const shouldUseSemanticLabel = Boolean(SAVED_PLACE_LABELS[place?.labelType]?.isPinned && label);

      return {
        id: `saved-place-${place?.id || locationKey(normalized)}`,
        savedPlaceId: place?.id || null,
        name: shouldUseSemanticLabel ? label : (place?.name || label || normalized.name),
        addressText: normalized.addressText,
        labelType: place?.labelType || 'custom',
        icon: getSavedPlaceIconName(place),
        coordinate: {
          latitude: normalized.lat,
          longitude: normalized.lon,
        },
        rawPlace: place,
      };
    })
    .filter(Boolean)
);

const clusterSavedPlaceMapMarkers = (markers = [], { threshold = 0.00018 } = {}) => {
  const clusters = [];

  markers.forEach((marker) => {
    const latitude = marker?.coordinate?.latitude;
    const longitude = marker?.coordinate?.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const cluster = clusters.find((candidate) => (
      Math.abs(candidate.coordinate.latitude - latitude) <= threshold &&
      Math.abs(candidate.coordinate.longitude - longitude) <= threshold
    ));

    if (cluster) {
      cluster.markers.push(marker);
      const count = cluster.markers.length;
      cluster.coordinate = {
        latitude: cluster.markers.reduce((sum, item) => sum + item.coordinate.latitude, 0) / count,
        longitude: cluster.markers.reduce((sum, item) => sum + item.coordinate.longitude, 0) / count,
      };
      cluster.count = count;
      cluster.name = `${count} saved places`;
      return;
    }

    clusters.push({
      ...marker,
      isCluster: false,
      count: 1,
      markers: [marker],
    });
  });

  return clusters.map((cluster) => {
    if (cluster.count <= 1) return { ...cluster.markers[0], isCluster: false };
    return {
      id: `saved-place-cluster-${cluster.markers.map((marker) => marker.id).join('-')}`,
      isCluster: true,
      count: cluster.count,
      name: `${cluster.count} saved places`,
      addressText: cluster.markers.map((marker) => marker.name).join(', '),
      icon: 'MapPin',
      coordinate: cluster.coordinate,
      markers: cluster.markers,
    };
  });
};

const pointKey = (point) => {
  const normalized = normalizeSavedLocation(point);
  if (!normalized) return null;
  return `${normalized.lat.toFixed(4)},${normalized.lon.toFixed(4)}`;
};

const tripRouteKey = (trip = {}) => {
  const fromKey = pointKey(trip.from) || normalizeLabelToken(trip.fromText || trip.from?.name || '');
  const toKey = pointKey(trip.to) || normalizeLabelToken(trip.toText || trip.to?.name || '');
  if (!fromKey || !toKey) return null;
  return `${fromKey}->${toKey}`;
};

const getRecurringTripSuggestion = ({ recentTrips = [], savedTrips = [], threshold = 2 } = {}) => {
  const savedKeys = new Set(savedTrips.map(tripRouteKey).filter(Boolean));
  const counts = new Map();

  recentTrips.forEach((trip) => {
    const key = tripRouteKey(trip);
    if (!key || savedKeys.has(key)) return;
    const previous = counts.get(key) || { trip, count: 0 };
    counts.set(key, { trip: previous.trip, count: previous.count + 1 });
  });

  const best = [...counts.values()]
    .filter((entry) => entry.count >= threshold)
    .sort((a, b) => b.count - a.count)[0];

  if (!best) return null;

  const fromText = best.trip.fromText || best.trip.from?.name || 'Start';
  const toText = best.trip.toText || best.trip.to?.name || 'Destination';

  return {
    ...best.trip,
    name: `${fromText} to ${toText}`,
    fromText,
    toText,
    count: best.count,
  };
};

const getSavedPlaceTargetField = ({ to } = {}) => (
  to ? 'from' : 'to'
);

module.exports = {
  SAVED_PLACE_LABELS,
  buildSavedPlacePayload,
  buildSavedTripPayload,
  findMatchingSavedPlaces,
  clusterSavedPlaceMapMarkers,
  getSavedPlaceMapMarkers,
  getSavedPlaceIconName,
  getRankedSavedPlaces,
  getRankedSavedTrips,
  getRecurringTripSuggestion,
  getSavedLocationPoint,
  getSavedPlaceTargetField,
  getSavedPlaceDisplayName,
  getSavedPlacePickerOptions,
  getSavedTripDisplayName,
  normalizeSavedLocation,
};
