'use strict';

const DEFAULT_ROUTE_DETECTOR_OVERRIDES = Object.freeze({
  // Route 8A buses use the Downtown Hub street loop before joining the
  // scheduled outbound shape on Maple. Treat that operator-confirmed terminal
  // circulation as normal service, not as closure evidence.
  '8A': Object.freeze({
    ignoredRouteEdgeAreas: Object.freeze([Object.freeze({
      label: 'Downtown Hub terminal egress',
      edge: 'start',
      center: Object.freeze({ latitude: 44.387753, longitude: -79.690237 }),
      radiusMeters: 200,
      maxProgressMeters: 250,
    })]),
  }),
  // Route 12 downtown geometry can have close entry/exit anchors. Keep the
  // anchor tolerance narrow; route-family projection is handled globally only
  // after a confirmed physical closure segment has renderable boundaries.
  '12A': Object.freeze({
    staleEntryAnchorMaxGapMeters: 150,
  }),
  '12B': Object.freeze({
    staleEntryAnchorMaxGapMeters: 150,
  }),
});

function normalizePositiveNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCoordinate(value) {
  if (!value || typeof value !== 'object') return null;
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lon ?? value.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function normalizeCoordinateList(value) {
  if (!Array.isArray(value)) return null;
  const points = value.map(normalizeCoordinate).filter(Boolean);
  return points.length >= 2 ? points : null;
}

function normalizeOptionalTimestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeConfiguredDetourCorridor(rawCorridor) {
  if (!rawCorridor || typeof rawCorridor !== 'object' || rawCorridor.enabled === false) {
    return null;
  }

  const entryPoint = normalizeCoordinate(rawCorridor.entryPoint);
  const exitPoint = normalizeCoordinate(rawCorridor.exitPoint);
  if (!entryPoint || !exitPoint) return null;

  const corridor = {
    enabled: true,
    entryPoint,
    exitPoint,
  };

  const paddingMeters = normalizePositiveNumber(rawCorridor.paddingMeters);
  const outlierDistanceMeters = normalizePositiveNumber(rawCorridor.outlierDistanceMeters);
  const detourPathPolyline = normalizeCoordinateList(
    rawCorridor.detourPathPolyline ||
    rawCorridor.pathPolyline ||
    rawCorridor.polyline ||
    rawCorridor.path
  );
  const startsAt = normalizeOptionalTimestamp(rawCorridor.startsAt);
  const expiresAt = normalizeOptionalTimestamp(rawCorridor.expiresAt);

  if (paddingMeters != null) corridor.paddingMeters = paddingMeters;
  if (outlierDistanceMeters != null) corridor.outlierDistanceMeters = outlierDistanceMeters;
  if (detourPathPolyline != null) corridor.detourPathPolyline = detourPathPolyline;
  if (startsAt != null) corridor.startsAt = startsAt;
  if (expiresAt != null) corridor.expiresAt = expiresAt;
  if (typeof rawCorridor.label === 'string' && rawCorridor.label.trim()) {
    corridor.label = rawCorridor.label.trim();
  }

  return corridor;
}

function normalizeIgnoredRouteEdgeArea(rawArea) {
  if (!rawArea || typeof rawArea !== 'object' || rawArea.enabled === false) return null;
  const center = normalizeCoordinate(rawArea.center || rawArea.coordinate);
  const radiusMeters = normalizePositiveNumber(rawArea.radiusMeters);
  const maxProgressMeters = normalizePositiveNumber(rawArea.maxProgressMeters);
  const edge = String(rawArea.edge || '').trim().toLowerCase();
  if (!center || radiusMeters == null || maxProgressMeters == null) return null;
  if (edge !== 'start' && edge !== 'end') return null;

  return {
    enabled: true,
    edge,
    center,
    radiusMeters,
    maxProgressMeters,
    ...(typeof rawArea.label === 'string' && rawArea.label.trim()
      ? { label: rawArea.label.trim() }
      : {}),
  };
}

function normalizeIgnoredRouteEdgeAreas(value) {
  if (!Array.isArray(value)) return null;
  const areas = value.map(normalizeIgnoredRouteEdgeArea).filter(Boolean);
  return areas.length > 0 ? areas : null;
}

function normalizeRouteOverride(rawOverride) {
  if (!rawOverride || typeof rawOverride !== 'object') return {};

  const override = {};
  const offRouteThresholdMeters = normalizePositiveNumber(rawOverride.offRouteThresholdMeters);
  const onRouteClearThresholdMeters = normalizePositiveNumber(rawOverride.onRouteClearThresholdMeters);
  const consecutiveReadingsRequired = normalizePositiveInteger(rawOverride.consecutiveReadingsRequired);
  const clearConsecutiveOnRoute = normalizePositiveInteger(rawOverride.clearConsecutiveOnRoute);
  const clearMinTraversalMeters = normalizePositiveNumber(rawOverride.clearMinTraversalMeters);
  const clearMinTraversalRatio = normalizePositiveNumber(rawOverride.clearMinTraversalRatio);
  const clearGraceMs = normalizePositiveNumber(rawOverride.clearGraceMs);
  const noVehicleTimeoutMs = normalizePositiveNumber(rawOverride.noVehicleTimeoutMs);
  const candidateEvidenceTtlMs = normalizePositiveNumber(rawOverride.candidateEvidenceTtlMs);
  const evidenceWindowMs = normalizePositiveNumber(rawOverride.evidenceWindowMs);
  const recurringShortDeviationFamilyId =
    typeof rawOverride.recurringShortDeviationFamilyId === 'string'
      ? rawOverride.recurringShortDeviationFamilyId.trim()
      : null;
  const recurringShortDeviationFamilyMinRoutes = normalizePositiveInteger(
    rawOverride.recurringShortDeviationFamilyMinRoutes
  );
  const recurringShortDeviationFamilyMinObservations = normalizePositiveInteger(
    rawOverride.recurringShortDeviationFamilyMinObservations
  );
  const recurringShortDeviationFamilyMaxDistanceMeters = normalizePositiveNumber(
    rawOverride.recurringShortDeviationFamilyMaxDistanceMeters
  );
  const minEvidenceForGeometry = normalizePositiveInteger(rawOverride.minEvidenceForGeometry);
  const mediumConfidenceMinEvidencePoints = normalizePositiveInteger(
    rawOverride.mediumConfidenceMinEvidencePoints
  );
  const mediumConfidenceMinUniqueVehicles = normalizePositiveInteger(
    rawOverride.mediumConfidenceMinUniqueVehicles
  );
  const multiVehiclePathMinEvidencePoints = normalizePositiveInteger(
    rawOverride.multiVehiclePathMinEvidencePoints
  );
  const multiVehiclePathMinUniqueVehicles = normalizePositiveInteger(
    rawOverride.multiVehiclePathMinUniqueVehicles
  );
  const multiVehiclePathPreferMergedSegment = rawOverride.multiVehiclePathPreferMergedSegment === true;
  const staleEntryAnchorMaxGapMeters = normalizePositiveNumber(rawOverride.staleEntryAnchorMaxGapMeters);
  const configuredDetourCorridor = normalizeConfiguredDetourCorridor(
    rawOverride.configuredDetourCorridor || rawOverride.detourCorridor
  );
  const ignoredRouteEdgeAreas = normalizeIgnoredRouteEdgeAreas(
    rawOverride.ignoredRouteEdgeAreas || rawOverride.normalRouteEdgeAreas
  );

  if (offRouteThresholdMeters != null) override.offRouteThresholdMeters = offRouteThresholdMeters;
  if (onRouteClearThresholdMeters != null) override.onRouteClearThresholdMeters = onRouteClearThresholdMeters;
  if (consecutiveReadingsRequired != null) override.consecutiveReadingsRequired = consecutiveReadingsRequired;
  if (clearConsecutiveOnRoute != null) override.clearConsecutiveOnRoute = clearConsecutiveOnRoute;
  if (clearMinTraversalMeters != null) override.clearMinTraversalMeters = clearMinTraversalMeters;
  if (clearMinTraversalRatio != null) override.clearMinTraversalRatio = Math.min(clearMinTraversalRatio, 1);
  if (clearGraceMs != null) override.clearGraceMs = clearGraceMs;
  if (noVehicleTimeoutMs != null) override.noVehicleTimeoutMs = noVehicleTimeoutMs;
  if (candidateEvidenceTtlMs != null) override.candidateEvidenceTtlMs = candidateEvidenceTtlMs;
  if (evidenceWindowMs != null) override.evidenceWindowMs = evidenceWindowMs;
  if (recurringShortDeviationFamilyId) {
    override.recurringShortDeviationFamilyId = recurringShortDeviationFamilyId;
  }
  if (recurringShortDeviationFamilyMinRoutes != null) {
    override.recurringShortDeviationFamilyMinRoutes = recurringShortDeviationFamilyMinRoutes;
  }
  if (recurringShortDeviationFamilyMinObservations != null) {
    override.recurringShortDeviationFamilyMinObservations = recurringShortDeviationFamilyMinObservations;
  }
  if (recurringShortDeviationFamilyMaxDistanceMeters != null) {
    override.recurringShortDeviationFamilyMaxDistanceMeters = recurringShortDeviationFamilyMaxDistanceMeters;
  }
  if (minEvidenceForGeometry != null) override.minEvidenceForGeometry = minEvidenceForGeometry;
  if (mediumConfidenceMinEvidencePoints != null) {
    override.mediumConfidenceMinEvidencePoints = mediumConfidenceMinEvidencePoints;
  }
  if (mediumConfidenceMinUniqueVehicles != null) {
    override.mediumConfidenceMinUniqueVehicles = mediumConfidenceMinUniqueVehicles;
  }
  if (multiVehiclePathMinEvidencePoints != null) {
    override.multiVehiclePathMinEvidencePoints = multiVehiclePathMinEvidencePoints;
  }
  if (multiVehiclePathMinUniqueVehicles != null) {
    override.multiVehiclePathMinUniqueVehicles = multiVehiclePathMinUniqueVehicles;
  }
  if (multiVehiclePathPreferMergedSegment) {
    override.multiVehiclePathPreferMergedSegment = true;
  }
  if (staleEntryAnchorMaxGapMeters != null) {
    override.staleEntryAnchorMaxGapMeters = staleEntryAnchorMaxGapMeters;
  }
  if (configuredDetourCorridor) {
    override.configuredDetourCorridor = configuredDetourCorridor;
  }
  if (ignoredRouteEdgeAreas) {
    override.ignoredRouteEdgeAreas = ignoredRouteEdgeAreas;
  }

  return override;
}

function parseEnvRouteOverrides(rawJson) {
  if (!rawJson) return {};

  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([routeId, rawOverride]) => [routeId, normalizeRouteOverride(rawOverride)])
    );
  } catch (error) {
    console.warn('[detourRouteConfig] Failed to parse DETOUR_ROUTE_OVERRIDES_JSON:', error.message);
    return {};
  }
}

const ENV_ROUTE_DETECTOR_OVERRIDES = parseEnvRouteOverrides(process.env.DETOUR_ROUTE_OVERRIDES_JSON);

function getRouteOverride(overrides, routeId) {
  if (!routeId) return {};
  const normalizedRouteId = String(routeId).trim();
  return overrides[normalizedRouteId] ||
    overrides[normalizedRouteId.toUpperCase()] ||
    overrides[normalizedRouteId.toLowerCase()] ||
    {};
}

const ROUTE_DETECTOR_OVERRIDES = Object.freeze(
  Object.fromEntries(
    [...new Set([
      ...Object.keys(DEFAULT_ROUTE_DETECTOR_OVERRIDES),
      ...Object.keys(ENV_ROUTE_DETECTOR_OVERRIDES),
    ])].map((routeId) => [routeId, {
      ...(DEFAULT_ROUTE_DETECTOR_OVERRIDES[routeId] || {}),
      ...(ENV_ROUTE_DETECTOR_OVERRIDES[routeId] || {}),
    }])
  )
);

function getRouteDetectorConfig(routeId, defaults) {
  return {
    ...defaults,
    ...getRouteOverride(ROUTE_DETECTOR_OVERRIDES, routeId),
  };
}

module.exports = {
  DEFAULT_ROUTE_DETECTOR_OVERRIDES,
  ROUTE_DETECTOR_OVERRIDES,
  getRouteDetectorConfig,
  normalizeConfiguredDetourCorridor,
  normalizeIgnoredRouteEdgeArea,
};
