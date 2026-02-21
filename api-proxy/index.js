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
 *   DETOUR_WORKER_ENABLED   — Optional. Set to "true" to enable server-side detour detection.
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Required for detour worker. JSON string of Firebase credentials.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.LOCATIONIQ_API_KEY;
const BASE_URL = 'https://us1.locationiq.com/v1';
const hasLocationIQKey = Boolean(API_KEY);

// Barrie bounding box
const BARRIE_BOUNDS = '-79.85,44.25,-79.55,44.50';

if (!hasLocationIQKey) {
  console.warn('LOCATIONIQ_API_KEY is missing. LocationIQ proxy endpoints will return 503.');
}

// ─── Middleware ────────────────────────────────────────────────────

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Rate limiting: 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// ─── Helper ───────────────────────────────────────────────────────

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
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query parameter "q" is required (min 2 chars)' });
  }

  const params = new URLSearchParams({
    q,
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
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  const params = new URLSearchParams({
    q,
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
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Parameters "lat" and "lon" are required' });
  }

  const params = new URLSearchParams({
    lat,
    lon,
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

  // LocationIQ Directions uses lon,lat order
  const [fromLat, fromLon] = from.split(',');
  const [toLat, toLon] = to.split(',');

  const params = new URLSearchParams({
    coordinates: `${fromLon},${fromLat};${toLon},${toLat}`,
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

app.listen(PORT, () => {
  console.log(`API proxy running on port ${PORT}`);
  if (detourWorker) {
    detourWorker.start();
  }
  if (newsWorker) {
    newsWorker.start();
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down');
  if (detourWorker) detourWorker.stop();
  if (newsWorker) newsWorker.stop();
  process.exit(0);
});

module.exports = app;
