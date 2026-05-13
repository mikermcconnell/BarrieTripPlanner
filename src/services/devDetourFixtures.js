const nowIso = () => new Date().toISOString();

const createDetour = ({
  routeId,
  shapeId = null,
  entryPoint = null,
  exitPoint = null,
  skippedSegmentPolyline,
  likelyDetourPolyline,
  likelyDetourRoadNames,
  detourPathLabel,
  title,
  description,
  affectedStops = [],
  suppressStopDerivation = false,
}) => {
  const timestamp = nowIso();
  const segment = {
    segmentId: `dev-fixture-${routeId}-1`,
    shapeId,
    entryPoint: entryPoint ?? skippedSegmentPolyline[0],
    exitPoint: exitPoint ?? skippedSegmentPolyline[skippedSegmentPolyline.length - 1],
    skippedSegmentPolyline,
    inferredDetourPolyline: likelyDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames,
    roadMatchConfidence: 'high',
    roadMatchSource: 'dev-fixture',
    detourPathLabel,
    suppressStopDerivation,
    confidence: 'high',
    evidencePointCount: likelyDetourPolyline.length,
    lastEvidenceAt: timestamp,
  };

  return {
    routeId,
    shapeId,
    detectedAt: timestamp,
    lastSeenAt: timestamp,
    vehicleCount: 2,
    state: 'active',
    simulated: true,
    source: 'dev-detour-fixture',
    title,
    description,
    affectedStops,
    confidence: 'high',
    evidencePointCount: likelyDetourPolyline.length,
    lastEvidenceAt: timestamp,
    entryPoint: segment.entryPoint,
    exitPoint: segment.exitPoint,
    skippedSegmentPolyline,
    inferredDetourPolyline: likelyDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames,
    roadMatchConfidence: 'high',
    roadMatchSource: 'dev-fixture',
    detourPathLabel,
    segments: [segment],
  };
};

const saundersWelhamFixtures = () => {
  const saundersWelhamWestbound = { latitude: 44.33425, longitude: -79.66897 };
  const saundersBayviewWestbound = { latitude: 44.33229, longitude: -79.6773 };
  const saundersBayviewEastbound = { latitude: 44.33289, longitude: -79.67783 };
  const saundersWelhamEastbound = { latitude: 44.3341, longitude: -79.66898 };
  const welhamMapleviewWestbound = { latitude: 44.33922, longitude: -79.67001 };
  const welhamMapleviewEastbound = { latitude: 44.33937, longitude: -79.66986 };
  const bayviewMapleview = { latitude: 44.33651, longitude: -79.6785 };

  return {
    '12A': createDetour({
      routeId: '12A',
      skippedSegmentPolyline: [saundersWelhamWestbound, saundersBayviewWestbound],
      likelyDetourPolyline: [saundersWelhamWestbound, welhamMapleviewWestbound, bayviewMapleview, saundersBayviewWestbound],
      likelyDetourRoadNames: ['Welham Road', 'Mapleview Drive East', 'Bayview Drive'],
      detourPathLabel: 'Saunders/Welham test detour',
      title: 'Saunders/Welham Detour - Route 12',
      description: 'Saunders Road and Welham Road intersection closure.',
      affectedStops: ['618', '933', '738', '757', '680', '681'],
    }),
    '12B': createDetour({
      routeId: '12B',
      skippedSegmentPolyline: [saundersBayviewEastbound, saundersWelhamEastbound],
      likelyDetourPolyline: [saundersBayviewEastbound, bayviewMapleview, welhamMapleviewEastbound, saundersWelhamEastbound],
      likelyDetourRoadNames: ['Bayview Drive', 'Mapleview Drive East', 'Welham Road'],
      detourPathLabel: 'Saunders/Welham test detour',
      title: 'Saunders/Welham Detour - Route 12',
      description: 'Saunders Road and Welham Road intersection closure.',
      affectedStops: ['618', '933', '738', '757', '680', '681'],
    }),
  };
};

const parsePresetNames = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const DEFAULT_DEV_PRESET = '';

export const getDevDetourFixturePreset = () => {
  if (process.env.NODE_ENV === 'test') return '';

  const configuredPreset = process.env.EXPO_PUBLIC_DETOUR_FIXTURE_PRESET;
  if (configuredPreset && configuredPreset.trim()) {
    return configuredPreset;
  }

  return typeof __DEV__ !== 'undefined' && __DEV__ ? DEFAULT_DEV_PRESET : '';
};

export const getDevDetourFixtures = (presetValue) => {
  const names = parsePresetNames(presetValue);
  if (names.length === 0) return {};

  return names.reduce((fixtures, name) => {
    if (name === 'saunders-welham') {
      return { ...fixtures, ...saundersWelhamFixtures() };
    }
    return fixtures;
  }, {});
};

export const getEnabledDevDetourFixtures = () => getDevDetourFixtures(getDevDetourFixturePreset());
