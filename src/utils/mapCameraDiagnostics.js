const BUILD_DIAGNOSTICS_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_MAP_CAMERA_DIAGNOSTICS === 'true';

const MAX_EVENTS = 240;

let enabledOverride = null;
let sessionStartedAt = Date.now();
let sequence = 0;
let events = [];

const diagnosticsEnabled = () => (
  enabledOverride == null ? BUILD_DIAGNOSTICS_ENABLED : enabledOverride
);

const normalizeDetails = (details) => {
  if (details == null) return null;

  try {
    return JSON.parse(JSON.stringify(details, (_key, value) => {
      if (typeof value === 'string' && value.length > 500) {
        return `${value.slice(0, 500)}...`;
      }
      return value;
    }));
  } catch (_) {
    return { serializationError: true, summary: String(details).slice(0, 500) };
  }
};

export const MAP_CAMERA_DIAGNOSTICS_ENABLED = BUILD_DIAGNOSTICS_ENABLED;

export const recordMapCameraDiagnostic = (type, details = null) => {
  if (!diagnosticsEnabled()) return null;

  const timestamp = Date.now();
  const event = {
    sequence: ++sequence,
    timestamp,
    elapsedMs: timestamp - sessionStartedAt,
    type: String(type || 'unknown'),
    details: normalizeDetails(details),
  };

  events.push(event);
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }

  console.info('[map-camera-diagnostic]', JSON.stringify(event));
  return event;
};

export const clearMapCameraDiagnostics = () => {
  sessionStartedAt = Date.now();
  sequence = 0;
  events = [];
  recordMapCameraDiagnostic('diagnostics.started');
};

export const getMapCameraDiagnosticsSnapshot = () => ({
  enabled: diagnosticsEnabled(),
  sessionStartedAt,
  generatedAt: Date.now(),
  eventCount: events.length,
  events: events.map((event) => ({ ...event })),
});

export const formatMapCameraDiagnosticsReport = (metadata = {}) => {
  const snapshot = getMapCameraDiagnosticsSnapshot();
  return [
    'BTTP map camera diagnostics',
    JSON.stringify({ metadata: normalizeDetails(metadata), ...snapshot }, null, 2),
  ].join('\n');
};

export const __TEST_ONLY__ = {
  MAX_EVENTS,
  setEnabledOverride(value) {
    enabledOverride = value;
  },
  reset() {
    enabledOverride = null;
    sessionStartedAt = Date.now();
    sequence = 0;
    events = [];
  },
};
