/**
 * Local Dev Server — CORS Proxy + LocationIQ API Proxy
 *
 * Combines two functions into one dev server:
 * 1. CORS proxy for GTFS feeds (existing)
 * 2. LocationIQ API proxy — hides API key server-side
 *
 * Usage: node proxy-server.js
 *
 * CORS proxy:    GET /proxy?url=<encoded-url>
 * API proxy:     GET /api/autocomplete?q=...
 *                GET /api/geocode?q=...
 *                GET /api/reverse-geocode?lat=...&lon=...
 *                GET /api/walking-directions?from=lat,lon&to=lat,lon
 * Health check:  GET /health
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = 3001;

// ─── Load .env file ──────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

// ─── LocationIQ Config ───────────────────────────────────────────
const LOCATIONIQ_KEY = process.env.LOCATIONIQ_API_KEY || process.env.EXPO_PUBLIC_LOCATIONIQ_API_KEY || '';
const LOCATIONIQ_BASE = 'https://us1.locationiq.com/v1';
const BARRIE_BOUNDS = '-79.85,44.25,-79.55,44.50';

if (!LOCATIONIQ_KEY) {
  console.warn('\nWARNING: No LocationIQ API key found. API proxy routes will not work.');
  console.warn('Set LOCATIONIQ_API_KEY or EXPO_PUBLIC_LOCATIONIQ_API_KEY in .env\n');
}

// ─── Helpers ─────────────────────────────────────────────────────

const setCORSHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
};

/**
 * Forward a request to LocationIQ and pipe the response back
 */
function proxyToLocationIQ(targetUrl, res) {
  const targetParsed = url.parse(targetUrl);

  const proxyReq = https.get(
    {
      hostname: targetParsed.hostname,
      path: targetParsed.path,
      headers: { 'User-Agent': 'BarrieTransitApp/1.0' },
    },
    (proxyRes) => {
      console.log(`[${new Date().toLocaleTimeString()}] LocationIQ ${proxyRes.statusCode}: ${targetParsed.path.split('?')[0]}`);

      res.writeHead(proxyRes.statusCode, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      });
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    console.error(`[${new Date().toLocaleTimeString()}] LocationIQ error:`, error.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'LocationIQ service unavailable' }));
  });

  proxyReq.setTimeout(15000, () => {
    proxyReq.destroy();
    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'LocationIQ request timeout' }));
  });
}

function sendError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

// ─── Server ──────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  setCORSHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  // ─── Health check ────────────────────────────────────────────
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // ─── LocationIQ API Proxy Routes ─────────────────────────────

  // Autocomplete
  if (parsedUrl.pathname === '/api/autocomplete') {
    const { q } = parsedUrl.query;
    if (!q || q.trim().length < 2) {
      return sendError(res, 400, 'Query parameter "q" is required (min 2 chars)');
    }
    const params = new URLSearchParams({
      key: LOCATIONIQ_KEY,
      q,
      format: 'json',
      addressdetails: '1',
      limit: '5',
      countrycodes: 'ca',
      viewbox: BARRIE_BOUNDS,
      bounded: '1',
    });
    proxyToLocationIQ(`${LOCATIONIQ_BASE}/autocomplete?${params}`, res);
    return;
  }

  // Forward geocode
  if (parsedUrl.pathname === '/api/geocode') {
    const { q } = parsedUrl.query;
    if (!q || q.trim().length < 2) {
      return sendError(res, 400, 'Query parameter "q" is required');
    }
    const params = new URLSearchParams({
      key: LOCATIONIQ_KEY,
      q,
      format: 'json',
      addressdetails: '1',
      limit: '1',
      countrycodes: 'ca',
      viewbox: BARRIE_BOUNDS,
      bounded: '1',
    });
    proxyToLocationIQ(`${LOCATIONIQ_BASE}/search?${params}`, res);
    return;
  }

  // Reverse geocode
  if (parsedUrl.pathname === '/api/reverse-geocode') {
    const { lat, lon } = parsedUrl.query;
    if (!lat || !lon) {
      return sendError(res, 400, 'Parameters "lat" and "lon" are required');
    }
    const params = new URLSearchParams({
      key: LOCATIONIQ_KEY,
      lat,
      lon,
      format: 'json',
      addressdetails: '1',
    });
    proxyToLocationIQ(`${LOCATIONIQ_BASE}/reverse?${params}`, res);
    return;
  }

  // Walking directions
  if (parsedUrl.pathname === '/api/walking-directions') {
    const { from, to } = parsedUrl.query;
    if (!from || !to) {
      return sendError(res, 400, 'Parameters "from" and "to" are required (format: lat,lon)');
    }
    // LocationIQ Directions uses lon,lat order
    const [fromLat, fromLon] = from.split(',');
    const [toLat, toLon] = to.split(',');
    const coords = `${fromLon},${fromLat};${toLon},${toLat}`;
    const params = new URLSearchParams({
      key: LOCATIONIQ_KEY,
      steps: 'true',
      overview: 'full',
      geometries: 'polyline',
    });
    proxyToLocationIQ(`${LOCATIONIQ_BASE}/directions/walking/${coords}?${params}`, res);
    return;
  }

  // ─── CORS Proxy (for GTFS feeds) ────────────────────────────
  if (parsedUrl.pathname === '/proxy') {
    const targetUrl = parsedUrl.query.url;

    if (!targetUrl) {
      return sendError(res, 400, 'Missing url parameter');
    }

    console.log(`[${new Date().toLocaleTimeString()}] Proxying: ${targetUrl}`);

    try {
      const targetParsed = url.parse(targetUrl);
      const protocol = targetParsed.protocol === 'https:' ? https : http;

      const proxyReq = protocol.request(
        {
          hostname: targetParsed.hostname,
          port: targetParsed.port || (targetParsed.protocol === 'https:' ? 443 : 80),
          path: targetParsed.path,
          method: req.method,
          headers: {
            'User-Agent': 'BarrieTransitApp/1.0',
            'Accept': '*/*',
          },
        },
        (proxyRes) => {
          console.log(`[${new Date().toLocaleTimeString()}] Response: ${proxyRes.statusCode} for ${targetUrl}`);

          const responseHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          };

          if (proxyRes.headers['content-type']) {
            responseHeaders['Content-Type'] = proxyRes.headers['content-type'];
          }
          if (proxyRes.headers['content-length']) {
            responseHeaders['Content-Length'] = proxyRes.headers['content-length'];
          }

          res.writeHead(proxyRes.statusCode, responseHeaders);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', (error) => {
        console.error(`[${new Date().toLocaleTimeString()}] Proxy error:`, error.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy request failed', details: error.message }));
      });

      proxyReq.setTimeout(30000, () => {
        console.error(`[${new Date().toLocaleTimeString()}] Request timeout for ${targetUrl}`);
        proxyReq.destroy();
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Gateway timeout' }));
      });

      proxyReq.end();
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Error:`, error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
    }
    return;
  }

  // Unknown endpoint
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use.`);
    console.error(`Either stop the other process or use a different port.\n`);
  } else {
    console.error('Server error:', error);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\nBarrie Transit Dev Server running at http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET /proxy?url=<encoded-url>              - CORS proxy (GTFS feeds)`);
  console.log(`  GET /api/autocomplete?q=...               - LocationIQ autocomplete`);
  console.log(`  GET /api/geocode?q=...                    - LocationIQ forward geocode`);
  console.log(`  GET /api/reverse-geocode?lat=...&lon=...  - LocationIQ reverse geocode`);
  console.log(`  GET /api/walking-directions?from=...&to=... - Walking directions`);
  console.log(`  GET /health                               - Health check`);
  console.log(`\nLocationIQ API key: ${LOCATIONIQ_KEY ? 'loaded' : 'MISSING'}`);
  console.log(`Press Ctrl+C to stop\n`);
});
