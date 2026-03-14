'use strict';

const DEFAULT_ROUTE_DETECTOR_OVERRIDES = Object.freeze({
  // Route 8 branch detours are small, sustained construction deviations.
  // Tighten detection so the worker can learn them without changing the
  // network-wide thresholds that protect other routes from false positives.
  '8A': Object.freeze({
    offRouteThresholdMeters: 45,
    onRouteClearThresholdMeters: 25,
    consecutiveReadingsRequired: 3,
    evidenceWindowMs: 45 * 60 * 1000,
  }),
  '8B': Object.freeze({
    offRouteThresholdMeters: 45,
    onRouteClearThresholdMeters: 25,
    consecutiveReadingsRequired: 3,
    evidenceWindowMs: 45 * 60 * 1000,
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
  const clearGraceMs = normalizePositiveNumber(rawOverride.clearGraceMs);
  const noVehicleTimeoutMs = normalizePositiveNumber(rawOverride.noVehicleTimeoutMs);
  const evidenceWindowMs = normalizePositiveNumber(rawOverride.evidenceWindowMs);

  if (offRouteThresholdMeters != null) override.offRouteThresholdMeters = offRouteThresholdMeters;
  if (onRouteClearThresholdMeters != null) override.onRouteClearThresholdMeters = onRouteClearThresholdMeters;
  if (consecutiveReadingsRequired != null) override.consecutiveReadingsRequired = consecutiveReadingsRequired;
  if (clearConsecutiveOnRoute != null) override.clearConsecutiveOnRoute = clearConsecutiveOnRoute;
  if (clearGraceMs != null) override.clearGraceMs = clearGraceMs;
  if (noVehicleTimeoutMs != null) override.noVehicleTimeoutMs = noVehicleTimeoutMs;
  if (evidenceWindowMs != null) override.evidenceWindowMs = evidenceWindowMs;

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
