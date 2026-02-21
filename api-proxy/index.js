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
 *
 * Environment variables:
 *   LOCATIONIQ_API_KEY      — Required. Your LocationIQ API key.
 *   PORT                    — Optional. Defaults to 3001.
 *   ALLOWED_ORIGINS         — Optional. Comma-separated list of allowed CORS origins.
 *   API_PROXY_TOKEN         — Optional. Shared token for clients via x-api-token header.
 *   API_PROXY_TOKENS        — Optional. Comma-separated shared tokens (takes precedence over API_PROXY_TOKEN).
 *   REQUIRE_API_AUTH        — Optional. Defaults to true in production, false otherwise.
 *   REQUIRE_FIREBASE_AUTH   — Optional. Set to "true" to require Firebase ID token auth (Authorization: Bearer <token>).
 *   DETOUR_WORKER_ENABLED   — Optional. Set to "true" to enable server-side detour detection.
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Required for detour worker. JSON string of Firebase credentials.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { getAuth } = require('./firebaseAdmin');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.LOCATIONIQ_API_KEY;
const BASE_URL = 'https://us1.locationiq.com/v1';
const hasLocationIQKey = Boolean(API_KEY);
const isProd = process.env.NODE_ENV === 'production';
const REQUIRE_API_AUTH = process.env.REQUIRE_API_AUTH
  ? process.env.REQUIRE_API_AUTH === 'true'
  : isProd;
const REQUIRE_FIREBASE_AUTH = process.env.REQUIRE_FIREBASE_AUTH === 'true';
const API_TOKENS = new Set(
  (process.env.API_PROXY_TOKENS || process.env.API_PROXY_TOKEN || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
);

// Barrie bounding box
const BARRIE_BOUNDS = '-79.85,44.25,-79.55,44.50';

if (!hasLocationIQKey) {
  console.warn('LOCATIONIQ_API_KEY is missing. LocationIQ proxy endpoints will return 503.');
}
if (REQUIRE_API_AUTH && API_TOKENS.size === 0 && !REQUIRE_FIREBASE_AUTH) {
  throw new Error(
    'API auth is required but no auth method is configured. ' +
      'Set API_PROXY_TOKEN/API_PROXY_TOKENS or enable REQUIRE_FIREBASE_AUTH.'
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
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:19006')
  .split(',')
  .map((s) => s.trim());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, X-Client-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function sanitizeClientKey(raw) {
  if (!raw) return '';
  return String(raw).trim().slice(0, 64).replace(/[^a-zA-Z0-9_.:-]/g, '');
}

async function authenticateApiRequest(req, res, next) {
  if (req.path === '/health') return next();
  if (!REQUIRE_API_AUTH) return next();

  const headerToken = req.get('x-api-token');
  if (headerToken && API_TOKENS.has(headerToken.trim())) {
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
    details: 'Provide x-api-token or a valid Firebase Bearer token',
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
    const token = sanitizeClientKey(req.get('x-api-token'));
    const appClient = sanitizeClientKey(req.get('x-client-id'));
    const auth = sanitizeClientKey(req.clientId);
    return auth || appClient || token || req.ip;
  },
});
app.use('/api/', limiter);

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

async function proxyRequest(apiPath, params, res) {
  if (!hasLocationIQKey) {
    return res.status(503).json({ error: 'LocationIQ proxy is not configured' });
  }

  params.set('key', API_KEY);
  params.set('format', 'json');

  try {
    const response = await fetch(`${BASE_URL}/${apiPath}?${params}`);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error || `LocationIQ returned ${response.status}`,
      });
    }

    res.json(data);
  } catch (error) {
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

// Detour detection status
app.get('/api/detour-status', (_req, res) => {
  if (!detourWorker) {
    return res.json({ enabled: false });
  }
  res.json({ enabled: true, ...detourWorker.getStatus() });
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
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down');
  if (detourWorker) detourWorker.stop();
  if (newsWorker) newsWorker.stop();
  if (server) server.close();
  process.exit(0);
});

module.exports = app;
