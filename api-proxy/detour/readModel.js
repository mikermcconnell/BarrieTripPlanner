function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeRouteSnapshotForDebug(routeId, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    routeId,
    detectedAt: snapshot.detectedAt instanceof Date ? snapshot.detectedAt.toISOString() : snapshot.detectedAt || null,
    lastSeenAt: snapshot.lastSeenAt instanceof Date ? snapshot.lastSeenAt.toISOString() : snapshot.lastSeenAt || null,
    triggerVehicleId: snapshot.triggerVehicleId || null,
    vehicleCount:
      snapshot.vehicleCount != null
        ? snapshot.vehicleCount
        : snapshot.vehiclesOffRoute instanceof Set
          ? snapshot.vehiclesOffRoute.size
          : 0,
    uniqueVehicleCount: snapshot.uniqueVehicleCount ?? snapshot.vehicleCount ?? null,
    currentVehicleCount:
      snapshot.currentVehicleCount ??
      (snapshot.vehiclesOffRoute instanceof Set ? snapshot.vehiclesOffRoute.size : null),
    state: snapshot.state || 'active',
    isPersistent: Boolean(snapshot.isPersistent),
    detourZone: cloneJson(snapshot.detourZone) || null,
    handoffSourceRouteId: snapshot.handoffSourceRouteId || null,
    geometry: cloneJson(snapshot.geometry) || null,
  };
}

function createDetectorReadModel({
  vehicleState,
  activeDetours,
  persistentDetourCandidates,
  learnedPersistentDetours,
  getLastReportedDetours,
  setLastReportedDetours,
  getSegmentCount,
  getRouteVehicleCount,
  hasPublishedSegments,
  getOrCreateSegmentEvidence,
  trackPersistentLearning,
  resetPersistentCandidate,
  buildRouteSnapshot,
  reconcileRouteFamilyGeometries,
  enrichDetourMapStopImpacts,
  toTimestampMs,
}) {
  function getActiveDetours(shapes, routeShapeMapping, options = {}) {
    const now = Date.now();
    const result = {};
    const shouldTrackPersistentLearning = options.trackPersistentLearning !== false;

    for (const [routeId, routeState] of activeDetours) {
      const snapshot = buildRouteSnapshot(
        routeId,
        routeState,
        shapes,
        routeShapeMapping,
        now,
        options.stopImpactData || null
      );
      if (!snapshot) continue;

      if (snapshot.isPersistent && snapshot.detourZone) {
        snapshot.detourZone = cloneJson(snapshot.detourZone);
      }

      if (shouldTrackPersistentLearning) {
        if (getSegmentCount(routeState) === 1) {
          trackPersistentLearning(routeId, snapshot, snapshot.geometry, now, routeState);
        } else {
          resetPersistentCandidate(routeId);
        }
      }

      result[routeId] = snapshot;
    }

    for (const routeId of [...persistentDetourCandidates.keys()]) {
      if (!result[routeId]) {
        persistentDetourCandidates.delete(routeId);
      }
    }

    if (shapes && routeShapeMapping) {
      reconcileRouteFamilyGeometries(result, shapes, routeShapeMapping);
      enrichDetourMapStopImpacts?.(result, shapes, options.stopImpactData || null);
    }
    setLastReportedDetours(result);
    return result;
  }

  function getState() {
    const lastReportedDetours = getLastReportedDetours();
    const reportedEntries = lastReportedDetours != null
      ? Object.entries(lastReportedDetours)
      : null;
    const publishedDetours = reportedEntries != null
      && (reportedEntries.length > 0 || activeDetours.size === 0)
      ? reportedEntries
      : [...activeDetours]
        .filter(([, routeState]) => hasPublishedSegments(routeState))
        .map(([routeId, routeState]) => {
          const publishedSegments = [...routeState.segments.values()].filter((segment) => segment.isPublished);
          const earliestDetectedAt = publishedSegments.reduce((min, segment) => {
            const ts = segment.detectedAt?.getTime?.() ?? Date.parse(segment.detectedAt);
            return Number.isFinite(ts) ? Math.min(min, ts) : min;
          }, Infinity);
          const routeStateLabel = publishedSegments.some((segment) => segment.state === 'active')
            ? 'active'
            : 'clear-pending';
          return [routeId, {
            vehicleCount: getRouteVehicleCount(routeState),
            uniqueVehicleCount: getRouteVehicleCount(routeState),
            detectedAt: Number.isFinite(earliestDetectedAt) ? new Date(earliestDetectedAt) : new Date(),
            triggerVehicleId: publishedSegments[0]?.triggerVehicleId || null,
            state: routeStateLabel,
          }];
        });
    return {
      vehicleCount: vehicleState.size,
      activeDetourCount: publishedDetours.length,
      detours: Object.fromEntries(
        publishedDetours.map(([routeId, d]) => [routeId, {
          vehicleCount: d.vehicleCount ?? d.vehiclesOffRoute?.size ?? 0,
          uniqueVehicleCount: d.uniqueVehicleCount ?? d.vehicleCount ?? 0,
          currentVehicleCount: d.currentVehicleCount ?? d.vehiclesOffRoute?.size ?? 0,
          detectedAt: (d.detectedAt instanceof Date ? d.detectedAt : new Date(d.detectedAt)).toISOString(),
          triggerVehicleId: d.triggerVehicleId,
          state: d.state || 'active',
        }])
      ),
      detourStates: Object.fromEntries(
        publishedDetours.map(([routeId, d]) => [routeId, d.state || 'active'])
      ),
    };
  }

  function getDetourEvidence() {
    const result = {};
    for (const [routeId, routeState] of activeDetours) {
      const pointEntries = [...routeState.segments.values()]
        .flatMap((segment) => Array.isArray(segment.evidence?.points) ? segment.evidence.points : [])
        .sort((a, b) => a.timestampMs - b.timestampMs);
      result[routeId] = {
        pointCount: pointEntries.length,
        oldestMs: pointEntries[0]?.timestampMs ?? null,
        newestMs: pointEntries[pointEntries.length - 1]?.timestampMs ?? null,
      };
    }
    return result;
  }

  function getRawDetourEvidence() {
    const result = {};
    const lastReportedDetours = getLastReportedDetours();
    for (const [routeId, routeState] of activeDetours) {
      const pointEntries = [];
      const entryCandidates = [];
      const exitCandidates = [];
      const segments = [];

      for (const segment of routeState.segments.values()) {
        const evidence = getOrCreateSegmentEvidence(segment);
        pointEntries.push(...evidence.points);
        entryCandidates.push(...evidence.entryCandidates);
        exitCandidates.push(...evidence.exitCandidates);
        segments.push({
          segmentId: segment.segmentId,
          state: segment.state,
          pointCount: evidence.points.length,
          oldestMs: evidence.points[0]?.timestampMs ?? null,
          newestMs: evidence.points[evidence.points.length - 1]?.timestampMs ?? null,
        });
      }

      pointEntries.sort((a, b) => a.timestampMs - b.timestampMs);
      entryCandidates.sort((a, b) => a.timestampMs - b.timestampMs);
      exitCandidates.sort((a, b) => a.timestampMs - b.timestampMs);

      result[routeId] = {
        routeId,
        pointCount: pointEntries.length,
        oldestMs: pointEntries[0]?.timestampMs ?? null,
        newestMs: pointEntries[pointEntries.length - 1]?.timestampMs ?? null,
        uniqueVehicles: new Set(pointEntries.map((p) => p.vehicleId)).size,
        segmentCount: segments.length,
        routeConfig: cloneJson(routeState.routeConfig) || null,
        snapshot: normalizeRouteSnapshotForDebug(routeId, lastReportedDetours?.[routeId] || null),
        segments,
        stateSegments: [...routeState.segments.values()].map((segment) => ({
          segmentId: segment.segmentId,
          state: segment.state,
          isPublished: Boolean(segment.isPublished),
          isPersistent: Boolean(segment.isPersistent),
          triggerVehicleId: segment.triggerVehicleId || null,
          vehicleIds: [...(segment.vehiclesOffRoute || [])],
          matchedVehicleIds: [...(segment.matchedVehicleIds || [])],
          normalRouteVehicleIds: [...(segment.normalRouteVehicleIds || [])],
          shapeIdHint: segment.shapeIdHint || null,
          progressMinMeters: Number.isFinite(segment.progressMinMeters) ? segment.progressMinMeters : null,
          progressMaxMeters: Number.isFinite(segment.progressMaxMeters) ? segment.progressMaxMeters : null,
          clearPendingAt: toTimestampMs(segment.clearPendingAt),
          detectedAt: toTimestampMs(segment.detectedAt),
          lastSeenAt: toTimestampMs(segment.lastSeenAt),
          lastOffRouteEvidenceAt: toTimestampMs(segment.lastOffRouteEvidenceAt),
          detourZone: cloneJson(segment.detourZone) || null,
          persistedGeometry: cloneJson(segment.persistedGeometry) || null,
        })),
        entryCandidates: entryCandidates.map((p) => ({
            lat: p.latitude,
            lon: p.longitude,
            ts: p.timestampMs,
            v: p.vehicleId,
          })),
        exitCandidates: exitCandidates.map((p) => ({
            lat: p.latitude,
            lon: p.longitude,
            ts: p.timestampMs,
            v: p.vehicleId,
          })),
        points: pointEntries.map((p) => ({
          lat: p.latitude,
          lon: p.longitude,
          ts: p.timestampMs,
          v: p.vehicleId,
        })),
      };
    }
    return result;
  }

  function getRouteDebug(routeId) {
    const rawEvidence = getRawDetourEvidence();
    if (rawEvidence[routeId]) {
      return rawEvidence[routeId];
    }

    const snapshot = normalizeRouteSnapshotForDebug(routeId, getLastReportedDetours()?.[routeId] || null);
    if (!snapshot) return null;

    return {
      routeId,
      pointCount: 0,
      oldestMs: null,
      newestMs: null,
      uniqueVehicles: 0,
      segmentCount: Array.isArray(snapshot.geometry?.segments) ? snapshot.geometry.segments.length : 0,
      routeConfig: null,
      snapshot,
      segments: [],
      stateSegments: [],
      entryCandidates: [],
      exitCandidates: [],
      points: [],
    };
  }

  function getPersistentDetours() {
    return Object.fromEntries(
      [...learnedPersistentDetours.entries()].map(([routeId, record]) => [routeId, cloneJson(record)])
    );
  }

  return {
    getActiveDetours,
    getState,
    getDetourEvidence,
    getRawDetourEvidence,
    getRouteDebug,
    getPersistentDetours,
  };
}

module.exports = {
  cloneJson,
  normalizeRouteSnapshotForDebug,
  createDetectorReadModel,
};
