const { getStaticData } = require('../gtfsLoader');
const { getDb } = require('../firebaseAdmin');
const { matchDetourGeometry } = require('../detourRoadMatcher');
const { haversineDistance, pointToPolylineDistance } = require('../geometry');
const { buildDetourStorageConfig } = require('../detour/storageConfig');

const DEFAULT_OFFSET_METERS = 275;
const DEFAULT_ROAD_MATCH_OFFSET_CANDIDATES_METERS = [275, 600, 1000, 1500, 1800];
const DEFAULT_ROUTE_ID = null;
const FARMERS_MARKET_PRESET = 'farmers-market';
const FARMERS_MARKET_ROUTE_IDS = ['11'];
const SAUNDERS_WELHAM_PRESET = 'saunders-welham';
const SAUNDERS_WELHAM_ROUTE_IDS = ['12A', '12B'];
const DUNLOP_FERNDALE_ANNE_PRESET = 'dunlop-ferndale-anne';
const DUNLOP_FERNDALE_ANNE_ROUTE_IDS = ['2A', '2B'];
const YONGE_BIG_BAY_LITTLE_PRESET = 'yonge-bigbay-little';
const YONGE_BIG_BAY_LITTLE_ROUTE_IDS = ['8A'];
const WELLINGTON_OWEN_GROVE_PRESET = 'wellington-owen-grove';
const WELLINGTON_OWEN_GROVE_ROUTE_IDS = ['7A', '7B'];
const SAUNDERS_WELHAM_ALIASES = new Set([
  SAUNDERS_WELHAM_PRESET,
  'saunders-welham-detour',
  'route-12-saunders-welham',
]);
const DUNLOP_FERNDALE_ANNE_ALIASES = new Set([
  DUNLOP_FERNDALE_ANNE_PRESET,
  'dunlop-ferndale-anne-detour',
  'route-2-dunlop-ferndale-anne',
]);
const YONGE_BIG_BAY_LITTLE_ALIASES = new Set([
  YONGE_BIG_BAY_LITTLE_PRESET,
  'yonge-big-bay-little',
  'route-8a-yonge-bigbay-little',
]);
const WELLINGTON_OWEN_GROVE_ALIASES = new Set([
  WELLINGTON_OWEN_GROVE_PRESET,
  'wellington-owen-grove-detour',
  'route-7-wellington-owen-grove',
  // Legacy Route 7 preset names now resolve to the replacement local workaround.
  'grove-stvincent-duckworth',
  'grove-st-vincent-duckworth',
  'route-7-grove-stvincent-duckworth',
]);

const FARMERS_MARKET_POINTS = {
  collierOwen: { latitude: 44.39043, longitude: -79.69007 },
  collierMulcaster: { latitude: 44.39047, longitude: -79.6855 },
  owenMcDonald: { latitude: 44.39262, longitude: -79.68792 },
  mcdonaldMulcaster: { latitude: 44.39267, longitude: -79.68558 },
  worsleyMulcaster: { latitude: 44.39157, longitude: -79.68552 },
};

const DUNLOP_FERNDALE_ANNE_POINTS = {
  ferndaleDunlop: { latitude: 44.37657, longitude: -79.71875 },
  anneDunlop: { latitude: 44.38237, longitude: -79.70522 },
  tiffinFerndale: { latitude: 44.36922, longitude: -79.71495 },
  tiffinAnne: { latitude: 44.37307, longitude: -79.69797 },
  anneRegularServiceNorth: { latitude: 44.3833, longitude: -79.7059 },
};

const YONGE_BIG_BAY_LITTLE_POINTS = {
  yongeLittle: { latitude: 44.36632, longitude: -79.66255 },
  yongeBigBayPoint: { latitude: 44.35652, longitude: -79.64698 },
  littleHuronia: { latitude: 44.3648, longitude: -79.6712 },
  bigBayPointHuronia: { latitude: 44.35334, longitude: -79.66451 },
};

const YONGE_BIG_BAY_LITTLE_CLOSED_SEGMENT = [
  { latitude: 44.36632, longitude: -79.66255 },
  { latitude: 44.36600, longitude: -79.66212 },
  { latitude: 44.36532, longitude: -79.66131 },
  { latitude: 44.36507, longitude: -79.66098 },
  { latitude: 44.36465, longitude: -79.66044 },
  { latitude: 44.36391, longitude: -79.65958 },
  { latitude: 44.36248, longitude: -79.65774 },
  { latitude: 44.36218, longitude: -79.65737 },
  { latitude: 44.36154, longitude: -79.65660 },
  { latitude: 44.36106, longitude: -79.65601 },
  { latitude: 44.36055, longitude: -79.65528 },
  { latitude: 44.35997, longitude: -79.65433 },
  { latitude: 44.35951, longitude: -79.65348 },
  { latitude: 44.35925, longitude: -79.65305 },
  { latitude: 44.35896, longitude: -79.65244 },
  { latitude: 44.35815, longitude: -79.65065 },
  { latitude: 44.35786, longitude: -79.65008 },
  { latitude: 44.35758, longitude: -79.64942 },
  { latitude: 44.35711, longitude: -79.64843 },
  { latitude: 44.35696, longitude: -79.64802 },
  { latitude: 44.35652, longitude: -79.64698 },
];

const WELLINGTON_OWEN_GROVE_POINTS = {
  bayfieldWellingtonEastbound: { latitude: 44.394131, longitude: -79.69412 },
  groveBayfieldEastbound: { latitude: 44.39659223, longitude: -79.69624255 },
  groveOwenEastbound: { latitude: 44.3984896, longitude: -79.69232901 },
  groveOwenWestbound: { latitude: 44.39829531, longitude: -79.6930308 },
  groveBayfieldWestbound: { latitude: 44.39644259, longitude: -79.6963538 },
  bayfieldWellingtonWestbound: { latitude: 44.39395278, longitude: -79.6942707 },
};

const WELLINGTON_OWEN_GROVE_DETOUR_EASTBOUND = [
  { latitude: 44.394178, longitude: -79.694003 },
  { latitude: 44.394036, longitude: -79.69389 },
  { latitude: 44.394002, longitude: -79.693716 },
  { latitude: 44.393876, longitude: -79.693586 },
  { latitude: 44.393899, longitude: -79.693535 },
  { latitude: 44.394183, longitude: -79.692896 },
  { latitude: 44.394628, longitude: -79.691862 },
  { latitude: 44.395355, longitude: -79.690233 },
  { latitude: 44.395391, longitude: -79.690151 },
  { latitude: 44.395459, longitude: -79.690206 },
  { latitude: 44.396475, longitude: -79.691047 },
  { latitude: 44.397266, longitude: -79.691716 },
  { latitude: 44.397762, longitude: -79.692137 },
  { latitude: 44.398317, longitude: -79.692599 },
  { latitude: 44.398408, longitude: -79.692668 },
];

const WELLINGTON_OWEN_GROVE_DETOUR_WESTBOUND = [
  ...WELLINGTON_OWEN_GROVE_DETOUR_EASTBOUND,
].reverse();

function isFiniteCoordinate(point) {
  return (
    point &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude))
  );
}

function normalizePoint(point) {
  return {
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
  };
}

function offsetPoint(point, offsetMeters = DEFAULT_OFFSET_METERS) {
  const normalized = normalizePoint(point);
  return {
    latitude: normalized.latitude + offsetMeters / 111_320,
    longitude: normalized.longitude,
  };
}

function selectRouteAndShape(staticData, requestedRouteId = DEFAULT_ROUTE_ID) {
  const routeShapeMapping = staticData?.routeShapeMapping;
  const shapes = staticData?.shapes;

  if (!(routeShapeMapping instanceof Map) || !(shapes instanceof Map)) {
    throw new Error('Static GTFS route/shape data is unavailable');
  }

  const availableRouteIds = Array.from(routeShapeMapping.keys()).sort();
  if (availableRouteIds.length === 0) {
    throw new Error('No routes are available in static GTFS data');
  }

  const routeId = requestedRouteId && routeShapeMapping.has(String(requestedRouteId))
    ? String(requestedRouteId)
    : availableRouteIds[0];

  const shapeIds = routeShapeMapping.get(routeId) || [];
  const shapeId = shapeIds.find((id) => Array.isArray(shapes.get(id)) && shapes.get(id).length >= 4);
  if (!shapeId) {
    throw new Error(`Route ${routeId} has no usable shape for simulation`);
  }

  const shape = shapes.get(shapeId).filter(isFiniteCoordinate).map(normalizePoint);
  if (shape.length < 4) {
    throw new Error(`Route ${routeId} shape ${shapeId} is too short for simulation`);
  }

  return {
    routeId,
    shapeId,
    shape,
    availableRouteIds,
  };
}

function buildSyntheticGeometry(shape, shapeId, offsetMeters = DEFAULT_OFFSET_METERS) {
  const lastIndex = shape.length - 1;
  const startIndex = Math.max(1, Math.floor(lastIndex * 0.30));
  const endIndex = Math.min(lastIndex - 1, Math.max(startIndex + 2, Math.floor(lastIndex * 0.58)));
  const middleIndex = Math.floor((startIndex + endIndex) / 2);

  const skippedSegmentPolyline = shape.slice(startIndex, endIndex + 1);
  const entryPoint = skippedSegmentPolyline[0];
  const exitPoint = skippedSegmentPolyline[skippedSegmentPolyline.length - 1];
  const inferredDetourPolyline = [
    entryPoint,
    offsetPoint(shape[startIndex], offsetMeters),
    offsetPoint(shape[middleIndex], offsetMeters),
    offsetPoint(shape[endIndex], offsetMeters),
    exitPoint,
  ];
  const likelyDetourPolyline = inferredDetourPolyline;

  return {
    shapeId,
    entryPoint,
    exitPoint,
    skippedSegmentPolyline,
    inferredDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames: [],
    roadMatchConfidence: null,
    roadMatchSource: 'dev-simulation',
    detourPathLabel: 'Likely detour path',
    confidence: 'medium',
    evidencePointCount: inferredDetourPolyline.length,
    lastEvidenceAt: new Date(),
    segments: [
      {
        segmentId: 'simulated-1',
        shapeId,
        entryPoint,
        exitPoint,
        skippedSegmentPolyline,
        inferredDetourPolyline,
        likelyDetourPolyline,
        likelyDetourRoadNames: [],
        roadMatchConfidence: null,
        roadMatchSource: 'dev-simulation',
        detourPathLabel: 'Likely detour path',
        confidence: 'medium',
        evidencePointCount: inferredDetourPolyline.length,
        lastEvidenceAt: new Date(),
      },
    ],
  };
}

function normalizePreset(value) {
  return String(value || '').trim().toLowerCase();
}

function isFarmersMarketPreset(options = {}) {
  return normalizePreset(options.preset) === FARMERS_MARKET_PRESET;
}

function isSaundersWelhamPreset(options = {}) {
  return SAUNDERS_WELHAM_ALIASES.has(normalizePreset(options.preset));
}

function isDunlopFerndaleAnnePreset(options = {}) {
  return DUNLOP_FERNDALE_ANNE_ALIASES.has(normalizePreset(options.preset));
}

function isYongeBigBayLittlePreset(options = {}) {
  return YONGE_BIG_BAY_LITTLE_ALIASES.has(normalizePreset(options.preset));
}

function isWellingtonOwenGrovePreset(options = {}) {
  return WELLINGTON_OWEN_GROVE_ALIASES.has(normalizePreset(options.preset));
}

function getFarmersMarketRouteIds(options = {}) {
  if (Array.isArray(options.routeIds) && options.routeIds.length > 0) {
    return options.routeIds.map((routeId) => String(routeId).trim()).filter(Boolean);
  }
  if (options.routeId) return [String(options.routeId).trim()];
  return FARMERS_MARKET_ROUTE_IDS;
}

function getSaundersWelhamRouteIds(options = {}) {
  if (Array.isArray(options.routeIds) && options.routeIds.length > 0) {
    return options.routeIds.map((routeId) => String(routeId).trim()).filter(Boolean);
  }
  if (options.routeId) return [String(options.routeId).trim()];
  return SAUNDERS_WELHAM_ROUTE_IDS;
}

function getDunlopFerndaleAnneRouteIds(options = {}) {
  if (Array.isArray(options.routeIds) && options.routeIds.length > 0) {
    return options.routeIds.map((routeId) => String(routeId).trim()).filter(Boolean);
  }
  if (options.routeId) return [String(options.routeId).trim()];
  return DUNLOP_FERNDALE_ANNE_ROUTE_IDS;
}

function getYongeBigBayLittleRouteIds(options = {}) {
  if (Array.isArray(options.routeIds) && options.routeIds.length > 0) {
    return options.routeIds.map((routeId) => String(routeId).trim()).filter(Boolean);
  }
  if (options.routeId) return [String(options.routeId).trim()];
  return YONGE_BIG_BAY_LITTLE_ROUTE_IDS;
}

function getWellingtonOwenGroveRouteIds(options = {}) {
  if (Array.isArray(options.routeIds) && options.routeIds.length > 0) {
    return options.routeIds.map((routeId) => String(routeId).trim()).filter(Boolean);
  }
  if (options.routeId) return [String(options.routeId).trim()];
  return WELLINGTON_OWEN_GROVE_ROUTE_IDS;
}

function selectExactRouteAndShape(staticData, routeId) {
  const normalizedRouteId = String(routeId);
  if (!staticData?.routeShapeMapping?.has(normalizedRouteId)) {
    throw new Error(`Route ${normalizedRouteId} is not available in static GTFS data`);
  }
  return selectRouteAndShape(staticData, normalizedRouteId);
}

function buildFarmersMarketGeometry(routeId, shapeId) {
  const {
    collierOwen,
    collierMulcaster,
    owenMcDonald,
    mcdonaldMulcaster,
    worsleyMulcaster,
  } = FARMERS_MARKET_POINTS;
  const skippedSegmentPolyline = [collierMulcaster, mcdonaldMulcaster];
  const inferredDetourPolyline = [collierOwen, owenMcDonald, mcdonaldMulcaster];
  const likelyDetourPolyline = inferredDetourPolyline;
  const likelyDetourRoadNames = ['Owen Street', 'McDonald Street', 'Mulcaster Street'];
  const entryPoint = collierOwen;
  const exitPoint = mcdonaldMulcaster;
  const lastEvidenceAt = new Date();

  return {
    shapeId,
    entryPoint,
    exitPoint,
    skippedSegmentPolyline,
    inferredDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames,
    roadMatchConfidence: 'medium',
    roadMatchSource: 'farmers-market-preset',
    detourPathLabel: 'Farmers Market test detour',
    confidence: 'medium',
    evidencePointCount: inferredDetourPolyline.length,
    lastEvidenceAt,
    segments: [
      {
        segmentId: 'farmers-market-simulated-1',
        shapeId,
        entryPoint,
        exitPoint,
        skippedSegmentPolyline,
        inferredDetourPolyline,
        likelyDetourPolyline,
        likelyDetourRoadNames,
        roadMatchConfidence: 'medium',
        roadMatchSource: 'farmers-market-preset',
        detourPathLabel: 'Farmers Market test detour',
        suppressStopDerivation: true,
        confidence: 'medium',
        evidencePointCount: inferredDetourPolyline.length,
        lastEvidenceAt,
      },
    ],
  };
}

function buildSaundersWelhamGeometry(routeId, shapeId) {
  const isRoute12A = String(routeId).toUpperCase() === '12A';
  const saundersWelhamWestbound = { latitude: 44.33425, longitude: -79.66897 };
  const saundersBayviewWestbound = { latitude: 44.33229, longitude: -79.6773 };
  const saundersBayviewEastbound = { latitude: 44.33289, longitude: -79.67783 };
  const saundersWelhamEastbound = { latitude: 44.3341, longitude: -79.66898 };
  const welhamMapleviewWestbound = { latitude: 44.33922, longitude: -79.67001 };
  const welhamMapleviewEastbound = { latitude: 44.33937, longitude: -79.66986 };
  const bayviewMapleview = { latitude: 44.33651, longitude: -79.6785 };
  const skippedSegmentPolyline = isRoute12A
    ? [saundersWelhamWestbound, saundersBayviewWestbound]
    : [saundersBayviewEastbound, saundersWelhamEastbound];
  const inferredDetourPolyline = isRoute12A
    ? [
      saundersWelhamWestbound,
      welhamMapleviewWestbound,
      bayviewMapleview,
      saundersBayviewWestbound,
    ]
    : [
      saundersBayviewEastbound,
      bayviewMapleview,
      welhamMapleviewEastbound,
      saundersWelhamEastbound,
    ];
  const likelyDetourPolyline = inferredDetourPolyline;
  const likelyDetourRoadNames = isRoute12A
    ? ['Welham Road', 'Mapleview Drive East', 'Bayview Drive']
    : ['Bayview Drive', 'Mapleview Drive East', 'Welham Road'];
  const entryPoint = skippedSegmentPolyline[0];
  const exitPoint = skippedSegmentPolyline[skippedSegmentPolyline.length - 1];
  const lastEvidenceAt = new Date();

  return {
    shapeId,
    entryPoint,
    exitPoint,
    skippedSegmentPolyline,
    inferredDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames,
    roadMatchConfidence: 'high',
    roadMatchSource: 'saunders-welham-preset',
    detourPathLabel: 'Saunders/Welham test detour',
    confidence: 'high',
    evidencePointCount: inferredDetourPolyline.length,
    lastEvidenceAt,
    segments: [
      {
        segmentId: `saunders-welham-${String(routeId).toLowerCase()}-simulated-1`,
        shapeId,
        entryPoint,
        exitPoint,
        skippedSegmentPolyline,
        inferredDetourPolyline,
        likelyDetourPolyline,
        likelyDetourRoadNames,
        roadMatchConfidence: 'high',
        roadMatchSource: 'saunders-welham-preset',
        detourPathLabel: 'Saunders/Welham test detour',
        confidence: 'high',
        evidencePointCount: inferredDetourPolyline.length,
        lastEvidenceAt,
      },
    ],
  };
}

function buildDunlopFerndaleAnneGeometry(routeId, shapeId) {
  const normalizedRouteId = String(routeId).toUpperCase();
  const isRoute2A = normalizedRouteId === '2A';
  const isRoute2B = normalizedRouteId === '2B';
  const {
    ferndaleDunlop,
    anneDunlop,
    tiffinFerndale,
    tiffinAnne,
    anneRegularServiceNorth,
  } = DUNLOP_FERNDALE_ANNE_POINTS;
  const skippedSegmentPolyline = isRoute2A || isRoute2B
    ? [ferndaleDunlop, anneDunlop]
    : [anneDunlop, ferndaleDunlop];
  const inferredDetourPolyline = isRoute2A
    ? [ferndaleDunlop, tiffinFerndale, tiffinAnne, anneDunlop]
    : isRoute2B
      ? [ferndaleDunlop, tiffinFerndale, tiffinAnne, anneRegularServiceNorth]
      : [anneDunlop, tiffinAnne, tiffinFerndale, ferndaleDunlop];
  const likelyDetourPolyline = inferredDetourPolyline;
  const likelyDetourRoadNames = isRoute2A || isRoute2B
    ? ['Ferndale Drive', 'Tiffin Street', 'Anne Street']
    : ['Anne Street', 'Tiffin Street', 'Ferndale Drive'];
  const entryPoint = skippedSegmentPolyline[0];
  const exitPoint = skippedSegmentPolyline[skippedSegmentPolyline.length - 1];
  const serviceRejoinPoint = isRoute2B ? anneRegularServiceNorth : null;
  const lastEvidenceAt = new Date();

  return {
    shapeId,
    entryPoint,
    exitPoint,
    serviceRejoinPoint,
    skippedSegmentPolyline,
    inferredDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames,
    roadMatchConfidence: 'high',
    roadMatchSource: 'dunlop-ferndale-anne-preset',
    detourPathLabel: 'Dunlop/Ferndale/Anne test detour',
    confidence: 'high',
    evidencePointCount: inferredDetourPolyline.length,
    lastEvidenceAt,
    segments: [
      {
        segmentId: `dunlop-ferndale-anne-${String(routeId).toLowerCase()}-simulated-1`,
        shapeId,
        entryPoint,
        exitPoint,
        serviceRejoinPoint,
        skippedSegmentPolyline,
        inferredDetourPolyline,
        likelyDetourPolyline,
        likelyDetourRoadNames,
        roadMatchConfidence: 'high',
        roadMatchSource: 'dunlop-ferndale-anne-preset',
        detourPathLabel: 'Dunlop/Ferndale/Anne test detour',
        confidence: 'high',
        evidencePointCount: inferredDetourPolyline.length,
        lastEvidenceAt,
      },
    ],
  };
}

function buildYongeBigBayLittleGeometry(routeId, shapeId) {
  const {
    yongeLittle,
    yongeBigBayPoint,
    littleHuronia,
    bigBayPointHuronia,
  } = YONGE_BIG_BAY_LITTLE_POINTS;
  const skippedSegmentPolyline = YONGE_BIG_BAY_LITTLE_CLOSED_SEGMENT;
  const inferredDetourPolyline = [
    yongeLittle,
    littleHuronia,
    bigBayPointHuronia,
    yongeBigBayPoint,
  ];
  const likelyDetourPolyline = inferredDetourPolyline;
  const likelyDetourRoadNames = ['Little Avenue', 'Huronia Road', 'Big Bay Point Road'];
  const entryPoint = skippedSegmentPolyline[0];
  const exitPoint = skippedSegmentPolyline[skippedSegmentPolyline.length - 1];
  const lastEvidenceAt = new Date();

  return {
    shapeId,
    entryPoint,
    exitPoint,
    skippedSegmentPolyline,
    inferredDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames,
    roadMatchConfidence: 'high',
    roadMatchSource: 'yonge-bigbay-little-preset',
    detourPathLabel: 'Yonge/Big Bay/Little test detour',
    confidence: 'high',
    evidencePointCount: inferredDetourPolyline.length,
    lastEvidenceAt,
    segments: [
      {
        segmentId: `yonge-bigbay-little-${String(routeId).toLowerCase()}-simulated-1`,
        shapeId,
        entryPoint,
        exitPoint,
        skippedSegmentPolyline,
        inferredDetourPolyline,
        likelyDetourPolyline,
        likelyDetourRoadNames,
        roadMatchConfidence: 'high',
        roadMatchSource: 'yonge-bigbay-little-preset',
        detourPathLabel: 'Yonge/Big Bay/Little test detour',
        confidence: 'high',
        evidencePointCount: inferredDetourPolyline.length,
        lastEvidenceAt,
      },
    ],
  };
}

function buildWellingtonOwenGroveGeometry(routeId, shapeId) {
  const isRoute7A = String(routeId).toUpperCase() === '7A';
  const {
    bayfieldWellingtonEastbound,
    groveBayfieldEastbound,
    groveOwenEastbound,
    groveOwenWestbound,
    groveBayfieldWestbound,
    bayfieldWellingtonWestbound,
  } = WELLINGTON_OWEN_GROVE_POINTS;
  const skippedSegmentPolyline = isRoute7A
    ? [bayfieldWellingtonEastbound, groveBayfieldEastbound, groveOwenEastbound]
    : [groveOwenWestbound, groveBayfieldWestbound, bayfieldWellingtonWestbound];
  const inferredDetourPolyline = isRoute7A
    ? WELLINGTON_OWEN_GROVE_DETOUR_EASTBOUND
    : WELLINGTON_OWEN_GROVE_DETOUR_WESTBOUND;
  const likelyDetourPolyline = inferredDetourPolyline;
  const likelyDetourRoadNames = isRoute7A
    ? ['Bayfield Street', 'Wellington Street East', 'Owen Street', 'Grove Street East']
    : ['Grove Street East', 'Owen Street', 'Wellington Street East', 'Bayfield Street'];
  const entryPoint = skippedSegmentPolyline[0];
  const exitPoint = skippedSegmentPolyline[skippedSegmentPolyline.length - 1];
  const lastEvidenceAt = new Date();

  return {
    shapeId,
    entryPoint,
    exitPoint,
    skippedSegmentPolyline,
    inferredDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames,
    roadMatchConfidence: 'high',
    roadMatchSource: 'wellington-owen-grove-preset',
    detourPathLabel: 'Wellington/Owen/Grove test detour',
    confidence: 'high',
    evidencePointCount: inferredDetourPolyline.length,
    lastEvidenceAt,
    segments: [
      {
        segmentId: `wellington-owen-grove-${String(routeId).toLowerCase()}-simulated-1`,
        shapeId,
        entryPoint,
        exitPoint,
        skippedSegmentPolyline,
        inferredDetourPolyline,
        likelyDetourPolyline,
        likelyDetourRoadNames,
        roadMatchConfidence: 'high',
        roadMatchSource: 'wellington-owen-grove-preset',
        detourPathLabel: 'Wellington/Owen/Grove test detour',
        confidence: 'high',
        evidencePointCount: inferredDetourPolyline.length,
        lastEvidenceAt,
      },
    ],
  };
}

function createSimulatedDetourDocument({ routeId, shapeId, geometry, durationMinutes = 30 }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(1, Number(durationMinutes) || 30) * 60_000);

  return {
    routeId,
    detectedAt: now,
    lastSeenAt: now,
    updatedAt: now.getTime(),
    triggerVehicleId: 'simulated-bus',
    vehicleCount: 1,
    state: 'active',
    isPersistent: false,
    simulated: true,
    source: 'dev-detour-simulation',
    expiresAt,
    shapeId,
    ...geometry,
  };
}

function getSimulatedDetourDocumentId(routeId, storageConfig = {}) {
  const normalizedRouteId = String(routeId || '').trim();
  if (storageConfig.detourVersion === 'v2') {
    return `simulated:${normalizedRouteId}`;
  }
  return normalizedRouteId;
}

function prepareSimulatedDetourDocument(doc, docId, storageConfig = {}) {
  if (storageConfig.detourVersion !== 'v2') return doc;
  return {
    ...doc,
    eventId: docId,
    detourEventId: docId,
    detourVersion: doc.detourVersion || 'v2-simulated',
    eventWindow: doc.eventWindow ?? null,
  };
}

function parsePositiveOffset(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOffsetCandidates(value) {
  return String(value || '')
    .split(',')
    .map((item) => parsePositiveOffset(item.trim()))
    .filter((item) => item !== null);
}

function getSimulationOffsetCandidates(options = {}, env = process.env) {
  const requestedOffset = parsePositiveOffset(options.offsetMeters);
  if (requestedOffset) return [requestedOffset];

  const configured = parseOffsetCandidates(env.DETOUR_SIMULATION_OFFSET_CANDIDATES_METERS);
  const candidates = configured.length > 0
    ? configured
    : DEFAULT_ROAD_MATCH_OFFSET_CANDIDATES_METERS;

  return Array.from(new Set(candidates)).filter((item) => item > 0);
}

function canTryRoadMatchCandidates(env = process.env) {
  return (
    env.DETOUR_ROAD_MATCHING_ENABLED === 'true' &&
    Boolean(String(env.DETOUR_ROAD_MATCHING_BASE_URL || '').trim())
  );
}

function isRoadMatchedGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return false;
  if (geometry.roadMatchSource && geometry.roadMatchSource !== 'dev-simulation') {
    return true;
  }
  return Array.isArray(geometry.segments) && geometry.segments.some((segment) => (
    segment?.roadMatchSource && segment.roadMatchSource !== 'dev-simulation'
  ));
}

function hasRoadMatchedPresetGeometry(originalGeometry, matchedGeometry) {
  if (!matchedGeometry || typeof matchedGeometry !== 'object') return false;
  if (matchedGeometry.roadMatchSource && matchedGeometry.roadMatchSource !== originalGeometry?.roadMatchSource) {
    return true;
  }
  return Array.isArray(matchedGeometry.segments) && matchedGeometry.segments.some((segment, index) => (
    segment?.roadMatchSource &&
    segment.roadMatchSource !== originalGeometry?.segments?.[index]?.roadMatchSource
  ));
}

async function maybeRoadMatchPresetGeometry(geometry, { env, matchGeometry, routeShapePolyline }) {
  if (!canTryRoadMatchCandidates(env)) return geometry;

  try {
    const matched = await matchGeometry(geometry, {
      env,
      routeShapePolyline,
      preferRouteMatching: true,
    });
    return hasRoadMatchedPresetGeometry(geometry, matched) ? matched : geometry;
  } catch (err) {
    console.warn('[detourSimulation] Preset road matching skipped:', err.message);
    return geometry;
  }
}

function getPrimarySimulationSegment(geometry) {
  return Array.isArray(geometry?.segments) && geometry.segments.length > 0
    ? geometry.segments[0]
    : geometry;
}

function getLikelySimulationPath(geometry) {
  const segment = getPrimarySimulationSegment(geometry);
  return Array.isArray(segment?.likelyDetourPolyline) && segment.likelyDetourPolyline.length >= 2
    ? segment.likelyDetourPolyline
    : Array.isArray(segment?.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2
      ? segment.inferredDetourPolyline
      : [];
}

function getSkippedSimulationPath(geometry) {
  const segment = getPrimarySimulationSegment(geometry);
  return Array.isArray(segment?.skippedSegmentPolyline) ? segment.skippedSegmentPolyline : [];
}

function getPolylineLengthMeters(polyline = []) {
  let length = 0;
  for (let index = 1; index < polyline.length; index += 1) {
    length += haversineDistance(
      polyline[index - 1].latitude,
      polyline[index - 1].longitude,
      polyline[index].latitude,
      polyline[index].longitude
    );
  }
  return length;
}

function getNearClosedSegmentRatio(detourPath = [], skippedPath = []) {
  if (detourPath.length < 3 || skippedPath.length < 2) return 0;

  const maxSamples = 24;
  const step = Math.max(1, Math.floor(detourPath.length / maxSamples));
  let sampleCount = 0;
  let nearCount = 0;

  for (let index = step; index < detourPath.length - step; index += step) {
    sampleCount += 1;
    if (pointToPolylineDistance(detourPath[index], skippedPath) <= 50) {
      nearCount += 1;
    }
  }

  return sampleCount > 0 ? nearCount / sampleCount : 0;
}

function scoreRoadMatchedSimulationGeometry(geometry) {
  const detourPath = getLikelySimulationPath(geometry);
  const skippedPath = getSkippedSimulationPath(geometry);
  const detourLength = getPolylineLengthMeters(detourPath);
  const skippedLength = Math.max(1, getPolylineLengthMeters(skippedPath));
  const lengthRatio = detourLength / skippedLength;
  const nearClosedRatio = getNearClosedSegmentRatio(detourPath, skippedPath);

  return lengthRatio + nearClosedRatio * 3;
}

async function buildMatchedSimulationGeometry({ shape, shapeId, options = {}, env, matchGeometry }) {
  const offsets = canTryRoadMatchCandidates(env)
    ? getSimulationOffsetCandidates(options, env)
    : [parsePositiveOffset(options.offsetMeters) || DEFAULT_OFFSET_METERS];

  let fallbackGeometry = null;
  let bestRoadMatchedGeometry = null;
  let bestRoadMatchedScore = Infinity;

  for (const offsetMeters of offsets) {
    const candidate = buildSyntheticGeometry(shape, shapeId, offsetMeters);
    let matched = candidate;

    try {
      matched = await matchGeometry(candidate, { env });
    } catch (err) {
      console.warn('[detourSimulation] Road matching skipped:', err.message);
    }

    if (!fallbackGeometry) {
      fallbackGeometry = matched;
    }

    if (isRoadMatchedGeometry(matched)) {
      const score = scoreRoadMatchedSimulationGeometry(matched);
      if (score < bestRoadMatchedScore) {
        bestRoadMatchedScore = score;
        bestRoadMatchedGeometry = matched;
      }
    }
  }

  return bestRoadMatchedGeometry || fallbackGeometry || buildSyntheticGeometry(shape, shapeId, DEFAULT_OFFSET_METERS);
}

function createDetourSimulationOps({
  env = process.env,
  loadStaticData = getStaticData,
  getFirestore = getDb,
  matchGeometry = matchDetourGeometry,
} = {}) {
  const storageConfig = buildDetourStorageConfig(env);

  function isEnabled() {
    return env.NODE_ENV !== 'production' && env.DETOUR_SIMULATION_ENABLED === 'true';
  }

  function disabledResult() {
    return {
      status: 403,
      body: {
        ok: false,
        enabled: false,
        error: 'Detour simulation is disabled. Set DETOUR_SIMULATION_ENABLED=true outside production.',
      },
    };
  }

  async function create(options = {}) {
    if (!isEnabled()) return disabledResult();

    const db = getFirestore();
    if (!db) {
      return {
        status: 500,
        body: {
          ok: false,
          enabled: true,
          error: 'Firestore is not configured, so the simulated detour cannot be published.',
        },
      };
    }

    const staticData = await loadStaticData();
    if (isFarmersMarketPreset(options)) {
      const requestedRouteIds = getFarmersMarketRouteIds(options);
      const availableRouteIds = Array.from(staticData.routeShapeMapping.keys()).sort();
      const writes = [];

      for (const requestedRouteId of requestedRouteIds) {
        const { routeId, shapeId, shape } = selectExactRouteAndShape(staticData, requestedRouteId);
        let geometry = buildFarmersMarketGeometry(routeId, shapeId);
        geometry = await maybeRoadMatchPresetGeometry(geometry, { env, matchGeometry, routeShapePolyline: shape });
        const doc = {
          ...createSimulatedDetourDocument({
            routeId,
            shapeId,
            geometry,
            durationMinutes: options.durationMinutes,
          }),
          confidence: 'high',
          vehicleCount: 2,
          segments: Array.isArray(geometry.segments)
            ? geometry.segments.map((segment) => ({ ...segment, confidence: 'high' }))
            : geometry.segments,
          testPreset: FARMERS_MARKET_PRESET,
          title: "Farmer's Market Detour - Route 11",
          description: 'Test detour for Route 11 around the Saturday Farmers Market closure on Mulcaster Street between Collier Street and Worsley Street.',
          affectedStops: ['191', '192', '556', '557'],
        };

        const docId = getSimulatedDetourDocumentId(routeId, storageConfig);
        await db.collection(storageConfig.activeCollection)
          .doc(docId)
          .set(prepareSimulatedDetourDocument(doc, docId, storageConfig), { merge: true });
        writes.push({ routeId, shapeId, expiresAt: doc.expiresAt.toISOString() });
      }

      return {
        status: 200,
        body: {
          ok: true,
          enabled: true,
          simulated: true,
          preset: FARMERS_MARKET_PRESET,
          routeIds: writes.map((write) => write.routeId),
          shapeIds: writes.map((write) => write.shapeId),
          segmentCount: writes.length,
          expiresAt: writes[0]?.expiresAt || null,
          availableRouteIds,
          message: "Simulated Farmer's Market detour published for route 11.",
        },
      };
    }

    if (isSaundersWelhamPreset(options)) {
      const requestedRouteIds = getSaundersWelhamRouteIds(options);
      const availableRouteIds = Array.from(staticData.routeShapeMapping.keys()).sort();
      const writes = [];

      for (const requestedRouteId of requestedRouteIds) {
        const { routeId, shapeId, shape } = selectExactRouteAndShape(staticData, requestedRouteId);
        let geometry = buildSaundersWelhamGeometry(routeId, shapeId);
        geometry = await maybeRoadMatchPresetGeometry(geometry, { env, matchGeometry, routeShapePolyline: shape });
        const doc = {
          ...createSimulatedDetourDocument({
            routeId,
            shapeId,
            geometry,
            durationMinutes: options.durationMinutes,
          }),
          confidence: 'high',
          vehicleCount: 2,
          segments: Array.isArray(geometry.segments)
            ? geometry.segments.map((segment) => ({ ...segment, confidence: 'high' }))
            : geometry.segments,
          testPreset: SAUNDERS_WELHAM_PRESET,
          title: 'Saunders/Welham Detour - Route 12',
          description: 'Test detour around the Saunders Road and Welham Road intersection closure.',
          affectedStops: ['618', '933', '738', '757', '680', '681'],
        };

        const docId = getSimulatedDetourDocumentId(routeId, storageConfig);
        await db.collection(storageConfig.activeCollection)
          .doc(docId)
          .set(prepareSimulatedDetourDocument(doc, docId, storageConfig), { merge: true });
        writes.push({ routeId, shapeId, expiresAt: doc.expiresAt.toISOString() });
      }

      return {
        status: 200,
        body: {
          ok: true,
          enabled: true,
          simulated: true,
          preset: SAUNDERS_WELHAM_PRESET,
          routeIds: writes.map((write) => write.routeId),
          shapeIds: writes.map((write) => write.shapeId),
          segmentCount: writes.length,
          expiresAt: writes[0]?.expiresAt || null,
          availableRouteIds,
          message: 'Simulated Saunders/Welham detours published for routes 12A and 12B.',
        },
      };
    }

    if (isDunlopFerndaleAnnePreset(options)) {
      const requestedRouteIds = getDunlopFerndaleAnneRouteIds(options);
      const availableRouteIds = Array.from(staticData.routeShapeMapping.keys()).sort();
      const writes = [];

      for (const requestedRouteId of requestedRouteIds) {
        const { routeId, shapeId, shape } = selectExactRouteAndShape(staticData, requestedRouteId);
        let geometry = buildDunlopFerndaleAnneGeometry(routeId, shapeId);
        geometry = await maybeRoadMatchPresetGeometry(geometry, { env, matchGeometry, routeShapePolyline: shape });
        const doc = {
          ...createSimulatedDetourDocument({
            routeId,
            shapeId,
            geometry,
            durationMinutes: options.durationMinutes,
          }),
          confidence: 'high',
          vehicleCount: 2,
          segments: Array.isArray(geometry.segments)
            ? geometry.segments.map((segment) => ({ ...segment, confidence: 'high' }))
            : geometry.segments,
          testPreset: DUNLOP_FERNDALE_ANNE_PRESET,
          title: 'Dunlop/Ferndale/Anne Detour - Route 2',
          description: 'Test detour around a Dunlop Street West closure between Ferndale Drive and Anne Street.',
          affectedStops: ['271', '893', '277', '934', '266', '265', '276', '269', '268'],
        };

        const docId = getSimulatedDetourDocumentId(routeId, storageConfig);
        await db.collection(storageConfig.activeCollection)
          .doc(docId)
          .set(prepareSimulatedDetourDocument(doc, docId, storageConfig), { merge: true });
        writes.push({ routeId, shapeId, expiresAt: doc.expiresAt.toISOString() });
      }

      return {
        status: 200,
        body: {
          ok: true,
          enabled: true,
          simulated: true,
          preset: DUNLOP_FERNDALE_ANNE_PRESET,
          routeIds: writes.map((write) => write.routeId),
          shapeIds: writes.map((write) => write.shapeId),
          segmentCount: writes.length,
          expiresAt: writes[0]?.expiresAt || null,
          availableRouteIds,
          message: 'Simulated Dunlop/Ferndale/Anne detours published for routes 2A and 2B.',
        },
      };
    }

    if (isYongeBigBayLittlePreset(options)) {
      const requestedRouteIds = getYongeBigBayLittleRouteIds(options);
      const availableRouteIds = Array.from(staticData.routeShapeMapping.keys()).sort();
      const writes = [];

      for (const requestedRouteId of requestedRouteIds) {
        const { routeId, shapeId, shape } = selectExactRouteAndShape(staticData, requestedRouteId);
        let geometry = buildYongeBigBayLittleGeometry(routeId, shapeId);
        geometry = await maybeRoadMatchPresetGeometry(geometry, { env, matchGeometry, routeShapePolyline: shape });
        const doc = {
          ...createSimulatedDetourDocument({
            routeId,
            shapeId,
            geometry,
            durationMinutes: options.durationMinutes,
          }),
          confidence: 'high',
          vehicleCount: 2,
          segments: Array.isArray(geometry.segments)
            ? geometry.segments.map((segment) => ({ ...segment, confidence: 'high' }))
            : geometry.segments,
          testPreset: YONGE_BIG_BAY_LITTLE_PRESET,
          title: 'Yonge/Big Bay/Little Detour - Route 8A',
          description: 'Test detour around a Yonge Street closure between Little Avenue and Big Bay Point Road.',
          affectedStops: ['718', '717', '705', '704', '765', '774'],
        };

        const docId = getSimulatedDetourDocumentId(routeId, storageConfig);
        await db.collection(storageConfig.activeCollection)
          .doc(docId)
          .set(prepareSimulatedDetourDocument(doc, docId, storageConfig), { merge: true });
        writes.push({ routeId, shapeId, expiresAt: doc.expiresAt.toISOString() });
      }

      return {
        status: 200,
        body: {
          ok: true,
          enabled: true,
          simulated: true,
          preset: YONGE_BIG_BAY_LITTLE_PRESET,
          routeIds: writes.map((write) => write.routeId),
          shapeIds: writes.map((write) => write.shapeId),
          segmentCount: writes.length,
          expiresAt: writes[0]?.expiresAt || null,
          availableRouteIds,
          message: 'Simulated Yonge/Big Bay/Little detour published for route 8A.',
        },
      };
    }

    if (isWellingtonOwenGrovePreset(options)) {
      const requestedRouteIds = getWellingtonOwenGroveRouteIds(options);
      const availableRouteIds = Array.from(staticData.routeShapeMapping.keys()).sort();
      const writes = [];

      for (const requestedRouteId of requestedRouteIds) {
        const { routeId, shapeId, shape } = selectExactRouteAndShape(staticData, requestedRouteId);
        let geometry = buildWellingtonOwenGroveGeometry(routeId, shapeId);
        geometry = await maybeRoadMatchPresetGeometry(geometry, { env, matchGeometry, routeShapePolyline: shape });
        const doc = {
          ...createSimulatedDetourDocument({
            routeId,
            shapeId,
            geometry,
            durationMinutes: options.durationMinutes,
          }),
          confidence: 'high',
          vehicleCount: 2,
          segments: Array.isArray(geometry.segments)
            ? geometry.segments.map((segment) => ({ ...segment, confidence: 'high' }))
            : geometry.segments,
          testPreset: WELLINGTON_OWEN_GROVE_PRESET,
          title: 'Wellington/Owen/Grove Detour - Route 7',
          description: 'Test detour around a Grove Street East closure between Bayfield Street and Owen Street.',
          affectedStops: ['67', '68'],
        };

        const docId = getSimulatedDetourDocumentId(routeId, storageConfig);
        await db.collection(storageConfig.activeCollection)
          .doc(docId)
          .set(prepareSimulatedDetourDocument(doc, docId, storageConfig), { merge: true });
        writes.push({ routeId, shapeId, expiresAt: doc.expiresAt.toISOString() });
      }

      return {
        status: 200,
        body: {
          ok: true,
          enabled: true,
          simulated: true,
          preset: WELLINGTON_OWEN_GROVE_PRESET,
          routeIds: writes.map((write) => write.routeId),
          shapeIds: writes.map((write) => write.shapeId),
          segmentCount: writes.length,
          expiresAt: writes[0]?.expiresAt || null,
          availableRouteIds,
          message: 'Simulated Wellington/Owen/Grove detours published for routes 7A and 7B.',
        },
      };
    }

    const { routeId, shapeId, shape, availableRouteIds } = selectRouteAndShape(staticData, options.routeId);
    const geometry = await buildMatchedSimulationGeometry({
      shape,
      shapeId,
      options,
      env,
      matchGeometry,
    });
    const doc = createSimulatedDetourDocument({
      routeId,
      shapeId,
      geometry,
      durationMinutes: options.durationMinutes,
    });

    const docId = getSimulatedDetourDocumentId(routeId, storageConfig);
    await db.collection(storageConfig.activeCollection)
      .doc(docId)
      .set(prepareSimulatedDetourDocument(doc, docId, storageConfig), { merge: true });

    return {
      status: 200,
      body: {
        ok: true,
        enabled: true,
        simulated: true,
        routeId,
        shapeId,
        segmentCount: doc.segments.length,
        roadMatchSource: doc.roadMatchSource || null,
        roadMatchConfidence: doc.roadMatchConfidence || null,
        expiresAt: doc.expiresAt.toISOString(),
        availableRouteIds,
        message: `Simulated detour published for route ${routeId}.`,
      },
    };
  }

  async function clear(options = {}) {
    if (!isEnabled()) return disabledResult();

    const routeId = options.routeId ? String(options.routeId) : null;
    if (!routeId) {
      return {
        status: 400,
        body: {
          ok: false,
          error: 'routeId is required to clear a simulated detour.',
        },
      };
    }

    const db = getFirestore();
    if (!db) {
      return {
        status: 500,
        body: {
          ok: false,
          enabled: true,
          error: 'Firestore is not configured, so the simulated detour cannot be cleared.',
        },
      };
    }

    const docId = getSimulatedDetourDocumentId(routeId, storageConfig);
    await db.collection(storageConfig.activeCollection).doc(docId).delete();

    return {
      status: 200,
      body: {
        ok: true,
        enabled: true,
        routeId,
        message: `Simulated detour cleared for route ${routeId}.`,
      },
    };
  }

  return {
    isEnabled,
    create,
    clear,
  };
}

module.exports = {
  buildDunlopFerndaleAnneGeometry,
  buildFarmersMarketGeometry,
  buildWellingtonOwenGroveGeometry,
  buildMatchedSimulationGeometry,
  buildSaundersWelhamGeometry,
  buildSyntheticGeometry,
  buildYongeBigBayLittleGeometry,
  createDetourSimulationOps,
  getSimulationOffsetCandidates,
  selectRouteAndShape,
};

