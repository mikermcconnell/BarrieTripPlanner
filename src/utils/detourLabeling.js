const cleanLabelPart = (value) => String(value || '').trim().replace(/\s+/g, ' ');

export const shortenRoadNameForDetourLabel = (roadName) => cleanLabelPart(roadName)
  .replace(/\bRoad\b/gi, 'Rd')
  .replace(/\bStreet\b/gi, 'St')
  .replace(/\bDrive\b/gi, 'Dr')
  .replace(/\bAvenue\b/gi, 'Ave')
  .replace(/\bBoulevard\b/gi, 'Blvd')
  .replace(/\bWest\b/gi, 'W')
  .replace(/\bEast\b/gi, 'E')
  .replace(/\bNorth\b/gi, 'N')
  .replace(/\bSouth\b/gi, 'S')
  .replace(/\s+/g, ' ');

export const formatRouteIdsForDetourLabel = (routeIds = []) => {
  const ids = (Array.isArray(routeIds) ? routeIds : [routeIds])
    .map((routeId) => cleanLabelPart(routeId))
    .filter(Boolean);
  const unique = [...new Set(ids)];
  if (unique.length === 0) return '';
  return unique.join('/');
};

export const formatDetourRoutesMetaLabel = (routeIds = []) => {
  const ids = (Array.isArray(routeIds) ? routeIds : [routeIds])
    .map((routeId) => cleanLabelPart(routeId))
    .filter(Boolean);
  const unique = [...new Set(ids)];
  if (unique.length === 0) return '';
  return `${unique.length === 1 ? 'Route' : 'Routes'} ${unique.join(', ')}`;
};

export const formatDetourMapLabel = ({
  routeId,
  routeLineLabel,
  roadNames = [],
  title,
  fallback = 'detour',
} = {}) => {
  const routeLabel = cleanLabelPart(routeLineLabel) || cleanLabelPart(routeId);
  const roads = (Array.isArray(roadNames) ? roadNames : [])
    .map(shortenRoadNameForDetourLabel)
    .filter(Boolean);
  const uniqueRoads = [...new Set(roads)];
  const locationLabel = uniqueRoads.length > 0
    ? uniqueRoads.slice(0, 2).join('/')
    : cleanLabelPart(title);

  if (routeLabel && locationLabel) return `${routeLabel} · ${locationLabel}`;
  if (routeLabel) return `${routeLabel} ${fallback}`;
  return locationLabel || fallback;
};

export default {
  formatDetourMapLabel,
  formatDetourRoutesMetaLabel,
  formatRouteIdsForDetourLabel,
  shortenRoadNameForDetourLabel,
};
