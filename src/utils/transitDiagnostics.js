import { REFRESH_INTERVALS } from '../config/constants';

export const DIAGNOSTIC_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  OFFLINE: 'offline',
  ERROR: 'error',
};

export const TRANSIT_DIAGNOSTIC_STALE_AFTER_MS = {
  staticData: REFRESH_INTERVALS.STATIC_DATA * 2,
  realtimeVehicles: REFRESH_INTERVALS.VEHICLE_POSITIONS * 4,
  routing: REFRESH_INTERVALS.STATIC_DATA * 2,
  proxyApi: 5 * 60 * 1000,
};

const toTimestamp = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getErrorMessage = (error) => {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message.trim()) return error.message;
  return String(error);
};

const buildFeedDiagnostic = ({
  isLoading = false,
  isOffline = false,
  isAvailable = false,
  usingCachedData = false,
  staleAfterMs,
  lastSuccessAt = null,
  lastFailureAt = null,
  error = null,
  now = Date.now(),
}) => {
  const successAt = toTimestamp(lastSuccessAt);
  const failureAt = toTimestamp(lastFailureAt);
  const errorMessage = getErrorMessage(error);
  const staleAgeMs = successAt ? Math.max(0, now - successAt) : null;
  const isStale = Boolean(
    isAvailable &&
    successAt &&
    Number.isFinite(staleAfterMs) &&
    staleAgeMs > staleAfterMs
  );

  let status = DIAGNOSTIC_STATUS.IDLE;
  let reason = 'idle';

  if (isLoading && !isAvailable) {
    status = DIAGNOSTIC_STATUS.LOADING;
    reason = 'loading';
  } else if (!isAvailable && isOffline) {
    status = DIAGNOSTIC_STATUS.OFFLINE;
    reason = 'offline';
  } else if (!isAvailable && errorMessage) {
    status = DIAGNOSTIC_STATUS.ERROR;
    reason = 'unavailable';
  } else if (isAvailable && isOffline) {
    status = DIAGNOSTIC_STATUS.DEGRADED;
    reason = 'offline_using_available_data';
  } else if (isAvailable && usingCachedData) {
    status = DIAGNOSTIC_STATUS.DEGRADED;
    reason = 'using_cached_data';
  } else if (isAvailable && isStale) {
    status = DIAGNOSTIC_STATUS.DEGRADED;
    reason = 'stale_data';
  } else if (isAvailable) {
    status = DIAGNOSTIC_STATUS.HEALTHY;
    reason = 'available';
  } else if (isLoading) {
    status = DIAGNOSTIC_STATUS.LOADING;
    reason = 'loading';
  } else if (errorMessage) {
    status = DIAGNOSTIC_STATUS.ERROR;
    reason = 'error';
  }

  return {
    status,
    reason,
    isAvailable,
    isOffline,
    usingCachedData,
    isStale,
    staleAgeMs,
    staleAfterMs,
    lastSuccessAt: successAt,
    lastFailureAt: failureAt,
    errorMessage,
  };
};

const buildRoutingDiagnostic = ({
  isLoading = false,
  isOffline = false,
  isReady = false,
  routingData = null,
  lastSuccessAt = null,
  lastFailureAt = null,
  error = null,
  now = Date.now(),
}) => {
  const successAt = toTimestamp(lastSuccessAt);
  const failureAt = toTimestamp(lastFailureAt);
  const errorMessage = getErrorMessage(error);
  const isAvailable = Boolean(isReady || routingData);
  const staleAgeMs = successAt ? Math.max(0, now - successAt) : null;
  const isStale = Boolean(
    isAvailable &&
    successAt &&
    staleAgeMs > TRANSIT_DIAGNOSTIC_STALE_AFTER_MS.routing
  );

  let status = DIAGNOSTIC_STATUS.IDLE;
  let reason = 'not_requested';

  if (isLoading) {
    status = DIAGNOSTIC_STATUS.LOADING;
    reason = 'building';
  } else if (isAvailable && isStale) {
    status = DIAGNOSTIC_STATUS.DEGRADED;
    reason = 'stale_data';
  } else if (isAvailable) {
    status = DIAGNOSTIC_STATUS.HEALTHY;
    reason = 'ready';
  } else if (errorMessage && isOffline) {
    status = DIAGNOSTIC_STATUS.DEGRADED;
    reason = 'build_failed_offline';
  } else if (errorMessage) {
    status = DIAGNOSTIC_STATUS.DEGRADED;
    reason = 'build_failed';
  } else if (isOffline) {
    status = DIAGNOSTIC_STATUS.IDLE;
    reason = 'offline_not_requested';
  }

  return {
    status,
    reason,
    isAvailable,
    isOffline,
    isStale,
    staleAgeMs,
    staleAfterMs: TRANSIT_DIAGNOSTIC_STALE_AFTER_MS.routing,
    lastSuccessAt: successAt,
    lastFailureAt: failureAt,
    errorMessage,
  };
};

const buildOverallDiagnostic = ({ isOffline, staticData, realtimeVehicles, routing, proxyApi }) => {
  if (staticData.status === DIAGNOSTIC_STATUS.ERROR) {
    return {
      status: DIAGNOSTIC_STATUS.ERROR,
      reason: 'static_data_unavailable',
    };
  }

  if (staticData.status === DIAGNOSTIC_STATUS.LOADING) {
    return {
      status: DIAGNOSTIC_STATUS.LOADING,
      reason: 'loading_static_data',
    };
  }

  if (
    staticData.status === DIAGNOSTIC_STATUS.DEGRADED ||
    realtimeVehicles.status === DIAGNOSTIC_STATUS.DEGRADED ||
    realtimeVehicles.status === DIAGNOSTIC_STATUS.ERROR ||
    routing.status === DIAGNOSTIC_STATUS.DEGRADED ||
    proxyApi.status === DIAGNOSTIC_STATUS.DEGRADED ||
    proxyApi.status === DIAGNOSTIC_STATUS.ERROR
  ) {
    return {
      status: DIAGNOSTIC_STATUS.DEGRADED,
      reason: isOffline ? 'offline_with_partial_data' : 'partial_backend_availability',
    };
  }

  if (isOffline) {
    return {
      status: DIAGNOSTIC_STATUS.OFFLINE,
      reason: 'offline',
    };
  }

  return {
    status: DIAGNOSTIC_STATUS.HEALTHY,
    reason: 'all_available',
  };
};

export const buildTransitDiagnostics = ({
  isOffline = false,
  staticData = {},
  realtimeVehicles = {},
  routing = {},
  proxyApi = {},
  counts = {},
  now = Date.now(),
}) => {
  const staticDiagnostic = buildFeedDiagnostic({
    ...staticData,
    staleAfterMs: TRANSIT_DIAGNOSTIC_STALE_AFTER_MS.staticData,
    now,
  });
  const realtimeDiagnostic = buildFeedDiagnostic({
    ...realtimeVehicles,
    staleAfterMs: TRANSIT_DIAGNOSTIC_STALE_AFTER_MS.realtimeVehicles,
    now,
  });
  const routingDiagnostic = buildRoutingDiagnostic({
    ...routing,
    now,
  });
  const proxyDiagnostic = buildFeedDiagnostic({
    ...proxyApi,
    staleAfterMs: TRANSIT_DIAGNOSTIC_STALE_AFTER_MS.proxyApi,
    now,
  });
  const overall = buildOverallDiagnostic({
    isOffline,
    staticData: staticDiagnostic,
    realtimeVehicles: realtimeDiagnostic,
    routing: routingDiagnostic,
    proxyApi: proxyDiagnostic,
  });

  return {
    generatedAt: now,
    overall,
    staticData: staticDiagnostic,
    realtimeVehicles: realtimeDiagnostic,
    routing: routingDiagnostic,
    proxyApi: proxyDiagnostic,
    counts: {
      routes: counts.routes || 0,
      stops: counts.stops || 0,
      vehicles: counts.vehicles || 0,
      alerts: counts.alerts || 0,
    },
  };
};

export default buildTransitDiagnostics;
