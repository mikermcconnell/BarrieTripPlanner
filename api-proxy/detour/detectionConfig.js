const configuredThreshold = Number.parseFloat(process.env.DETOUR_OFF_ROUTE_THRESHOLD_METERS || '75');
const OFF_ROUTE_THRESHOLD_METERS = Number.isFinite(configuredThreshold) && configuredThreshold > 0
  ? configuredThreshold
  : 75;

const configuredOnRouteThreshold = Number.parseFloat(process.env.DETOUR_ON_ROUTE_CLEAR_THRESHOLD_METERS || '40');
const ON_ROUTE_CLEAR_THRESHOLD_METERS =
  Number.isFinite(configuredOnRouteThreshold) && configuredOnRouteThreshold > 0
    ? configuredOnRouteThreshold
    : 40;

const configuredClearGraceMs = Number.parseFloat(process.env.DETOUR_CLEAR_GRACE_MS || '600000');
const DETOUR_CLEAR_GRACE_MS =
  Number.isFinite(configuredClearGraceMs) && configuredClearGraceMs >= 0
    ? configuredClearGraceMs
    : 600_000;

const workerMode = String(process.env.DETOUR_WORKER_MODE || 'interval').trim().toLowerCase();
const defaultClearConsecutiveOnRoute = workerMode === 'scheduled' ? 4 : 6;
const configuredClearConsecutive = Number.parseInt(
  process.env.DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE || String(defaultClearConsecutiveOnRoute),
  10
);
const DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE =
  Number.isFinite(configuredClearConsecutive) && configuredClearConsecutive > 0
    ? configuredClearConsecutive
    : defaultClearConsecutiveOnRoute;

const configuredClearMinTraversalMeters = Number.parseFloat(
  process.env.DETOUR_CLEAR_MIN_TRAVERSAL_METERS || '100'
);
const DETOUR_CLEAR_MIN_TRAVERSAL_METERS =
  Number.isFinite(configuredClearMinTraversalMeters) && configuredClearMinTraversalMeters >= 0
    ? configuredClearMinTraversalMeters
    : 100;

const configuredClearMinTraversalRatio = Number.parseFloat(
  process.env.DETOUR_CLEAR_MIN_TRAVERSAL_RATIO || '0.6'
);
const DETOUR_CLEAR_MIN_TRAVERSAL_RATIO =
  Number.isFinite(configuredClearMinTraversalRatio) && configuredClearMinTraversalRatio > 0
    ? Math.min(configuredClearMinTraversalRatio, 1)
    : 0.6;

const configuredNoVehicleTimeoutMs = Number.parseFloat(
  process.env.DETOUR_NO_VEHICLE_TIMEOUT_MS || String(30 * 60 * 1000)
);
const DETOUR_NO_VEHICLE_TIMEOUT_MS =
  Number.isFinite(configuredNoVehicleTimeoutMs) && configuredNoVehicleTimeoutMs > 0
    ? configuredNoVehicleTimeoutMs
    : 30 * 60 * 1000;

const configuredCandidateEvidenceTtlMs = Number.parseFloat(
  process.env.DETOUR_CANDIDATE_EVIDENCE_TTL_MS || String(3 * 60 * 60 * 1000)
);
const DETOUR_CANDIDATE_EVIDENCE_TTL_MS =
  Number.isFinite(configuredCandidateEvidenceTtlMs) && configuredCandidateEvidenceTtlMs > 0
    ? configuredCandidateEvidenceTtlMs
    : 3 * 60 * 60 * 1000;

const configuredConsecutiveReadings = Number.parseInt(process.env.DETOUR_CONSECUTIVE_READINGS || '3', 10);
const CONSECUTIVE_READINGS_REQUIRED =
  Number.isFinite(configuredConsecutiveReadings) && configuredConsecutiveReadings > 0
    ? configuredConsecutiveReadings
    : 3;

const STALE_VEHICLE_TIMEOUT_MS = 5 * 60 * 1000;

const configuredMinUniqueVehicles = Number.parseInt(process.env.DETOUR_MIN_UNIQUE_VEHICLES || '2', 10);
const DEFAULT_MIN_VEHICLES_FOR_DETOUR =
  Number.isFinite(configuredMinUniqueVehicles) && configuredMinUniqueVehicles > 0
    ? Math.max(configuredMinUniqueVehicles, 2)
    : 2;

const configuredEvidenceWindowMs = Number.parseFloat(
  process.env.DETOUR_EVIDENCE_WINDOW_MS || String(15 * 60 * 1000)
);
const EVIDENCE_WINDOW_MS =
  Number.isFinite(configuredEvidenceWindowMs) && configuredEvidenceWindowMs > 0
    ? configuredEvidenceWindowMs
    : 15 * 60 * 1000;

const configuredVehicleTraceWindowMs = Number.parseFloat(
  process.env.DETOUR_VEHICLE_TRACE_WINDOW_MS || String(20 * 60 * 1000)
);
const DETOUR_VEHICLE_TRACE_WINDOW_MS =
  Number.isFinite(configuredVehicleTraceWindowMs) && configuredVehicleTraceWindowMs > 0
    ? configuredVehicleTraceWindowMs
    : 20 * 60 * 1000;

const configuredCandidateConfirmationWindowMs = Number.parseFloat(
  process.env.DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS || String(3 * 60 * 60 * 1000)
);
const DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS =
  Number.isFinite(configuredCandidateConfirmationWindowMs) && configuredCandidateConfirmationWindowMs > 0
    ? configuredCandidateConfirmationWindowMs
    : 3 * 60 * 60 * 1000;

const configuredCandidateHeadwayMultiplier = Number.parseFloat(
  process.env.DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER || '2'
);
const DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER =
  Number.isFinite(configuredCandidateHeadwayMultiplier) && configuredCandidateHeadwayMultiplier > 0
    ? configuredCandidateHeadwayMultiplier
    : 2;

const configuredCandidateBufferMs = Number.parseFloat(
  process.env.DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS || String(10 * 60 * 1000)
);
const DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS =
  Number.isFinite(configuredCandidateBufferMs) && configuredCandidateBufferMs >= 0
    ? configuredCandidateBufferMs
    : 10 * 60 * 1000;

const configuredCandidateMaxMs = Number.parseFloat(
  process.env.DETOUR_CANDIDATE_CONFIRMATION_MAX_MS || String(3 * 60 * 60 * 1000)
);
const DETOUR_CANDIDATE_CONFIRMATION_MAX_MS =
  Number.isFinite(configuredCandidateMaxMs) && configuredCandidateMaxMs > 0
    ? configuredCandidateMaxMs
    : 3 * 60 * 60 * 1000;

const configuredPersistConsecutiveMatches = Number.parseInt(
  process.env.DETOUR_PERSIST_CONSECUTIVE_MATCHES || '10',
  10
);
const DETOUR_PERSIST_CONSECUTIVE_MATCHES =
  Number.isFinite(configuredPersistConsecutiveMatches) && configuredPersistConsecutiveMatches > 0
    ? configuredPersistConsecutiveMatches
    : 10;

const configuredPersistMinAgeMs = Number.parseFloat(
  process.env.DETOUR_PERSIST_MIN_AGE_MS || String(5 * 60 * 60 * 1000)
);
const DETOUR_PERSIST_MIN_AGE_MS =
  Number.isFinite(configuredPersistMinAgeMs) && configuredPersistMinAgeMs > 0
    ? configuredPersistMinAgeMs
    : 5 * 60 * 60 * 1000;

const RECURRING_SHORT_DEVIATION_ENABLED =
  process.env.DETOUR_RECURRING_SHORT_DEVIATION_ENABLED !== 'false';

const configuredRecurringShortDeviationWindowMs = Number.parseFloat(
  process.env.DETOUR_RECURRING_SHORT_DEVIATION_WINDOW_MS || String(3 * 60 * 60 * 1000)
);
const RECURRING_SHORT_DEVIATION_WINDOW_MS =
  Number.isFinite(configuredRecurringShortDeviationWindowMs) && configuredRecurringShortDeviationWindowMs > 0
    ? configuredRecurringShortDeviationWindowMs
    : 3 * 60 * 60 * 1000;

const configuredRecurringShortDeviationMinObservations = Number.parseInt(
  process.env.DETOUR_RECURRING_SHORT_DEVIATION_MIN_OBSERVATIONS || '2',
  10
);
const RECURRING_SHORT_DEVIATION_MIN_OBSERVATIONS =
  Number.isFinite(configuredRecurringShortDeviationMinObservations) &&
  configuredRecurringShortDeviationMinObservations > 0
    ? configuredRecurringShortDeviationMinObservations
    : 2;

const configuredRecurringShortDeviationMinUniqueSignatures = Number.parseInt(
  process.env.DETOUR_RECURRING_SHORT_DEVIATION_MIN_UNIQUE_SIGNATURES || '2',
  10
);
const RECURRING_SHORT_DEVIATION_MIN_UNIQUE_SIGNATURES =
  Number.isFinite(configuredRecurringShortDeviationMinUniqueSignatures) &&
  configuredRecurringShortDeviationMinUniqueSignatures > 0
    ? configuredRecurringShortDeviationMinUniqueSignatures
    : 2;

const configuredRecurringShortDeviationMaxGapMeters = Number.parseFloat(
  process.env.DETOUR_RECURRING_SHORT_DEVIATION_MAX_GAP_METERS || '350'
);
const RECURRING_SHORT_DEVIATION_MAX_GAP_METERS =
  Number.isFinite(configuredRecurringShortDeviationMaxGapMeters) &&
  configuredRecurringShortDeviationMaxGapMeters > 0
    ? configuredRecurringShortDeviationMaxGapMeters
    : 350;

const configuredRecurringShortDeviationMaxStreakReadings = Number.parseInt(
  process.env.DETOUR_RECURRING_SHORT_DEVIATION_MAX_STREAK_READINGS ||
    String(Math.max(1, CONSECUTIVE_READINGS_REQUIRED - 1)),
  10
);
const RECURRING_SHORT_DEVIATION_MAX_STREAK_READINGS =
  Number.isFinite(configuredRecurringShortDeviationMaxStreakReadings) &&
  configuredRecurringShortDeviationMaxStreakReadings > 0
    ? configuredRecurringShortDeviationMaxStreakReadings
    : Math.max(1, CONSECUTIVE_READINGS_REQUIRED - 1);

const SERVICE_START_HOUR = Number.parseInt(process.env.DETOUR_SERVICE_START_HOUR || '5', 10);
const SERVICE_END_HOUR = Number.parseInt(process.env.DETOUR_SERVICE_END_HOUR || '1', 10);
const SERVICE_TIMEZONE = process.env.DETOUR_SERVICE_TIMEZONE || 'America/Toronto';

const BASE_ROUTE_DETECTOR_CONFIG = Object.freeze({
  offRouteThresholdMeters: OFF_ROUTE_THRESHOLD_METERS,
  onRouteClearThresholdMeters: ON_ROUTE_CLEAR_THRESHOLD_METERS,
  consecutiveReadingsRequired: CONSECUTIVE_READINGS_REQUIRED,
  clearConsecutiveOnRoute: DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE,
  clearMinTraversalMeters: DETOUR_CLEAR_MIN_TRAVERSAL_METERS,
  clearMinTraversalRatio: DETOUR_CLEAR_MIN_TRAVERSAL_RATIO,
  clearGraceMs: DETOUR_CLEAR_GRACE_MS,
  noVehicleTimeoutMs: DETOUR_NO_VEHICLE_TIMEOUT_MS,
  candidateEvidenceTtlMs: DETOUR_CANDIDATE_EVIDENCE_TTL_MS,
  evidenceWindowMs: EVIDENCE_WINDOW_MS,
});

function isWithinServiceHours(nowMs) {
  const d = new Date(nowMs);
  const hour = Number.parseInt(
    d.toLocaleString('en-US', { timeZone: SERVICE_TIMEZONE, hour: 'numeric', hour12: false }),
    10
  );
  if (SERVICE_START_HOUR > SERVICE_END_HOUR) {
    return hour >= SERVICE_START_HOUR || hour < SERVICE_END_HOUR;
  }
  return hour >= SERVICE_START_HOUR && hour < SERVICE_END_HOUR;
}

module.exports = {
  OFF_ROUTE_THRESHOLD_METERS,
  ON_ROUTE_CLEAR_THRESHOLD_METERS,
  DETOUR_CLEAR_GRACE_MS,
  DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE,
  DETOUR_CLEAR_MIN_TRAVERSAL_METERS,
  DETOUR_CLEAR_MIN_TRAVERSAL_RATIO,
  DETOUR_NO_VEHICLE_TIMEOUT_MS,
  DETOUR_CANDIDATE_EVIDENCE_TTL_MS,
  CONSECUTIVE_READINGS_REQUIRED,
  STALE_VEHICLE_TIMEOUT_MS,
  DEFAULT_MIN_VEHICLES_FOR_DETOUR,
  EVIDENCE_WINDOW_MS,
  DETOUR_VEHICLE_TRACE_WINDOW_MS,
  DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS,
  DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER,
  DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS,
  DETOUR_CANDIDATE_CONFIRMATION_MAX_MS,
  DETOUR_PERSIST_CONSECUTIVE_MATCHES,
  DETOUR_PERSIST_MIN_AGE_MS,
  RECURRING_SHORT_DEVIATION_ENABLED,
  RECURRING_SHORT_DEVIATION_WINDOW_MS,
  RECURRING_SHORT_DEVIATION_MIN_OBSERVATIONS,
  RECURRING_SHORT_DEVIATION_MIN_UNIQUE_SIGNATURES,
  RECURRING_SHORT_DEVIATION_MAX_GAP_METERS,
  RECURRING_SHORT_DEVIATION_MAX_STREAK_READINGS,
  SERVICE_START_HOUR,
  SERVICE_END_HOUR,
  SERVICE_TIMEZONE,
  BASE_ROUTE_DETECTOR_CONFIG,
  isWithinServiceHours,
};
