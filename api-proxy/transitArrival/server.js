'use strict';

const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpServer } = require('./mcpServer');
const { createTransitData } = require('./transitData');
const { buildWidgetHtml } = require('./widget');
const { pages } = require('./site/pages');
const { APP_NAME, APP_VERSION } = require('./config');

function createTransitArrivalApp({ transitData = createTransitData(), widgetHtml = buildWidgetHtml() } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));

  // Public, read-only data: allow browser-based MCP clients (e.g. MCP Inspector).
  app.use('/mcp', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version');
    res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    res.set('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
  // ChatGPT calls from shared OpenAI egress IPs and every open map refreshes, so this
  // is a generous abuse ceiling, not a per-user quota. Feeds are cached, so calls are cheap.
  app.use('/mcp', rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.TRANSIT_ARRIVAL_RATE_LIMIT_PER_MIN) || 1500,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }));

  // Local preview host that renders the widget the way ChatGPT does (opt-in).
  if (process.env.TRANSIT_ARRIVAL_DEV_HOST === 'true') {
    app.get('/dev', (req, res) => res.sendFile(path.join(__dirname, 'dev', 'host.html')));
  }

  app.get('/health', (req, res) => res.json({ ok: true, app: APP_NAME, version: APP_VERSION }));

  // Public website: product page, support, privacy policy, terms, logo.
  for (const [route, render] of Object.entries(pages)) {
    app.get(route, (req, res) => res.type('html').send(render()));
  }
  app.use(express.static(path.join(__dirname, 'site', 'public'), { index: false, maxAge: '1h' }));

  // Stateless Streamable HTTP: a fresh server + transport per request.
  app.post('/mcp', async (req, res) => {
    const server = createMcpServer({ transitData, widgetHtml });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[transitArrival] MCP request failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  const methodNotAllowed = (req, res) => res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  return { app, transitData };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8787;
  const { app, transitData } = createTransitArrivalApp();
  app.listen(port, () => {
    console.log(`[transitArrival] ${APP_NAME} MCP server listening on :${port}/mcp`);
    if (!process.env.TRANSIT_ARRIVAL_OPERATOR_NAME || !process.env.TRANSIT_ARRIVAL_SUPPORT_EMAIL) {
      console.warn('[transitArrival] TRANSIT_ARRIVAL_OPERATOR_NAME / TRANSIT_ARRIVAL_SUPPORT_EMAIL unset; public pages show placeholders.');
    }
    // Warm the GTFS cache so the first rider request isn't slow.
    transitData.listRoutes().catch((err) => console.error('[transitArrival] GTFS warm-up failed:', err.message));
  });
}

module.exports = { createTransitArrivalApp };
