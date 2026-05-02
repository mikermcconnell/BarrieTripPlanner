export const PLATFORM_MAP_SOURCE_URL = 'https://www.barrie.ca/Transit-Platform-Maps.pdf';

export const PLATFORM_MAPS = [
  {
    id: 'allandale-terminal',
    displayName: 'Barrie Allandale Transit Terminal',
    shortName: 'Allandale Terminal',
    pageNumber: 1,
    stopCodes: ['9003', '9004', '9005', '9006', '9009', '9012', '9013'],
  },
  {
    id: 'downtown-hub',
    displayName: 'Downtown Hub',
    shortName: 'Downtown Hub',
    pageNumber: 2,
    stopCodes: ['1', '2', '10', '11'],
  },
  {
    id: 'park-place-terminal',
    displayName: 'Park Place Terminal',
    shortName: 'Park Place',
    pageNumber: 3,
    stopCodes: ['777'],
  },
  {
    id: 'barrie-south-go',
    displayName: 'Barrie South GO',
    shortName: 'Barrie South GO',
    pageNumber: 4,
    stopCodes: ['725'],
  },
  {
    id: 'georgian-college',
    displayName: 'Georgian College',
    shortName: 'Georgian College',
    pageNumber: 5,
    stopCodes: ['327', '328', '329', '330', '331', '335', '110'],
  },
];

const normalizeStopKey = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const PLATFORM_MAP_BY_ID = new Map(PLATFORM_MAPS.map((map) => [map.id, map]));
const PLATFORM_MAP_BY_STOP_CODE = new Map();

for (const platformMap of PLATFORM_MAPS) {
  for (const stopCode of platformMap.stopCodes) {
    PLATFORM_MAP_BY_STOP_CODE.set(normalizeStopKey(stopCode), platformMap);
  }
}

export const getPlatformMapByHubId = (hubId) => PLATFORM_MAP_BY_ID.get(normalizeStopKey(hubId)) || null;

export const getPlatformMapForStop = (stop) => {
  if (!stop) return null;
  const possibleKeys = [stop.code, stop.stopCode, stop.id, stop.stop_id].map(normalizeStopKey).filter(Boolean);
  for (const key of possibleKeys) {
    const platformMap = PLATFORM_MAP_BY_STOP_CODE.get(key);
    if (platformMap) return platformMap;
  }
  return null;
};
