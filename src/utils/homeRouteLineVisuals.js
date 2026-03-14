import {
  haversineDistance,
  pathsOverlap,
  pointToPolylineDistance,
  simplifyPath,
} from './geometryUtils';
import {
  getRepresentativeShapeIds,
  getRepresentativeShapeIdsByDirection,
} from './routeShapeUtils';

const BRANCH_FAMILIES = [
  { familyId: '2', routeIds: ['2A', '2B'] },
  { familyId: '8', routeIds: ['8A', '8B'] },
  { familyId: '12', routeIds: ['12A', '12B'] },
];

const LOOP_PAIRS = [
  { pairId: '10-11', routeIds: ['10', '11'] },
  { pairId: '100-101', routeIds: ['100', '101'] },
];

const SHARED_TRUNK_COLOR = '#8F9BA8';
const SHARED_PROXIMITY_METERS = 40;
const SHARED_OVERLAP_THRESHOLD = 0.3;
const MIN_SEGMENT_LENGTH_METERS = 120;

const measurePathLengthMeters = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return 0;

  let length = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    length += haversineDistance(
      coordinates[i - 1].latitude,
      coordinates[i - 1].longitude,
      coordinates[i].latitude,
      coordinates[i].longitude
    );
  }
  return length;
};

const sanitizePath = (coordinates) => {
  if (!Array.isArray(coordinates)) return [];
  const filtered = coordinates.filter(
    (coord) => Number.isFinite(coord?.latitude) && Number.isFinite(coord?.longitude)
  );
  return simplifyPath(filtered, 12);
};

const buildShapeDescriptor = ({
  id,
  coordinates,
  color,
  routeId,
  shapeId,
  visualType = 'route',
  sourceRouteIds = routeId ? [routeId] : [],
}) => ({
  id,
  coordinates: sanitizePath(coordinates),
  color,
  routeId,
  shapeId,
  visualType,
  sourceRouteIds,
});

const getRepresentativePathForRoute = ({
  routeId,
  routeShapeMapping,
  shapeSource,
  shapeDirectionMap,
}) => {
  const shapeIds = routeShapeMapping[routeId] || [];
  const [shapeId] = getRepresentativeShapeIdsByDirection(
    shapeIds,
    shapeSource,
    shapeDirectionMap,
    { maxShapes: 1, precision: 3 }
  );

  if (!shapeId || !Array.isArray(shapeSource[shapeId]) || shapeSource[shapeId].length < 2) {
    return null;
  }

  return {
    shapeId,
    coordinates: sanitizePath(shapeSource[shapeId]),
  };
};

const extractSegments = (path, mask, includeShared) => {
  if (!Array.isArray(path) || path.length < 2 || !Array.isArray(mask) || mask.length !== path.length) {
    return [];
  }

  const segments = [];
  let startIndex = null;

  for (let i = 0; i < mask.length; i += 1) {
    const matches = mask[i] === includeShared;

    if (matches && startIndex === null) {
      startIndex = i;
    }

    const closesRun = startIndex !== null && (!matches || i === mask.length - 1);
    if (!closesRun) {
      continue;
    }

    const endIndex = matches && i === mask.length - 1 ? i : i - 1;
    const segmentStart = Math.max(0, startIndex - 1);
    const segmentEnd = Math.min(path.length - 1, endIndex + 1);
    const coordinates = sanitizePath(path.slice(segmentStart, segmentEnd + 1));

    if (
      coordinates.length >= 2 &&
      measurePathLengthMeters(coordinates) >= MIN_SEGMENT_LENGTH_METERS
    ) {
      segments.push(coordinates);
    }

    startIndex = null;
  }

  return segments;
};

const buildLoopPairVisuals = ({
  routeA,
  routeB,
  colorA,
  colorB,
  routeShapeMapping,
  shapeSource,
  shapeDirectionMap,
}) => {
  const repA = getRepresentativePathForRoute({
    routeId: routeA,
    routeShapeMapping,
    shapeSource,
    shapeDirectionMap,
  });
  const repB = getRepresentativePathForRoute({
    routeId: routeB,
    routeShapeMapping,
    shapeSource,
    shapeDirectionMap,
  });

  if (!repA || !repB) return null;

  if (
    !pathsOverlap(
      repA.coordinates,
      repB.coordinates,
      SHARED_PROXIMITY_METERS,
      SHARED_OVERLAP_THRESHOLD
    )
  ) {
    return null;
  }

  const sharedMaskA = repA.coordinates.map(
    (point) => pointToPolylineDistance(point, repB.coordinates) <= SHARED_PROXIMITY_METERS
  );
  const sharedMaskB = repB.coordinates.map(
    (point) => pointToPolylineDistance(point, repA.coordinates) <= SHARED_PROXIMITY_METERS
  );

  const sharedSegments = extractSegments(repA.coordinates, sharedMaskA, true);
  const uniqueSegmentsA = extractSegments(repA.coordinates, sharedMaskA, false);
  const uniqueSegmentsB = extractSegments(repB.coordinates, sharedMaskB, false);

  if (sharedSegments.length === 0 || uniqueSegmentsA.length === 0 || uniqueSegmentsB.length === 0) {
    return null;
  }

  return [
    ...sharedSegments.map((coordinates, index) =>
      buildShapeDescriptor({
        id: `shared:${routeA}:${routeB}:${index}`,
        coordinates,
        color: SHARED_TRUNK_COLOR,
        routeId: `${routeA}-${routeB}-shared`,
        shapeId: `shared:${routeA}:${routeB}:${index}`,
        visualType: 'shared_trunk',
        sourceRouteIds: [routeA, routeB],
      })
    ),
    ...uniqueSegmentsA.map((coordinates, index) =>
      buildShapeDescriptor({
        id: `route:${routeA}:tail:${index}`,
        coordinates,
        color: colorA,
        routeId: routeA,
        shapeId: `${repA.shapeId}:tail:${index}`,
        visualType: 'route_tail',
      })
    ),
    ...uniqueSegmentsB.map((coordinates, index) =>
      buildShapeDescriptor({
        id: `route:${routeB}:tail:${index}`,
        coordinates,
        color: colorB,
        routeId: routeB,
        shapeId: `${repB.shapeId}:tail:${index}`,
        visualType: 'route_tail',
      })
    ),
  ];
};

export const buildNativeHomeAllRoutesShapes = ({
  routeShapeMapping,
  processedShapes,
  shapes,
  shapeDirectionMap,
  getRouteColor,
}) => {
  const shapeSource =
    processedShapes && Object.keys(processedShapes).length > 0 ? processedShapes : shapes;
  const shapesToDisplay = [];
  const handledRouteIds = new Set();

  BRANCH_FAMILIES.forEach(({ familyId, routeIds }) => {
    const availableRouteIds = routeIds.filter((routeId) => (routeShapeMapping[routeId] || []).length > 0);
    if (availableRouteIds.length < 2) return;

    const familyShapeIds = availableRouteIds.flatMap((routeId) => routeShapeMapping[routeId] || []);
    const [shapeId] = getRepresentativeShapeIds(familyShapeIds, shapeSource, {
      maxShapes: 1,
      precision: 3,
    });

    if (!shapeId || !Array.isArray(shapeSource[shapeId]) || shapeSource[shapeId].length < 2) {
      return;
    }

    shapesToDisplay.push(
      buildShapeDescriptor({
        id: `family:${familyId}:${shapeId}`,
        coordinates: shapeSource[shapeId],
        color: getRouteColor(availableRouteIds[0]),
        routeId: familyId,
        shapeId,
        visualType: 'family',
        sourceRouteIds: availableRouteIds,
      })
    );

    availableRouteIds.forEach((routeId) => handledRouteIds.add(routeId));
  });

  LOOP_PAIRS.forEach(({ routeIds }) => {
    const [routeA, routeB] = routeIds;
    if ((routeShapeMapping[routeA] || []).length === 0 || (routeShapeMapping[routeB] || []).length === 0) {
      return;
    }

    const pairVisuals = buildLoopPairVisuals({
      routeA,
      routeB,
      colorA: getRouteColor(routeA),
      colorB: getRouteColor(routeB),
      routeShapeMapping,
      shapeSource,
      shapeDirectionMap,
    });

    if (pairVisuals) {
      shapesToDisplay.push(...pairVisuals);
      handledRouteIds.add(routeA);
      handledRouteIds.add(routeB);
    }
  });

  Object.keys(routeShapeMapping || {}).forEach((routeId) => {
    if (handledRouteIds.has(routeId)) return;

    const shapeIds = routeShapeMapping[routeId] || [];
    const representativeIds = getRepresentativeShapeIdsByDirection(
      shapeIds,
      shapeSource,
      shapeDirectionMap,
      {
        maxShapes: 2,
        precision: 3,
      }
    );

    representativeIds.forEach((shapeId) => {
      if (!Array.isArray(shapeSource[shapeId]) || shapeSource[shapeId].length < 2) {
        return;
      }

      shapesToDisplay.push(
        buildShapeDescriptor({
          id: `${routeId}:${shapeId}`,
          coordinates: shapeSource[shapeId],
          color: getRouteColor(routeId),
          routeId,
          shapeId,
        })
      );
    });
  });

  return shapesToDisplay.filter((shape) => Array.isArray(shape.coordinates) && shape.coordinates.length >= 2);
};

export const __TEST_ONLY__ = {
  BRANCH_FAMILIES,
  LOOP_PAIRS,
  SHARED_TRUNK_COLOR,
  extractSegments,
  measurePathLengthMeters,
};
