function createRouteDetourState(routeId, routeConfig) {
  return {
    routeId,
    routeConfig,
    segments: new Map(),
    nextSegmentOrdinal: 1,
  };
}

function createSegmentState({
  segmentId,
  routeConfig,
  now,
  vehicleId,
  projection = null,
  minVehiclesForDetour,
}) {
  return {
    segmentId,
    detectedAt: new Date(now || Date.now()),
    lastSeenAt: new Date(now || Date.now()),
    triggerVehicleId: vehicleId,
    vehiclesOffRoute: new Set(),
    matchedVehicleIds: new Set(),
    candidateConfirmationIds: new Set(),
    normalRouteVehicleIds: new Set(),
    state: 'active',
    clearPendingAt: null,
    lastOffRouteEvidenceAt: now || Date.now(),
    routeConfig,
    isPublished: minVehiclesForDetour <= 1,
    isPersistent: false,
    persistentFingerprint: null,
    persistedGeometry: null,
    detourZone: null,
    evidence: {
      points: [],
      entryCandidates: [],
      exitCandidates: [],
    },
    shapeIdHint: projection?.shapeId || null,
    progressMinMeters: Number.isFinite(projection?.progressMeters) ? projection.progressMeters : null,
    progressMaxMeters: Number.isFinite(projection?.progressMeters) ? projection.progressMeters : null,
  };
}

function getSegmentCount(routeState) {
  return routeState?.segments instanceof Map ? routeState.segments.size : 0;
}

function getRouteVehicleCount(routeState) {
  if (!routeState?.segments) return 0;
  const unique = new Set();
  for (const segment of routeState.segments.values()) {
    const vehicleIds = segment.matchedVehicleIds?.size ? segment.matchedVehicleIds : segment.vehiclesOffRoute;
    for (const vehicleId of vehicleIds || []) {
      unique.add(vehicleId);
    }
  }
  return unique.size;
}

function hasPublishedSegments(routeState) {
  if (!routeState?.segments) return false;
  for (const segment of routeState.segments.values()) {
    if (segment.isPublished) return true;
  }
  return false;
}

module.exports = {
  createRouteDetourState,
  createSegmentState,
  getSegmentCount,
  getRouteVehicleCount,
  hasPublishedSegments,
};
