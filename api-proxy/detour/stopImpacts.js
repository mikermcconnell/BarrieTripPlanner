'use strict';

const { pointToPolylineDistance, haversineDistance } = require('../geometry');
const { buildCumulativeDistances, findClosestShapePoint } = require('./geometry/polyline');
const { pickPrimarySegment } = require('./geometry/segmentSelection');

const DEFAULT_ROUTE_STOP_SEQUENCE_KEY = '__default__';
const STOP_ROUTE_PROJECTION_MAX_METERS = 120;
const ROUTE_PROGRESS_TOLERANCE_METERS = 20;
const DETOUR_PATH_STOP_SERVICE_PROXIMITY_METERS = 45;
const DETOUR_PATH_ENDPOINT_BUFFER_METERS = 60;
const DETOUR_STOP_IMPACT_BOUNDARY_BUFFER_METERS = 45;
const STOP_SERVICE_GPS_PROXIMITY_METERS = 55;
const STOP_SERVICE_GPS_PROGRESS_TOLERANCE_METERS = 70;
const MAJOR_TERMINAL_NAME_PATTERN = /\b(?:transit\s+(?:terminal|hub)|bus\s+(?:terminal|station)|go\s+(?:station|platform)|station\s+platform|terminal)\b/i;
const POSITIVE_SKIP_PROGRESS_TOLERANCE_METERS = 150;

function normalizeStopId(value) {
  return value == null ? null : String(value).trim();
}

function normalizeRouteId(value) {
  return value == null ? null : String(value).trim();
}

function isFiniteCoordinate(point) {
  return (
    Number.isFinite(Number(point?.latitude)) &&
    Number.isFinite(Number(point?.longitude))
  );
}

function normalizeStop(stop) {
  if (!stop) return null;
  const id = normalizeStopId(stop.id ?? stop.stop_id ?? stop.stopId);
  if (!id || !isFiniteCoordinate(stop)) return null;

  return {
    id,
    code: normalizeStopId(stop.code ?? stop.stop_code ?? stop.stopCode) || id,
    name: String(stop.name ?? stop.stop_name ?? '').trim(),
    latitude: Number(stop.latitude ?? stop.stop_lat),
    longitude: Number(stop.longitude ?? stop.stop_lon),
    locationType: Number.parseInt(String(stop.locationType ?? stop.location_type ?? 0), 10) || 0,
    parentStation: normalizeStopId(stop.parentStation ?? stop.parent_station),
  };
}

function isMajorTerminalStop(stop = {}) {
  if (!stop || typeof stop !== 'object') return false;
  const locationType = Number.parseInt(String(stop.locationType ?? stop.location_type ?? 0), 10) || 0;
  const parentStation = normalizeStopId(stop.parentStation ?? stop.parent_station);
  const name = String(stop.name ?? stop.stop_name ?? '').trim();
  return locationType === 1 || Boolean(parentStation) || MAJOR_TERMINAL_NAME_PATTERN.test(name);
}

function pickCanonicalStopSequence(patternMap) {
  const patterns = Array.from(patternMap.values());
  if (patterns.length === 0) return [];

  patterns.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.stopIds.length !== a.stopIds.length) return b.stopIds.length - a.stopIds.length;
    return a.signature.localeCompare(b.signature);
  });

  return patterns[0].stopIds;
}

function buildRouteStopSequencesMapping(tripsRaw = [], stopTimesRaw = []) {
  const tripMetaById = new Map();
  tripsRaw.forEach((trip) => {
    const tripId = trip.trip_id ?? trip.tripId;
    const routeId = trip.route_id ?? trip.routeId;
    if (!tripId || !routeId) return;
    tripMetaById.set(tripId, {
      routeId,
      shapeId: trip.shape_id ?? trip.shapeId ?? null,
    });
  });

  const stopTimesByTrip = new Map();
  stopTimesRaw.forEach((stopTime) => {
    const tripId = stopTime.trip_id ?? stopTime.tripId;
    if (!tripId || !tripMetaById.has(tripId)) return;
    if (!stopTimesByTrip.has(tripId)) stopTimesByTrip.set(tripId, []);
    stopTimesByTrip.get(tripId).push(stopTime);
  });

  const patternsByRoute = {};
  for (const [tripId, tripStopTimes] of stopTimesByTrip.entries()) {
    const tripMeta = tripMetaById.get(tripId);
    const orderedStopIds = tripStopTimes
      .slice()
      .sort((a, b) => Number(a.stop_sequence ?? a.stopSequence) - Number(b.stop_sequence ?? b.stopSequence))
      .map((stopTime) => normalizeStopId(stopTime.stop_id ?? stopTime.stopId))
      .filter(Boolean);
    if (orderedStopIds.length === 0) continue;

    const routeId = tripMeta.routeId;
    const shapeKey = tripMeta.shapeId || DEFAULT_ROUTE_STOP_SEQUENCE_KEY;
    const signature = orderedStopIds.join('|');

    if (!patternsByRoute[routeId]) patternsByRoute[routeId] = {};
    if (!patternsByRoute[routeId][shapeKey]) patternsByRoute[routeId][shapeKey] = new Map();
    if (!patternsByRoute[routeId][DEFAULT_ROUTE_STOP_SEQUENCE_KEY]) {
      patternsByRoute[routeId][DEFAULT_ROUTE_STOP_SEQUENCE_KEY] = new Map();
    }

    [shapeKey, DEFAULT_ROUTE_STOP_SEQUENCE_KEY].forEach((key) => {
      const patternMap = patternsByRoute[routeId][key];
      const existing = patternMap.get(signature);
      patternMap.set(signature, {
        signature,
        stopIds: orderedStopIds,
        count: (existing?.count || 0) + 1,
      });
    });
  }

  return Object.fromEntries(
    Object.entries(patternsByRoute).map(([routeId, shapePatterns]) => [
      routeId,
      Object.fromEntries(
        Object.entries(shapePatterns).map(([shapeKey, patternMap]) => [
          shapeKey,
          pickCanonicalStopSequence(patternMap),
        ])
      ),
    ])
  );
}

function getRouteStopSequence(routeId, shapeId, routeStopSequencesMapping = {}) {
  const routeSequences = routeStopSequencesMapping?.[routeId];
  if (!routeSequences) return [];
  if (shapeId && Array.isArray(routeSequences[shapeId]) && routeSequences[shapeId].length > 0) {
    return routeSequences[shapeId];
  }
  if (
    Array.isArray(routeSequences[DEFAULT_ROUTE_STOP_SEQUENCE_KEY]) &&
    routeSequences[DEFAULT_ROUTE_STOP_SEQUENCE_KEY].length > 0
  ) {
    return routeSequences[DEFAULT_ROUTE_STOP_SEQUENCE_KEY];
  }
  return [];
}

function getMajorTerminalRouteEdge({
  routeId,
  shapeId,
  eventWindow,
  shapeLengthMeters,
  stopImpactData = {},
  maxSourceSpanMeters = 250,
  edgePaddingMeters = 75,
} = {}) {
  const safeStopImpactData = stopImpactData || {};
  const start = Number(eventWindow?.coreStartProgressMeters);
  const end = Number(eventWindow?.coreEndProgressMeters);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return null;
  const minimum = Math.min(start, end);
  const maximum = Math.max(start, end);
  if (maximum - minimum > maxSourceSpanMeters) return null;

  const shapeLength = Number(shapeLengthMeters);
  const edge = minimum <= edgePaddingMeters
    ? 'start'
    : Number.isFinite(shapeLength) && shapeLength - maximum <= edgePaddingMeters
      ? 'end'
      : null;
  if (!edge) return null;

  const stopIds = getRouteStopSequence(
    routeId,
    shapeId,
    safeStopImpactData.routeStopSequencesMapping
  );
  const stopId = edge === 'start' ? stopIds[0] : stopIds[stopIds.length - 1];
  const stopsById = safeStopImpactData.stopsById;
  const rawStop = stopsById?.get?.(String(stopId)) ?? stopsById?.[String(stopId)];
  const stop = normalizeStop(rawStop);
  if (!stop || !isMajorTerminalStop(stop)) return null;
  return { edge, stopId: stop.id, stop };
}

function getRoutesServingStop(stopId, routeStopSequencesMapping = {}) {
  const normalizedStopId = normalizeStopId(stopId);
  if (!normalizedStopId || !routeStopSequencesMapping || typeof routeStopSequencesMapping !== 'object') {
    return [];
  }

  return Object.entries(routeStopSequencesMapping)
    .filter(([, routeSequences]) => {
      if (!routeSequences || typeof routeSequences !== 'object') return false;
      return Object.values(routeSequences).some((stopIds) => (
        Array.isArray(stopIds) &&
        stopIds.some((candidateStopId) => normalizeStopId(candidateStopId) === normalizedStopId)
      ));
    })
    .map(([servingRouteId]) => normalizeRouteId(servingRouteId))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function attachRouteImpact(stop, routeId, routeStopSequencesMapping = {}) {
  const normalizedRouteId = normalizeRouteId(routeId);
  const affectedRouteIds = normalizedRouteId ? [normalizedRouteId] : [];
  const servingRouteIds = getRoutesServingStop(stop?.id, routeStopSequencesMapping);
  const servedRouteIds = servingRouteIds.filter((servingRouteId) => servingRouteId !== normalizedRouteId);

  return {
    ...stop,
    routeId: normalizedRouteId,
    routeIds: affectedRouteIds,
    affectedRouteIds,
    servedRouteIds,
    allServingRouteIds: servingRouteIds.length > 0
      ? servingRouteIds
      : affectedRouteIds,
    impactScope: servedRouteIds.length > 0 ? 'partial' : 'route',
  };
}

function projectionProgressMeters(projection, polyline, cumulativeDistances) {
  if (!projection?.projectedPoint || !Array.isArray(polyline) || polyline.length === 0) return null;
  const segmentStart = polyline[projection.index] || polyline[0];
  const segmentStartProgress = cumulativeDistances[projection.index] || 0;
  const progress = segmentStartProgress + haversineDistance(
    segmentStart.latitude,
    segmentStart.longitude,
    projection.projectedPoint.latitude,
    projection.projectedPoint.longitude
  );
  return Number.isFinite(progress) ? progress : null;
}

function projectPointWithProgress(point, polyline, cumulativeDistances) {
  if (!isFiniteCoordinate(point) || !Array.isArray(polyline) || polyline.length < 2) return null;
  const projection = findClosestShapePoint(point, polyline);
  const progressMeters = projectionProgressMeters(projection, polyline, cumulativeDistances);
  if (!projection || !Number.isFinite(progressMeters)) return null;
  return {
    ...projection,
    progressMeters,
  };
}

function getClosedRouteBoundaryPoints(segment) {
  const skippedPath = Array.isArray(segment?.skippedSegmentPolyline)
    ? segment.skippedSegmentPolyline.filter(isFiniteCoordinate)
    : [];
  if (skippedPath.length >= 2) {
    return {
      entry: skippedPath[0],
      exit: skippedPath[skippedPath.length - 1],
    };
  }
  return {
    entry: segment?.entryPoint,
    exit: segment?.exitPoint,
  };
}

function getRenderableDetourPath(segment) {
  if (Array.isArray(segment?.likelyDetourPolyline) && segment.likelyDetourPolyline.length >= 2) {
    return segment.likelyDetourPolyline;
  }
  if (
    segment?.canShowDetourPath === true &&
    Array.isArray(segment?.inferredDetourPolyline) &&
    segment.inferredDetourPolyline.length >= 2
  ) {
    return segment.inferredDetourPolyline;
  }
  return null;
}

function getPathLengthMeters(path) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  return path.slice(1).reduce((sum, point, index) => (
    sum + haversineDistance(
      path[index].latitude,
      path[index].longitude,
      point.latitude,
      point.longitude
    )
  ), 0);
}

function isServedByDetourPath(stop, segment) {
  const detourPath = getRenderableDetourPath(segment);
  if (!Array.isArray(detourPath) || detourPath.length < 2) return false;
  if (pointToPolylineDistance(stop, detourPath) > DETOUR_PATH_STOP_SERVICE_PROXIMITY_METERS) return false;

  const cumulativeDistances = buildCumulativeDistances(detourPath);
  const projection = projectPointWithProgress(stop, detourPath, cumulativeDistances);
  const pathLengthMeters = getPathLengthMeters(detourPath);
  if (!projection || !Number.isFinite(pathLengthMeters)) return false;

  const remainingMeters = pathLengthMeters - projection.progressMeters;
  return (
    projection.progressMeters > DETOUR_PATH_ENDPOINT_BUFFER_METERS &&
    remainingMeters > DETOUR_PATH_ENDPOINT_BUFFER_METERS
  );
}

function getEffectiveBoundaryBufferMeters(startProgress, endProgress) {
  const segmentLengthMeters = Math.abs(endProgress - startProgress);
  if (!Number.isFinite(segmentLengthMeters) || segmentLengthMeters <= 0) return 0;
  return Math.min(
    DETOUR_STOP_IMPACT_BOUNDARY_BUFFER_METERS,
    Math.max(0, (segmentLengthMeters - ROUTE_PROGRESS_TOLERANCE_METERS) / 2)
  );
}

function getStopCode(stop) {
  return normalizeStopId(stop?.code) || normalizeStopId(stop?.id) || null;
}

function getStopKey(stop) {
  return normalizeStopId(stop?.id) || getStopCode(stop) || normalizeStopId(stop?.name);
}

function mergeUniqueStops(...stopLists) {
  const seen = new Set();
  const merged = [];

  stopLists.flat().forEach((stop) => {
    if (!stop) return;
    const key = getStopKey(stop);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    merged.push(stop);
  });

  return merged;
}

function withDetourStopRole(stop, role) {
  return stop && role ? { ...stop, detourStopRole: role } : stop;
}

function compactStopImpactFields(prefix, entry) {
  const stop = entry?.stop || null;
  return {
    [`${prefix}StopId`]: stop?.id || null,
    [`${prefix}StopCode`]: getStopCode(stop),
    [`${prefix}Stop`]: stop || null,
  };
}

function normalizeServiceEvidenceEntries(serviceEvidencePoints, polyline, cumulativeDistances) {
  if (!Array.isArray(serviceEvidencePoints) || serviceEvidencePoints.length === 0) return [];

  return serviceEvidencePoints
    .map((point) => {
      if (!isFiniteCoordinate(point)) return null;
      const projected = Number.isFinite(point.progressMeters) && Number.isFinite(point.distanceMeters)
        ? point
        : projectPointWithProgress(point, polyline, cumulativeDistances);
      if (!projected || !Number.isFinite(projected.progressMeters)) return null;
      return {
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        progressMeters: projected.progressMeters,
        distanceMeters: Number.isFinite(projected.distanceMeters) ? projected.distanceMeters : 0,
        timestampMs: point.timestampMs ?? null,
        vehicleId: point.vehicleId ?? null,
        tripId: point.tripId ?? null,
        signature: point.signature ?? point.tripId ?? point.vehicleId ?? null,
        onRoute: point.onRoute !== false && point.kind !== 'off-route',
        kind: point.kind ?? null,
      };
    })
    .filter(Boolean);
}

function hasGpsServiceEvidence(stopEntry, serviceEvidenceEntries) {
  const stop = stopEntry?.stop;
  if (!stop || !Array.isArray(serviceEvidenceEntries) || serviceEvidenceEntries.length === 0) {
    return false;
  }

  return serviceEvidenceEntries.some((evidence) => (
    evidence.onRoute === true &&
    Math.abs(evidence.progressMeters - stopEntry.progressMeters) <= STOP_SERVICE_GPS_PROGRESS_TOLERANCE_METERS &&
    evidence.distanceMeters <= STOP_ROUTE_PROJECTION_MAX_METERS &&
    haversineDistance(
      stop.latitude,
      stop.longitude,
      evidence.latitude,
      evidence.longitude
    ) <= STOP_SERVICE_GPS_PROXIMITY_METERS
  ));
}

function hasPositiveSkipEvidence(stopEntry, serviceEvidenceEntries) {
  if (!stopEntry || !Array.isArray(serviceEvidenceEntries)) return false;
  const stop = stopEntry.stop;
  if (!stop) return false;
  const bySignature = new Map();
  for (const entry of serviceEvidenceEntries) {
    const signature = String(entry?.signature || entry?.tripId || entry?.vehicleId || '').trim();
    if (!signature) continue;
    const samples = bySignature.get(signature) || [];
    samples.push(entry);
    bySignature.set(signature, samples);
  }

  let completeSkipCount = 0;
  for (const unorderedSamples of bySignature.values()) {
    const samples = [...unorderedSamples]
      .filter((sample) => (
        sample.timestampMs != null && Number.isFinite(Number(sample.timestampMs))
      ))
      .sort((a, b) => Number(a.timestampMs) - Number(b.timestampMs));
    const bypassSamples = samples.filter((sample) => (
      sample.onRoute === false &&
      sample.distanceMeters > STOP_SERVICE_GPS_PROXIMITY_METERS &&
      Math.abs(sample.progressMeters - stopEntry.progressMeters) <= POSITIVE_SKIP_PROGRESS_TOLERANCE_METERS &&
      haversineDistance(
        stop.latitude,
        stop.longitude,
        sample.latitude,
        sample.longitude
      ) > STOP_SERVICE_GPS_PROXIMITY_METERS
    ));

    const hasOrderedBypass = bypassSamples.some((bypass) => {
      const bypassTimestamp = Number(bypass.timestampMs);
      const earlierOnRouteSamples = samples.filter((sample) => (
        sample.onRoute === true && Number(sample.timestampMs) < bypassTimestamp
      ));
      const laterOnRouteSamples = samples.filter((sample) => (
        sample.onRoute === true && Number(sample.timestampMs) > bypassTimestamp
      ));
      const increasingProgress =
        earlierOnRouteSamples.some((sample) => (
          sample.progressMeters < stopEntry.progressMeters - ROUTE_PROGRESS_TOLERANCE_METERS
        )) &&
        laterOnRouteSamples.some((sample) => (
          sample.progressMeters > stopEntry.progressMeters + ROUTE_PROGRESS_TOLERANCE_METERS
        ));
      const decreasingProgress =
        earlierOnRouteSamples.some((sample) => (
          sample.progressMeters > stopEntry.progressMeters + ROUTE_PROGRESS_TOLERANCE_METERS
        )) &&
        laterOnRouteSamples.some((sample) => (
          sample.progressMeters < stopEntry.progressMeters - ROUTE_PROGRESS_TOLERANCE_METERS
        ));
      return increasingProgress || decreasingProgress;
    });
    if (hasOrderedBypass) completeSkipCount += 1;
  }
  return completeSkipCount >= 2;
}

function deriveSegmentStopImpacts({
  routeId,
  shapeId,
  segment,
  polyline,
  stopImpactData = {},
  serviceEvidencePoints = [],
}) {
  const routeStopIds = getRouteStopSequence(
    routeId,
    shapeId,
    stopImpactData.routeStopSequencesMapping
  );
  const stopsById = stopImpactData.stopsById;
  if (!Array.isArray(routeStopIds) || routeStopIds.length === 0 || !(stopsById instanceof Map)) {
    return {};
  }
  if (!Array.isArray(polyline) || polyline.length < 2) return {};

  const cumulativeDistances = buildCumulativeDistances(polyline);
  const serviceEvidenceEntries = normalizeServiceEvidenceEntries(
    serviceEvidencePoints,
    polyline,
    cumulativeDistances
  );
  const { entry, exit } = getClosedRouteBoundaryPoints(segment);
  const entryProjection = projectPointWithProgress(entry, polyline, cumulativeDistances);
  const exitProjection = projectPointWithProgress(exit, polyline, cumulativeDistances);
  if (!entryProjection || !exitProjection) return {};

  const startProgress = Math.min(entryProjection.progressMeters, exitProjection.progressMeters);
  const endProgress = Math.max(entryProjection.progressMeters, exitProjection.progressMeters);

  const affectedStopEntries = routeStopIds
    .map((stopId) => normalizeStop(stopsById.get(String(stopId))))
    .filter(Boolean)
    .map((stop) => {
      const projection = projectPointWithProgress(stop, polyline, cumulativeDistances);
      return projection
        ? {
          stop: attachRouteImpact(
            stop,
            routeId,
            stopImpactData.routeStopSequencesMapping
          ),
          progressMeters: projection.progressMeters,
          distanceMeters: projection.distanceMeters,
        }
        : null;
    })
    .filter((entry) => (
      entry &&
      entry.distanceMeters <= STOP_ROUTE_PROJECTION_MAX_METERS &&
      entry.progressMeters >= startProgress - ROUTE_PROGRESS_TOLERANCE_METERS &&
      entry.progressMeters <= endProgress + ROUTE_PROGRESS_TOLERANCE_METERS
    ))
    .sort((a, b) => a.progressMeters - b.progressMeters);

  const boundaryBufferMeters = getEffectiveBoundaryBufferMeters(startProgress, endProgress);
  const gpsServedStopEntries = affectedStopEntries.filter((entry) => (
    hasGpsServiceEvidence(entry, serviceEvidenceEntries)
  ));
  const isGpsServed = (entry) => gpsServedStopEntries.some((served) => served.stop.id === entry.stop.id);
  const detourPathServedStopEntries = affectedStopEntries.filter((entry) => (
    isServedByDetourPath(entry.stop, segment)
  ));
  const isDetourPathServed = (entry) => detourPathServedStopEntries.some((served) => served.stop.id === entry.stop.id);
  const isMajorTerminal = (entry) => isMajorTerminalStop(entry?.stop);
  const hasConfirmedSkip = (entry) => (
    !isMajorTerminal(entry) || hasPositiveSkipEvidence(entry, serviceEvidenceEntries)
  );
  const isBoundary = (entry) => (
    entry.progressMeters <= startProgress + boundaryBufferMeters ||
    entry.progressMeters >= endProgress - boundaryBufferMeters
  );
  const getEntryRole = (entry) => {
    if (!entry) return null;
    if (
      entry.progressMeters > startProgress + boundaryBufferMeters &&
      entry.progressMeters < endProgress - boundaryBufferMeters &&
      !isGpsServed(entry) &&
      !isDetourPathServed(entry) &&
      hasConfirmedSkip(entry)
    ) {
      return 'skipped';
    }
    if (isBoundary(entry)) return 'boundary';
    if (isGpsServed(entry)) return 'served-by-gps';
    if (isDetourPathServed(entry)) return 'served-by-detour';
    if (isMajorTerminal(entry)) return 'uncertain';
    return 'affected';
  };
  const affectedStops = affectedStopEntries.map((entry) => withDetourStopRole(entry.stop, getEntryRole(entry)));

  if (affectedStops.length === 0) return {};

  const firstSkippedStopEntry = affectedStopEntries.find((entry) => (
    entry.progressMeters > startProgress + boundaryBufferMeters &&
    entry.progressMeters < endProgress - boundaryBufferMeters &&
    !isGpsServed(entry) &&
    !isDetourPathServed(entry) &&
    hasConfirmedSkip(entry)
  )) || null;
  const skippedStopEntries = affectedStopEntries.filter((entry) => (
    entry.progressMeters > startProgress + boundaryBufferMeters &&
    entry.progressMeters < endProgress - boundaryBufferMeters &&
    !isGpsServed(entry) &&
    !isDetourPathServed(entry) &&
    hasConfirmedSkip(entry)
  ));
  const boundaryStopEntries = affectedStopEntries.filter(isBoundary);
  const skippedStops = skippedStopEntries.map((entry) => withDetourStopRole(entry.stop, 'skipped'));
  const gpsServedStops = gpsServedStopEntries.map((entry) => withDetourStopRole(entry.stop, 'served-by-gps'));
  const detourPathServedStops = detourPathServedStopEntries.map((entry) => withDetourStopRole(entry.stop, 'served-by-detour'));
  const boundaryStops = boundaryStopEntries.map((entry) => withDetourStopRole(entry.stop, 'boundary'));
  const uncertainStopEntries = affectedStopEntries.filter((entry) => (
    isMajorTerminal(entry) &&
    !isBoundary(entry) &&
    !isGpsServed(entry) &&
    !isDetourPathServed(entry) &&
    !hasConfirmedSkip(entry)
  ));
  const uncertainStops = uncertainStopEntries.map((entry) => withDetourStopRole(entry.stop, 'uncertain'));
  const lastServedBeforeDetourStopEntry = affectedStopEntries
    .filter((entry) => entry.progressMeters <= startProgress + boundaryBufferMeters)
    .at(-1) || null;
  const firstServedAfterDetourStopEntry = affectedStopEntries.find((entry) => (
    entry.progressMeters >= endProgress - boundaryBufferMeters
  )) || null;

  return {
    affectedStopIds: affectedStops.map((stop) => stop.id),
    affectedStopCodes: affectedStops.map((stop) => stop.code).filter(Boolean),
    affectedStops,
    skippedStopIds: skippedStops.map((stop) => stop.id),
    skippedStopCodes: skippedStops.map((stop) => stop.code).filter(Boolean),
    skippedStops,
    gpsServedStopIds: gpsServedStops.map((stop) => stop.id),
    gpsServedStopCodes: gpsServedStops.map((stop) => stop.code).filter(Boolean),
    gpsServedStops,
    detourPathServedStopIds: detourPathServedStops.map((stop) => stop.id),
    detourPathServedStopCodes: detourPathServedStops.map((stop) => stop.code).filter(Boolean),
    detourPathServedStops,
    boundaryStopIds: boundaryStops.map((stop) => stop.id),
    boundaryStopCodes: boundaryStops.map((stop) => stop.code).filter(Boolean),
    boundaryStops,
    uncertainStopIds: uncertainStops.map((stop) => stop.id),
    uncertainStopCodes: uncertainStops.map((stop) => stop.code).filter(Boolean),
    uncertainStops,
    firstSkippedStopId: firstSkippedStopEntry?.stop?.id || null,
    firstSkippedStopCode: getStopCode(firstSkippedStopEntry?.stop),
    firstSkippedStop: firstSkippedStopEntry?.stop || null,
    ...compactStopImpactFields('lastServedBeforeDetour', lastServedBeforeDetourStopEntry),
    ...compactStopImpactFields('firstServedAfterDetour', firstServedAfterDetourStopEntry),
    entryStopId: affectedStops[0]?.id || null,
    exitStopId: affectedStops[affectedStops.length - 1]?.id || null,
  };
}

function buildSegmentForDetourPathService(segment, fallbackGeometry = null) {
  return {
    ...(fallbackGeometry || {}),
    ...(segment || {}),
    likelyDetourPolyline:
      segment?.likelyDetourPolyline ||
      fallbackGeometry?.likelyDetourPolyline ||
      null,
    inferredDetourPolyline:
      segment?.inferredDetourPolyline ||
      fallbackGeometry?.inferredDetourPolyline ||
      null,
    canShowDetourPath:
      segment?.canShowDetourPath ??
      fallbackGeometry?.canShowDetourPath ??
      null,
  };
}

function pruneDetourPathServedStopsFromSegment(segment, fallbackGeometry = null) {
  if (!segment || typeof segment !== 'object') return segment;

  const skippedStops = Array.isArray(segment.skippedStops)
    ? segment.skippedStops.filter(Boolean)
    : [];
  if (skippedStops.length === 0) return segment;

  const serviceSegment = buildSegmentForDetourPathService(segment, fallbackGeometry);
  const servedStops = skippedStops.filter((stop) => isServedByDetourPath(stop, serviceSegment));
  if (servedStops.length === 0) return segment;

  const servedStopKeys = new Set(servedStops.map(getStopKey).filter(Boolean));
  const remainingSkippedStops = skippedStops.filter((stop) => {
    const key = getStopKey(stop);
    return key
      ? !servedStopKeys.has(key)
      : !servedStops.includes(stop);
  });
  const detourPathServedStops = mergeUniqueStops(
    segment.detourPathServedStops,
    servedStops
  );
  const firstSkippedStop = remainingSkippedStops[0] || null;

  return {
    ...segment,
    skippedStops: remainingSkippedStops,
    skippedStopIds: remainingSkippedStops.map((stop) => stop.id).filter(Boolean),
    skippedStopCodes: remainingSkippedStops.map((stop) => getStopCode(stop)).filter(Boolean),
    firstSkippedStopId: firstSkippedStop?.id || null,
    firstSkippedStopCode: getStopCode(firstSkippedStop),
    firstSkippedStop,
    detourPathServedStops,
    detourPathServedStopIds: detourPathServedStops.map((stop) => stop.id).filter(Boolean),
    detourPathServedStopCodes: detourPathServedStops.map((stop) => getStopCode(stop)).filter(Boolean),
  };
}

function pruneDetourPathServedStopsFromGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return geometry;

  const segments = Array.isArray(geometry.segments)
    ? geometry.segments.map((segment) => pruneDetourPathServedStopsFromSegment(segment, geometry))
    : [];

  if (segments.length === 0) {
    return pruneDetourPathServedStopsFromSegment(geometry, geometry);
  }

  const primarySegment = pickPrimarySegment(segments);
  return {
    ...geometry,
    segments,
    skippedStopIds: primarySegment?.skippedStopIds || [],
    skippedStopCodes: primarySegment?.skippedStopCodes || [],
    skippedStops: primarySegment?.skippedStops || [],
    firstSkippedStopId: primarySegment?.firstSkippedStopId || null,
    firstSkippedStopCode: primarySegment?.firstSkippedStopCode || null,
    firstSkippedStop: primarySegment?.firstSkippedStop || null,
    detourPathServedStopIds: primarySegment?.detourPathServedStopIds || [],
    detourPathServedStopCodes: primarySegment?.detourPathServedStopCodes || [],
    detourPathServedStops: primarySegment?.detourPathServedStops || [],
  };
}

module.exports = {
  DEFAULT_ROUTE_STOP_SEQUENCE_KEY,
  buildRouteStopSequencesMapping,
  deriveSegmentStopImpacts,
  getRouteStopSequence,
  getMajorTerminalRouteEdge,
  isMajorTerminalStop,
  isServedByDetourPath,
  pruneDetourPathServedStopsFromGeometry,
  pruneDetourPathServedStopsFromSegment,
};
