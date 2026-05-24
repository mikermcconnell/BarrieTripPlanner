function createRuntimeStatePersistence({
  vehicleState,
  activeDetours,
  detourEvidence,
  persistentDetourCandidates,
  normalDetourCandidates,
  recurringShortDeviationCandidates,
  getMinVehiclesForDetour,
  setMinVehiclesForDetour,
  getWasInService,
  setWasInService,
  getLastReportedDetours,
  setLastReportedDetours,
  defaultMinVehiclesForDetour,
  resolveRouteDetectorConfig,
  getState,
  cloneJson,
  toTimestampMs,
  toDateOrNow,
  normalizeObservation,
  normalizeEvidenceEntry,
}) {
  function collectVehicleIdsFromEvidence(items, ids) {
    for (const item of Array.isArray(items) ? items : []) {
      const normalized = normalizeEvidenceEntry(item);
      if (normalized?.vehicleId) ids.add(normalized.vehicleId);
    }
  }

  function getRawSegmentEvidenceBackedVehicleIds(rawSegment) {
    const ids = new Set((rawSegment?.vehiclesOffRoute || []).filter(Boolean));
    for (const vehicleId of rawSegment?.candidateConfirmationIds || []) {
      if (vehicleId) ids.add(vehicleId);
    }
    const evidence = rawSegment?.evidence || {};
    collectVehicleIdsFromEvidence(evidence.points, ids);
    collectVehicleIdsFromEvidence(evidence.confidencePoints, ids);
    return ids;
  }

  function serializeDetectorRuntimeState() {
    return {
      version: 1,
      savedAt: Date.now(),
      minVehiclesForDetour: getMinVehiclesForDetour(),
      wasInService: getWasInService(),
      persistentDetourCandidates: Object.fromEntries(
        [...persistentDetourCandidates.entries()].map(([routeId, candidate]) => [routeId, {
          fingerprint: candidate?.fingerprint || null,
          consecutiveMatches: Number(candidate?.consecutiveMatches) || 0,
          lastMatchedAt: toTimestampMs(candidate?.lastMatchedAt) || null,
        }])
      ),
      normalDetourCandidates: Object.fromEntries(
        [...(normalDetourCandidates?.entries?.() || [])].map(([key, candidate]) => [key, {
          routeId: candidate?.routeId || null,
          shapeId: candidate?.shapeId || null,
          progressMinMeters: Number.isFinite(candidate?.progressMinMeters) ? candidate.progressMinMeters : null,
          progressMaxMeters: Number.isFinite(candidate?.progressMaxMeters) ? candidate.progressMaxMeters : null,
          firstSeenAt: toTimestampMs(candidate?.firstSeenAt) || null,
          lastSeenAt: toTimestampMs(candidate?.lastSeenAt) || null,
          observations: (candidate?.observations || []).map((observation) => ({
            routeId: observation?.routeId || null,
            shapeId: observation?.shapeId || null,
            progressMinMeters: Number.isFinite(observation?.progressMinMeters)
              ? observation.progressMinMeters
              : null,
            progressMaxMeters: Number.isFinite(observation?.progressMaxMeters)
              ? observation.progressMaxMeters
              : null,
            timestampMs: toTimestampMs(observation?.timestampMs) || null,
            vehicleId: observation?.vehicleId || null,
            tripId: observation?.tripId || null,
            tripShapeId: observation?.tripShapeId || null,
            signature: observation?.signature || null,
            entryObservation: normalizeObservation(observation?.entryObservation),
            exitObservation: normalizeObservation(observation?.exitObservation),
            evidencePoints: (observation?.evidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
            lastCoordinate: observation?.lastCoordinate || null,
          })),
          evidencePoints: (candidate?.evidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
        }])
      ),
      recurringShortDeviationCandidates: Object.fromEntries(
        [...recurringShortDeviationCandidates.entries()].map(([key, candidate]) => [key, {
          routeId: candidate?.routeId || null,
          shapeId: candidate?.shapeId || null,
          recurringFamilyId: candidate?.recurringFamilyId || null,
          progressMinMeters: Number.isFinite(candidate?.progressMinMeters) ? candidate.progressMinMeters : null,
          progressMaxMeters: Number.isFinite(candidate?.progressMaxMeters) ? candidate.progressMaxMeters : null,
          lastSeenAt: toTimestampMs(candidate?.lastSeenAt) || null,
          observations: (candidate?.observations || []).map((observation) => ({
            routeId: observation?.routeId || null,
            shapeId: observation?.shapeId || null,
            recurringFamilyId: observation?.recurringFamilyId || null,
            progressMinMeters: Number.isFinite(observation?.progressMinMeters)
              ? observation.progressMinMeters
              : null,
            progressMaxMeters: Number.isFinite(observation?.progressMaxMeters)
              ? observation.progressMaxMeters
              : null,
            timestampMs: toTimestampMs(observation?.timestampMs) || null,
            vehicleId: observation?.vehicleId || null,
            tripId: observation?.tripId || null,
            tripShapeId: observation?.tripShapeId || null,
            signature: observation?.signature || null,
            entryObservation: normalizeObservation(observation?.entryObservation),
            exitObservation: normalizeObservation(observation?.exitObservation),
            evidencePoints: (observation?.evidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
            lastCoordinate: observation?.lastCoordinate || null,
          })),
          evidencePoints: (candidate?.evidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
        }])
      ),
      vehicles: [...vehicleState.entries()].map(([vehicleId, state]) => ({
        vehicleId,
        routeId: state?.routeId || null,
        detourSegmentId: state?.detourSegmentId || null,
        consecutiveOffRoute: Number(state?.consecutiveOffRoute) || 0,
        consecutiveOnRoute: Number(state?.consecutiveOnRoute) || 0,
        lastCheckedAt: toTimestampMs(state?.lastCheckedAt) || null,
        lastOnRouteObservation: normalizeObservation(state?.lastOnRouteObservation),
        offRouteStreakStart: normalizeObservation(state?.offRouteStreakStart),
        offRouteStreakPoints: (state?.offRouteStreakPoints || []).map(normalizeEvidenceEntry).filter(Boolean),
        onRouteStreakStart: normalizeObservation(state?.onRouteStreakStart),
        onRouteStreakShapeId: state?.onRouteStreakShapeId || null,
        onRouteStreakMinProgressMeters: Number.isFinite(state?.onRouteStreakMinProgressMeters)
          ? state.onRouteStreakMinProgressMeters
          : null,
        onRouteStreakMaxProgressMeters: Number.isFinite(state?.onRouteStreakMaxProgressMeters)
          ? state.onRouteStreakMaxProgressMeters
          : null,
        onRouteStreakPointCount: Number(state?.onRouteStreakPointCount) || 0,
        tripShapeId: state?.tripShapeId || null,
        tripId: state?.tripId || null,
        hasReturnedOnRouteSinceDetour: Boolean(state?.hasReturnedOnRouteSinceDetour),
      })),
      routes: [...activeDetours.entries()].map(([routeId, routeState]) => ({
        routeId,
        nextSegmentOrdinal: Number(routeState?.nextSegmentOrdinal) || 1,
        segments: [...(routeState?.segments?.values?.() || [])].map((segment) => ({
          segmentId: segment?.segmentId || null,
          detectedAt: toTimestampMs(segment?.detectedAt) || null,
          lastSeenAt: toTimestampMs(segment?.lastSeenAt) || null,
          triggerVehicleId: segment?.triggerVehicleId || null,
          vehiclesOffRoute: [...(segment?.vehiclesOffRoute || [])].filter(Boolean),
          matchedVehicleIds: [...(segment?.matchedVehicleIds || [])].filter(Boolean),
          candidateConfirmationIds: [...(segment?.candidateConfirmationIds || [])].filter(Boolean),
          normalRouteVehicleIds: [...(segment?.normalRouteVehicleIds || [])].filter(Boolean),
          state: segment?.state || 'active',
          clearPendingAt: toTimestampMs(segment?.clearPendingAt) || null,
          clearReason: segment?.clearReason || null,
          lastOffRouteEvidenceAt: toTimestampMs(segment?.lastOffRouteEvidenceAt) || null,
          isPublished: Boolean(segment?.isPublished),
          isPersistent: Boolean(segment?.isPersistent),
          persistentFingerprint: segment?.persistentFingerprint || null,
          persistedGeometry: cloneJson(segment?.persistedGeometry) || null,
          detourZone: cloneJson(segment?.detourZone) || null,
          evidence: {
            points: (segment?.evidence?.points || []).map(normalizeEvidenceEntry).filter(Boolean),
            confidencePoints: (segment?.evidence?.confidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
            entryCandidates: (segment?.evidence?.entryCandidates || []).map(normalizeEvidenceEntry).filter(Boolean),
            exitCandidates: (segment?.evidence?.exitCandidates || []).map(normalizeEvidenceEntry).filter(Boolean),
          },
          learnedEvidence: {
            points: (segment?.learnedEvidence?.points || []).map(normalizeEvidenceEntry).filter(Boolean),
            confidencePoints: (segment?.learnedEvidence?.confidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
            entryCandidates: (segment?.learnedEvidence?.entryCandidates || []).map(normalizeEvidenceEntry).filter(Boolean),
            exitCandidates: (segment?.learnedEvidence?.exitCandidates || []).map(normalizeEvidenceEntry).filter(Boolean),
          },
          shapeIdHint: segment?.shapeIdHint || null,
          progressMinMeters: Number.isFinite(segment?.progressMinMeters) ? segment.progressMinMeters : null,
          progressMaxMeters: Number.isFinite(segment?.progressMaxMeters) ? segment.progressMaxMeters : null,
        })),
      })),
      lastReportedDetours: cloneJson(getLastReportedDetours()),
    };
  }

  function hydrateRuntimeState(snapshot = {}) {
    vehicleState.clear();
    activeDetours.clear();
    detourEvidence.clear();
    persistentDetourCandidates.clear();
    normalDetourCandidates?.clear?.();
    recurringShortDeviationCandidates.clear();

    // Deployment config should win over persisted runtime state.
    // Older snapshots may contain a weaker minimum vehicle threshold, and
    // hydrating that value can re-enable one-bus false-positive publishing
    // after the operator has hardened DETOUR_MIN_UNIQUE_VEHICLES.
    const configuredMinimumVehicleCount =
      Number(getMinVehiclesForDetour?.()) ||
      Number(defaultMinVehiclesForDetour) ||
      2;
    const minimumVehicleCount = configuredMinimumVehicleCount > 0
      ? configuredMinimumVehicleCount
      : 2;
    setMinVehiclesForDetour(defaultMinVehiclesForDetour);
    setWasInService(typeof snapshot?.wasInService === 'boolean' ? snapshot.wasInService : true);
    const rawLastReportedDetours = cloneJson(snapshot?.lastReportedDetours) || null;

    for (const [routeId, candidate] of Object.entries(snapshot?.persistentDetourCandidates || {})) {
      if (!candidate?.fingerprint) continue;
      persistentDetourCandidates.set(routeId, {
        fingerprint: candidate.fingerprint,
        consecutiveMatches: Number(candidate.consecutiveMatches) || 0,
        lastMatchedAt: toTimestampMs(candidate.lastMatchedAt) || Date.now(),
      });
    }

    for (const [key, rawCandidate] of Object.entries(snapshot?.normalDetourCandidates || {})) {
      const routeId = rawCandidate?.routeId || null;
      const shapeId = rawCandidate?.shapeId || null;
      if (!routeId || !shapeId) continue;
      const observations = (rawCandidate.observations || [])
        .map((observation) => ({
          routeId: observation?.routeId || routeId,
          shapeId: observation?.shapeId || shapeId,
          progressMinMeters: Number.isFinite(observation?.progressMinMeters)
            ? observation.progressMinMeters
            : null,
          progressMaxMeters: Number.isFinite(observation?.progressMaxMeters)
            ? observation.progressMaxMeters
            : null,
          timestampMs: toTimestampMs(observation?.timestampMs) || null,
          vehicleId: observation?.vehicleId || null,
          tripId: observation?.tripId || null,
          tripShapeId: observation?.tripShapeId || null,
          signature: observation?.signature || null,
          entryObservation: normalizeObservation(observation?.entryObservation),
          exitObservation: normalizeObservation(observation?.exitObservation),
          evidencePoints: (observation?.evidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
          lastCoordinate: observation?.lastCoordinate || null,
        }))
        .filter((observation) =>
          Number.isFinite(observation.progressMinMeters) &&
          Number.isFinite(observation.progressMaxMeters) &&
          Number.isFinite(observation.timestampMs)
        );
      const evidencePoints = (rawCandidate.evidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean);
      normalDetourCandidates?.set?.(key, {
        routeId,
        shapeId,
        progressMinMeters: Number.isFinite(rawCandidate.progressMinMeters)
          ? rawCandidate.progressMinMeters
          : (observations.length > 0 ? Math.min(...observations.map((item) => item.progressMinMeters)) : null),
        progressMaxMeters: Number.isFinite(rawCandidate.progressMaxMeters)
          ? rawCandidate.progressMaxMeters
          : (observations.length > 0 ? Math.max(...observations.map((item) => item.progressMaxMeters)) : null),
        firstSeenAt: toTimestampMs(rawCandidate.firstSeenAt) ||
          (observations.length > 0 ? Math.min(...observations.map((item) => item.timestampMs)) : null),
        lastSeenAt: toTimestampMs(rawCandidate.lastSeenAt) ||
          (observations.length > 0 ? Math.max(...observations.map((item) => item.timestampMs)) : null),
        observations,
        evidencePoints,
      });
    }

    for (const rawVehicle of snapshot?.vehicles || []) {
      const vehicleId = rawVehicle?.vehicleId || rawVehicle?.id;
      const routeId = rawVehicle?.routeId || null;
      if (!vehicleId || !routeId) continue;
      vehicleState.set(vehicleId, {
        id: vehicleId,
        vehicleId,
        routeId,
        detourSegmentId: rawVehicle.detourSegmentId || null,
        consecutiveOffRoute: Number(rawVehicle.consecutiveOffRoute) || 0,
        consecutiveOnRoute: Number(rawVehicle.consecutiveOnRoute) || 0,
        lastCheckedAt: toTimestampMs(rawVehicle.lastCheckedAt) || Date.now(),
        lastOnRouteObservation: normalizeObservation(rawVehicle.lastOnRouteObservation),
        offRouteStreakStart: normalizeObservation(rawVehicle.offRouteStreakStart),
        offRouteStreakPoints: (rawVehicle.offRouteStreakPoints || []).map(normalizeEvidenceEntry).filter(Boolean),
        onRouteStreakStart: normalizeObservation(rawVehicle.onRouteStreakStart),
        onRouteStreakShapeId: rawVehicle.onRouteStreakShapeId || null,
        onRouteStreakMinProgressMeters: Number.isFinite(rawVehicle.onRouteStreakMinProgressMeters)
          ? rawVehicle.onRouteStreakMinProgressMeters
          : null,
        onRouteStreakMaxProgressMeters: Number.isFinite(rawVehicle.onRouteStreakMaxProgressMeters)
          ? rawVehicle.onRouteStreakMaxProgressMeters
          : null,
        onRouteStreakPointCount: Number(rawVehicle.onRouteStreakPointCount) || 0,
        tripShapeId: rawVehicle.tripShapeId || null,
        tripId: rawVehicle.tripId || null,
        hasReturnedOnRouteSinceDetour: Boolean(rawVehicle.hasReturnedOnRouteSinceDetour),
      });
    }

    for (const [key, rawCandidate] of Object.entries(snapshot?.recurringShortDeviationCandidates || {})) {
      const routeId = rawCandidate?.routeId || null;
      const shapeId = rawCandidate?.shapeId || null;
      if (!routeId || !shapeId) continue;
      recurringShortDeviationCandidates.set(key, {
        routeId,
        shapeId,
        recurringFamilyId: rawCandidate.recurringFamilyId || null,
        progressMinMeters: Number.isFinite(rawCandidate.progressMinMeters)
          ? rawCandidate.progressMinMeters
          : null,
        progressMaxMeters: Number.isFinite(rawCandidate.progressMaxMeters)
          ? rawCandidate.progressMaxMeters
          : null,
        lastSeenAt: toTimestampMs(rawCandidate.lastSeenAt) || null,
        observations: (rawCandidate.observations || [])
          .map((observation) => ({
            routeId: observation?.routeId || routeId,
            shapeId: observation?.shapeId || shapeId,
            recurringFamilyId: observation?.recurringFamilyId || rawCandidate.recurringFamilyId || null,
            progressMinMeters: Number.isFinite(observation?.progressMinMeters)
              ? observation.progressMinMeters
              : null,
            progressMaxMeters: Number.isFinite(observation?.progressMaxMeters)
              ? observation.progressMaxMeters
              : null,
            timestampMs: toTimestampMs(observation?.timestampMs) || null,
            vehicleId: observation?.vehicleId || null,
            tripId: observation?.tripId || null,
            tripShapeId: observation?.tripShapeId || null,
            signature: observation?.signature || null,
            entryObservation: normalizeObservation(observation?.entryObservation),
            exitObservation: normalizeObservation(observation?.exitObservation),
            evidencePoints: (observation?.evidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
            lastCoordinate: observation?.lastCoordinate || null,
          }))
          .filter((observation) =>
            Number.isFinite(observation.progressMinMeters) &&
            Number.isFinite(observation.progressMaxMeters) &&
            Number.isFinite(observation.timestampMs)
          ),
        evidencePoints: (rawCandidate.evidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
      });
    }

    for (const rawRouteState of snapshot?.routes || []) {
      const routeId = rawRouteState?.routeId;
      if (!routeId) continue;
      const routeConfig = resolveRouteDetectorConfig(routeId);
      const routeState = {
        routeId,
        routeConfig,
        nextSegmentOrdinal: Number(rawRouteState.nextSegmentOrdinal) || 1,
        segments: new Map(),
      };

      for (const rawSegment of rawRouteState.segments || []) {
        const segmentId = rawSegment?.segmentId;
        if (!segmentId) continue;
        const vehiclesOffRoute = new Set((rawSegment.vehiclesOffRoute || []).filter(Boolean));
        const isPersistent = Boolean(rawSegment.isPersistent);
        const evidenceBackedVehicleIds = getRawSegmentEvidenceBackedVehicleIds(rawSegment);
        const shouldUseEvidenceBackedVehicleIds =
          !isPersistent &&
          minimumVehicleCount > 1 &&
          evidenceBackedVehicleIds.size > 0;
        const matchedVehicleIds = shouldUseEvidenceBackedVehicleIds
          ? evidenceBackedVehicleIds
          : new Set((rawSegment.matchedVehicleIds || rawSegment.vehiclesOffRoute || []).filter(Boolean));
        const confirmationVehicleCount = shouldUseEvidenceBackedVehicleIds
          ? evidenceBackedVehicleIds.size
          : matchedVehicleIds.size;
        const isPublished =
          Boolean(rawSegment.isPublished) &&
          (isPersistent || confirmationVehicleCount >= minimumVehicleCount);
        routeState.segments.set(segmentId, {
          segmentId,
          detectedAt: toDateOrNow(rawSegment.detectedAt),
          lastSeenAt: toDateOrNow(rawSegment.lastSeenAt),
          triggerVehicleId: rawSegment.triggerVehicleId || null,
          vehiclesOffRoute,
          matchedVehicleIds,
          candidateConfirmationIds: new Set((rawSegment.candidateConfirmationIds || []).filter(Boolean)),
          normalRouteVehicleIds: new Set((rawSegment.normalRouteVehicleIds || []).filter(Boolean)),
          state: rawSegment.state || 'active',
          clearPendingAt: toTimestampMs(rawSegment.clearPendingAt),
          clearReason: rawSegment.clearReason || null,
          lastOffRouteEvidenceAt: toTimestampMs(rawSegment.lastOffRouteEvidenceAt) || Date.now(),
          routeConfig,
          isPublished,
          isPersistent,
          persistentFingerprint: rawSegment.persistentFingerprint || null,
          persistedGeometry: cloneJson(rawSegment.persistedGeometry) || null,
          detourZone: cloneJson(rawSegment.detourZone) || null,
          evidence: {
            points: (rawSegment?.evidence?.points || []).map(normalizeEvidenceEntry).filter(Boolean),
            confidencePoints: (rawSegment?.evidence?.confidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
            entryCandidates: (rawSegment?.evidence?.entryCandidates || []).map(normalizeEvidenceEntry).filter(Boolean),
            exitCandidates: (rawSegment?.evidence?.exitCandidates || []).map(normalizeEvidenceEntry).filter(Boolean),
          },
          learnedEvidence: {
            points: (rawSegment?.learnedEvidence?.points || []).map(normalizeEvidenceEntry).filter(Boolean),
            confidencePoints: (rawSegment?.learnedEvidence?.confidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
            entryCandidates: (rawSegment?.learnedEvidence?.entryCandidates || []).map(normalizeEvidenceEntry).filter(Boolean),
            exitCandidates: (rawSegment?.learnedEvidence?.exitCandidates || []).map(normalizeEvidenceEntry).filter(Boolean),
          },
          shapeIdHint: rawSegment.shapeIdHint || null,
          progressMinMeters: Number.isFinite(rawSegment.progressMinMeters) ? rawSegment.progressMinMeters : null,
          progressMaxMeters: Number.isFinite(rawSegment.progressMaxMeters) ? rawSegment.progressMaxMeters : null,
        });
      }

      activeDetours.set(routeId, routeState);
    }

    if (rawLastReportedDetours) {
      const publishedRouteIds = new Set();
      for (const [routeId, routeState] of activeDetours) {
        const hasPublishedSegment = [...(routeState?.segments?.values?.() || [])]
          .some((segment) => segment.isPublished);
        if (hasPublishedSegment) publishedRouteIds.add(routeId);
      }

      setLastReportedDetours(Object.fromEntries(
        Object.entries(rawLastReportedDetours)
          .filter(([routeId]) => publishedRouteIds.has(routeId))
      ));
    } else {
      setLastReportedDetours(null);
    }

    return getState();
  }

  return {
    serializeDetectorRuntimeState,
    hydrateRuntimeState,
  };
}

module.exports = {
  createRuntimeStatePersistence,
};
