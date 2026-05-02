const PLATFORM_MAP_SOURCE_URL = 'https://www.barrie.ca/Transit-Platform-Maps.pdf';

const PLATFORM_MAPS = [
  { id: 'allandale-terminal', displayName: 'Barrie Allandale Transit Terminal', pageNumber: 1 },
  { id: 'downtown-hub', displayName: 'Downtown Hub', pageNumber: 2 },
  { id: 'park-place-terminal', displayName: 'Park Place Terminal', pageNumber: 3 },
  { id: 'barrie-south-go', displayName: 'Barrie South GO', pageNumber: 4 },
  { id: 'georgian-college', displayName: 'Georgian College', pageNumber: 5 },
];

const PLATFORM_MAP_BY_ID = new Map(PLATFORM_MAPS.map((map) => [map.id, map]));

function getPlatformMapByHubId(hubId) {
  if (!hubId) return null;
  return PLATFORM_MAP_BY_ID.get(String(hubId).trim()) || null;
}

module.exports = {
  PLATFORM_MAP_SOURCE_URL,
  PLATFORM_MAPS,
  getPlatformMapByHubId,
};
