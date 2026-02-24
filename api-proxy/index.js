/**
 * API Proxy Server
 *
 * Proxies LocationIQ API requests so API keys stay server-side.
 * Can be deployed as a Vercel/Netlify serverless function or run standalone.
 *
 * Endpoints:
 *   GET /api/geocode?q=...         — Forward geocode (address → coords)
 *   GET /api/reverse-geocode?lat=...&lon=... — Reverse geocode (coords → address)
 *   GET /api/autocomplete?q=...    — Address autocomplete
 *   GET /api/walking-directions?from=lat,lon&to=lat,lon — Walking directions
 *   GET /api/detour-logs?limit=...   — Detour history timeline
 *
 * Environment variables:
 *   LOCATIONIQ_API_KEY      — Required. Your LocationIQ API key.
 *   PORT                    — Optional. Defaults to 3001.
 *   ALLOWED_ORIGINS         — Optional. Comma-separated list of allowed CORS origins.
 *   API_PROXY_TOKEN         — Optional. Shared token for clients via x-api-token header.
 *   API_PROXY_TOKENS        — Optional. Comma-separated shared tokens (takes precedence over API_PROXY_TOKEN).
 *   REQUIRE_API_AUTH        — Optional. Defaults to true.
 *   REQUIRE_FIREBASE_AUTH   — Optional. Set to "true" to require Firebase ID token auth (Authorization: Bearer <token>).
 *   ALLOW_SHARED_TOKEN_AUTH — Optional. Defaults to false in production, true otherwise.
 *   DETOUR_WORKER_ENABLED   — Optional. Set to "true" to enable server-side detour detection.
 *   DETOUR_HISTORY_ENABLED  — Optional. Defaults to true. Set false to disable history writes.
 *   DETOUR_HISTORY_RETENTION_DAYS — Optional. Defaults to 30.
 *   DETOUR_DEBUG_API_KEY          — Optional. Server-only API key for /api/detour-debug without Firebase auth.
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Required for detour worker. JSON string of Firebase credentials.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { getAuth } = require('./firebaseAdmin');
const { getDetourHistory, HISTORY_MAX_LIMIT } = require('./detourPublisher');
const surveyRoutes = require('./surveyRoutes');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, '..', '.env'));

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = (process.env.LOCATIONIQ_API_KEY || '').trim();
const BASE_URL = 'https://us1.locationiq.com/v1';
const hasLocationIQKey = Boolean(API_KEY);
const isProd = process.env.NODE_ENV === 'production';
const REQUIRE_API_AUTH = process.env.REQUIRE_API_AUTH
  ? process.env.REQUIRE_API_AUTH === 'true'
  : true;
const REQUIRE_FIREBASE_AUTH = process.env.REQUIRE_FIREBASE_AUTH === 'true';
const ALLOW_SHARED_TOKEN_AUTH = process.env.ALLOW_SHARED_TOKEN_AUTH
  ? process.env.ALLOW_SHARED_TOKEN_AUTH === 'true'
  : !isProd;
const API_TOKENS = new Set(
  (process.env.API_PROXY_TOKENS || process.env.API_PROXY_TOKEN || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
);
const DETOUR_DEBUG_API_KEY = (process.env.DETOUR_DEBUG_API_KEY || '').trim();

// Barrie bounding box
const BARRIE_BOUNDS = '-79.85,44.25,-79.55,44.50';

if (!hasLocationIQKey) {
  console.warn('LOCATIONIQ_API_KEY is missing. LocationIQ proxy endpoints will return 503.');
}
if (isProd && REQUIRE_API_AUTH && !REQUIRE_FIREBASE_AUTH) {
  throw new Error(
    'Production proxy must use Firebase Bearer auth. Set REQUIRE_FIREBASE_AUTH=true.'
  );
}
if (REQUIRE_API_AUTH && ALLOW_SHARED_TOKEN_AUTH && API_TOKENS.size === 0 && !REQUIRE_FIREBASE_AUTH) {
  throw new Error(
    'API auth is required but no auth method is configured. ' +
      'Set API_PROXY_TOKEN/API_PROXY_TOKENS or enable REQUIRE_FIREBASE_AUTH.'
  );
}
if (REQUIRE_API_AUTH && !ALLOW_SHARED_TOKEN_AUTH && !REQUIRE_FIREBASE_AUTH) {
  throw new Error(
    'API auth is required but shared token auth is disabled and Firebase auth is not enabled.'
  );
}
if (REQUIRE_FIREBASE_AUTH && !getAuth()) {
  throw new Error(
    'REQUIRE_FIREBASE_AUTH=true but Firebase Admin SDK is not configured. ' +
      'Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.'
  );
}

// ─── Middleware ────────────────────────────────────────────────────
app.set('trust proxy', 1);

// CORS
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || (isProd ? '' : 'http://localhost:8081,http://localhost:19006')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (isProd && !process.env.ALLOWED_ORIGINS) {
  console.warn('ALLOWED_ORIGINS is not set. Browser clients will be blocked by CORS.');
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, X-Client-Id, X-Device-Id, X-Admin-Key');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

function sanitizeClientKey(raw) {
  if (!raw) return '';
  return String(raw).trim().slice(0, 64).replace(/[^a-zA-Z0-9_.:-]/g, '');
}

async function authenticateApiRequest(req, res, next) {
  if (req.path === '/health') return next();
  if (!REQUIRE_API_AUTH) return next();

  // Ops-safe auth bypass for detour debug endpoint using server-only API key (header only)
  if (req.path === '/detour-debug' && DETOUR_DEBUG_API_KEY) {
    const debugKey = req.get('x-debug-key');
    if (debugKey && debugKey === DETOUR_DEBUG_API_KEY) {
      req.clientId = 'debug-ops';
      return next();
    }
  }

  const headerToken = req.get('x-api-token');
  if (ALLOW_SHARED_TOKEN_AUTH && headerToken && API_TOKENS.has(headerToken.trim())) {
    req.clientId = `token:${headerToken.trim().slice(0, 8)}`;
    return next();
  }

  const authHeader = req.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer && REQUIRE_FIREBASE_AUTH) {
    try {
      const decoded = await getAuth().verifyIdToken(bearer);
      req.clientId = `uid:${decoded.uid}`;
      return next();
    } catch (_error) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }
  }

  return res.status(401).json({
    error: 'Unauthorized',
    details: `Provide ${
      [
        ALLOW_SHARED_TOKEN_AUTH ? 'x-api-token' : null,
        REQUIRE_FIREBASE_AUTH ? 'a valid Firebase Bearer token' : null,
      ]
        .filter(Boolean)
        .join(' or ')
    }`,
  });
}

app.use('/api', authenticateApiRequest);

// Rate limiting: 100 requests per minute per client token/user/IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  keyGenerator: (req) => {
    const auth = sanitizeClientKey(req.clientId);
    return auth || req.ip;
  },
});
app.use('/api/', limiter);

// ─── Survey Routes ────────────────────────────────────────────
app.use('/api/survey', surveyRoutes);

// ─── Helper ───────────────────────────────────────────────────────

function parseLatLon(value, fieldName) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`"${fieldName}" must be a valid number`);
  }
  return parsed;
}

function validateLatitude(value, fieldName) {
  if (value < -90 || value > 90) {
    throw new Error(`"${fieldName}" must be between -90 and 90`);
  }
}

function validateLongitude(value, fieldName) {
  if (value < -180 || value > 180) {
    throw new Error(`"${fieldName}" must be between -180 and 180`);
  }
}

function parseCoordinatePair(value, fieldName) {
  const parts = String(value).split(',').map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`"${fieldName}" must use "lat,lon" format`);
  }
  const lat = parseLatLon(parts[0], `${fieldName}.lat`);
  const lon = parseLatLon(parts[1], `${fieldName}.lon`);
  validateLatitude(lat, `${fieldName}.lat`);
  validateLongitude(lon, `${fieldName}.lon`);
  return { lat, lon };
}

function normalizeQuery(value) {
  const query = String(value || '').trim();
  if (query.length < 2) {
    throw new Error('Query parameter "q" is required (min 2 chars)');
  }
  if (query.length > 120) {
    throw new Error('Query parameter "q" is too long (max 120 chars)');
  }
  return query;
}

function parseOptionalTimestamp(value, fieldName) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const parsed = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`"${fieldName}" must be a unix timestamp in ms or an ISO date string`);
  }
  return parsed;
}

async function proxyRequest(apiPath, params, res) {
  if (!hasLocationIQKey) {
    return res.status(503).json({ error: 'LocationIQ proxy is not configured' });
  }

  params.set('key', API_KEY);
  params.set('format', 'json');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(`${BASE_URL}/${apiPath}?${params}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'BarrieTransitProxy/1.0' },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const raw = await response.text();
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (_error) {
        data = null;
      }
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error || `LocationIQ returned ${response.status}`,
      });
    }

    if (data == null) {
      return res.status(502).json({ error: 'Invalid upstream response' });
    }

    res.json(data);
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Upstream request timed out' });
    }
    console.error(`Proxy error [${apiPath}]:`, error.message);
    res.status(502).json({ error: 'Upstream service unavailable' });
  }
}

// ─── Routes ───────────────────────────────────────────────────────

// Address autocomplete
app.get('/api/autocomplete', (req, res) => {
  let query;
  try {
    query = normalizeQuery(req.query.q);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const params = new URLSearchParams({
    q: query,
    addressdetails: '1',
    limit: '5',
    countrycodes: 'ca',
    viewbox: BARRIE_BOUNDS,
    bounded: '1',
  });

  proxyRequest('autocomplete', params, res);
});

// Forward geocode
app.get('/api/geocode', (req, res) => {
  let query;
  try {
    query = normalizeQuery(req.query.q);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const params = new URLSearchParams({
    q: query,
    addressdetails: '1',
    limit: '1',
    countrycodes: 'ca',
    viewbox: BARRIE_BOUNDS,
    bounded: '1',
  });

  proxyRequest('search', params, res);
});

// Reverse geocode
app.get('/api/reverse-geocode', (req, res) => {
  if (req.query.lat == null || req.query.lon == null) {
    return res.status(400).json({ error: 'Parameters "lat" and "lon" are required' });
  }
  let lat;
  let lon;
  try {
    lat = parseLatLon(req.query.lat, 'lat');
    lon = parseLatLon(req.query.lon, 'lon');
    validateLatitude(lat, 'lat');
    validateLongitude(lon, 'lon');
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    addressdetails: '1',
  });

  proxyRequest('reverse', params, res);
});

// Walking directions
app.get('/api/walking-directions', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'Parameters "from" and "to" are required (format: lat,lon)' });
  }
  let fromCoord;
  let toCoord;
  try {
    fromCoord = parseCoordinatePair(from, 'from');
    toCoord = parseCoordinatePair(to, 'to');
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  // LocationIQ Directions uses lon,lat order
  const params = new URLSearchParams({
    coordinates: `${fromCoord.lon},${fromCoord.lat};${toCoord.lon},${toCoord.lat}`,
    steps: 'true',
    overview: 'full',
    geometries: 'polyline',
  });

  // Directions API uses a different base URL pattern
  proxyRequest('directions/walking', params, res);
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ─── Detour Worker ───────────────────────────────────────────

let detourWorker = null;
if (process.env.DETOUR_WORKER_ENABLED === 'true') {
  detourWorker = require('./detourWorker');
}

// Detour detection status (includes geometry summary when available)
app.get('/api/detour-status', (_req, res) => {
  if (!detourWorker) {
    return res.json({ enabled: false });
  }
  const status = detourWorker.getStatus();
  // Attach geometry evidence summary per active route
  try {
    const { getDetourEvidence } = require('./detourDetector');
    status.evidenceSummary = getDetourEvidence();
  } catch (_err) {
    status.evidenceSummary = {};
  }
  res.json({ enabled: true, ...status });
});

// Detour debug endpoint: raw evidence points for ops diagnostics
app.get('/api/detour-debug', (req, res) => {
  if (!detourWorker) {
    return res.json({ enabled: false });
  }

  const routeId = req.query.routeId ? String(req.query.routeId).trim() : null;

  try {
    const { getRawDetourEvidence, getDetourEvidence } = require('./detourDetector');

    // If a specific routeId is requested, return raw evidence (bounded payload)
    if (routeId) {
      const rawEvidence = getRawDetourEvidence();
      const routeData = rawEvidence[routeId] || null;
      if (!routeData) {
        return res.json({ routeId, evidence: null, message: 'No evidence for this route' });
      }
      // Bound the raw points to prevent oversized responses
      const MAX_DEBUG_POINTS = 200;
      if (routeData.points && routeData.points.length > MAX_DEBUG_POINTS) {
        routeData.points = routeData.points.slice(-MAX_DEBUG_POINTS);
        routeData.truncated = true;
      }
      return res.json({ routeId, evidence: routeData });
    }

    // No routeId: return summary only (safe for production)
    const summary = getDetourEvidence();
    return res.json({ routes: summary, count: Object.keys(summary).length });
  } catch (err) {
    console.error('[detour-debug] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve debug data' });
  }
});

// Detour history logs
app.get('/api/detour-logs', async (req, res) => {
  let limit = 50;
  let routeId = '';
  let eventTypes = [];
  let startMs = null;
  let endMs = null;

  try {
    if (req.query.limit != null) {
      const parsedLimit = Number.parseInt(String(req.query.limit), 10);
      if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > HISTORY_MAX_LIMIT) {
        return res.status(400).json({
          error: `Query parameter "limit" must be between 1 and ${HISTORY_MAX_LIMIT}`,
        });
      }
      limit = parsedLimit;
    }

    routeId = req.query.routeId ? String(req.query.routeId).trim() : '';

    if (req.query.eventType != null) {
      eventTypes = String(req.query.eventType)
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
    }

    startMs = parseOptionalTimestamp(req.query.start, 'start');
    endMs = parseOptionalTimestamp(req.query.end, 'end');

    if (startMs != null && endMs != null && startMs > endMs) {
      return res.status(400).json({ error: '"start" must be less than or equal to "end"' });
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const logs = await getDetourHistory({
      limit,
      routeId,
      eventTypes,
      startMs,
      endMs,
    });

    return res.json({
      logs,
      count: logs.length,
      limit,
      filters: {
        routeId: routeId || null,
        eventTypes: eventTypes.length > 0 ? eventTypes : null,
        start: startMs,
        end: endMs,
      },
    });
  } catch (error) {
    console.error('[detour-logs] Failed to query history:', error.message);
    return res.status(500).json({ error: 'Failed to load detour logs' });
  }
});

// Detour rollout health: metrics for monitoring deployment readiness
app.get('/api/detour-rollout-health', async (req, res) => {
  if (!detourWorker) {
    return res.json({ enabled: false, message: 'Detour worker is not enabled' });
  }

  const status = detourWorker.getStatus();
  const ROLLOUT_WINDOW_MS = 24 * 60 * 60 * 1000; // Last 24 hours
  const now = Date.now();

  // Publish failure rate
  const tickCount = status.tickCount || 0;
  const publishFailures = status.errors?.publishFailures || 0;
  const publishFailureRate = tickCount > 0
    ? { rate: publishFailures / tickCount, publishFailures, tickCount }
    : { rate: null, publishFailures, tickCount, note: 'No ticks yet' };

  // Query recent DETOUR_CLEARED events for flapping and duration analysis
  let flapping = { flappingRoutes: [], flappingCount: 0, windowMs: ROLLOUT_WINDOW_MS };
  let durationStats = { min: null, avg: null, max: null, count: 0 };

  try {
    const clearedEvents = await getDetourHistory({
      eventTypes: ['DETOUR_CLEARED'],
      startMs: now - ROLLOUT_WINDOW_MS,
      limit: 200,
    });

    // Flapping: routes with multiple cleared events in the window
    const routeClearCounts = {};
    for (const event of clearedEvents) {
      const rid = event.routeId;
      if (rid) routeClearCounts[rid] = (routeClearCounts[rid] || 0) + 1;
    }
    const flappingRoutes = Object.entries(routeClearCounts)
      .filter(([, count]) => count >= 2)
      .map(([routeId, count]) => ({ routeId, clearCount: count }))
      .sort((a, b) => b.clearCount - a.clearCount);
    flapping = { flappingRoutes, flappingCount: flappingRoutes.length, windowMs: ROLLOUT_WINDOW_MS };

    // Duration stats from DETOUR_CLEARED events
    const durations = clearedEvents
      .map((e) => e.durationMs)
      .filter((d) => d != null && Number.isFinite(d) && d > 0);

    if (durations.length > 0) {
      const sum = durations.reduce((a, b) => a + b, 0);
      durationStats = {
        min: Math.min(...durations),
        avg: Math.round(sum / durations.length),
        max: Math.max(...durations),
        count: durations.length,
      };
    }
  } catch (err) {
    console.error('[detour-rollout-health] Failed to query history:', err.message);
  }

  res.json({
    enabled: true,
    running: status.running,
    tickCount: status.tickCount,
    lastSuccessfulTick: status.lastSuccessfulTick,
    consecutiveFailureCount: status.consecutiveFailureCount,
    activeDetourCount: Object.keys(status.activeDetours || {}).length,
    publishFailureRate,
    flapping,
    durationStats,
    featureFlags: {
      geometryUiEnabled: process.env.EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI === 'true',
      workerEnabled: process.env.DETOUR_WORKER_ENABLED === 'true',
    },
  });
});

// ─── Baseline Shape Management ────────────────────────────────

const {
  getBaselineData,
  setBaseline,
  clearBaseline,
  getBaselineStatus,
  logShapeDivergence: baselineLogDivergence,
} = require('./baselineManager');

app.get('/api/baseline-status', async (_req, res) => {
  try {
    const status = getBaselineStatus();

    // If baseline is loaded, show divergence summary from live GTFS
    let divergence = null;
    if (status.loaded) {
      try {
        const { getStaticData } = require('./gtfsLoader');
        const liveData = await getStaticData();
        const baselineMapping = (await getBaselineData(liveData)).routeShapeMapping;
        const liveMapping = liveData.routeShapeMapping;

        const added = [];
        const removed = [];
        for (const [routeId, liveShapeIds] of liveMapping) {
          const baseIds = baselineMapping.get(routeId);
          if (!baseIds) {
            added.push({ routeId, shapeCount: liveShapeIds.length });
            continue;
          }
          const baseSet = new Set(baseIds);
          const liveSet = new Set(liveShapeIds);
          const addedShapes = liveShapeIds.filter((id) => !baseSet.has(id));
          const removedShapes = baseIds.filter((id) => !liveSet.has(id));
          if (addedShapes.length > 0) added.push({ routeId, shapes: addedShapes });
          if (removedShapes.length > 0) removed.push({ routeId, shapes: removedShapes });
        }
        for (const routeId of baselineMapping.keys()) {
          if (!liveMapping.has(routeId)) removed.push({ routeId, note: 'route removed from live' });
        }

        divergence = {
          hasChanges: added.length > 0 || removed.length > 0,
          added,
          removed,
        };
      } catch (_err) {
        divergence = { error: 'Could not load live GTFS for comparison' };
      }
    }

    res.json({ ...status, divergence });
  } catch (err) {
    console.error('[baseline-status] Failed:', err.message);
    res.status(500).json({ error: 'Failed to retrieve baseline status' });
  }
});

app.post('/api/baseline/set', async (_req, res) => {
  try {
    const { getStaticData, forceRefresh } = require('./gtfsLoader');
    await forceRefresh();
    const liveData = await getStaticData();
    await setBaseline(liveData);
    const status = getBaselineStatus();
    res.json({ ok: true, message: 'Baseline set from current GTFS', ...status });
  } catch (err) {
    console.error('[baseline/set] Failed:', err.message);
    res.status(500).json({ error: 'Failed to set baseline', details: err.message });
  }
});

app.post('/api/baseline/clear', async (_req, res) => {
  try {
    await clearBaseline();
    res.json({ ok: true, message: 'Baseline cleared. Will auto-reinit from live GTFS on next tick.' });
  } catch (err) {
    console.error('[baseline/clear] Failed:', err.message);
    res.status(500).json({ error: 'Failed to clear baseline', details: err.message });
  }
});

// ─── News Worker ─────────────────────────────────────────────

let newsWorker = null;
if (process.env.NEWS_WORKER_ENABLED === 'true') {
  newsWorker = require('./newsWorker');
}

app.get('/api/news-status', (_req, res) => {
  if (!newsWorker) {
    return res.json({ enabled: false });
  }
  res.json({ enabled: true, ...newsWorker.getStatus() });
});

let server = null;

function startServer() {
  if (server) return server;
  server = app.listen(PORT, () => {
    console.log(`API proxy running on port ${PORT}`);
    if (detourWorker) {
      detourWorker.start();
    }
    if (newsWorker) {
      newsWorker.start();
    }
  });
  return server;
}

if (require.main === module) {
  startServer();
  process.on('SIGTERM', () => {
    console.log('SIGTERM received — shutting down');
    if (detourWorker) detourWorker.stop();
    if (newsWorker) newsWorker.stop();
    if (server) server.close();
    process.exit(0);
  });
}

module.exports = app;

try {
  const { onRequest } = require('firebase-functions/v2/https');

  // Start background workers in Cloud Functions mode (require.main !== module)
  if (detourWorker) detourWorker.start();
  if (newsWorker) newsWorker.start();

  module.exports.apiProxy = onRequest(
    {
      region: 'us-central1',
      invoker: 'public',
      secrets: ['LOCATIONIQ_API_KEY'],
      timeoutSeconds: 60,
      memory: '512MiB',
      minInstances: 1,
    },
    app
  );
} catch (_error) {
  // firebase-functions is optional for local and test execution.
}
