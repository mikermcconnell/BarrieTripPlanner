'use strict';

const DEFAULT_ROUTE_DETECTOR_OVERRIDES = Object.freeze({
  // Route 12's downtown detour can be short enough that one bus in each
  // direction may only yield one short-deviation observation. Group 12A/12B
  // by physical area so both branches can be flagged from the shared corridor.
  '12A': Object.freeze({
    recurringShortDeviationFamilyId: '12',
    recurringShortDeviationFamilyMinRoutes: 2,
    recurringShortDeviationFamilyMinObservations: 2,
    recurringShortDeviationFamilyMaxDistanceMeters: 500,
    staleEntryAnchorMaxGapMeters: 150,
  }),
  '12B': Object.freeze({
    recurringShortDeviationFamilyId: '12',
    recurringShortDeviationFamilyMinRoutes: 2,
    recurringShortDeviationFamilyMinObservations: 2,
    recurringShortDeviationFamilyMaxDistanceMeters: 500,
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

const ROUTE_DETECTOR_OVERRIDES = Object.freeze({
  ...DEFAULT_ROUTE_DETECTOR_OVERRIDES,
  ...ENV_ROUTE_DETECTOR_OVERRIDES,
});

function getRouteDetectorConfig(routeId, defaults) {
  return {
    ...defaults,
    ...(routeId ? ROUTE_DETECTOR_OVERRIDES[routeId] || {} : {}),
  };
}

module.exports = {
  DEFAULT_ROUTE_DETECTOR_OVERRIDES,
  ROUTE_DETECTOR_OVERRIDES,
  getRouteDetectorConfig,
};
