'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { APP_NAME, APP_SLUG, APP_VERSION, AGENCY } = require('./config');
const {
  WIDGET_URI,
  WIDGET_MIME_TYPE,
  WIDGET_RESOURCE_META,
  WIDGET_TOOL_META,
} = require('./widget');

// openWorldHint: these tools read public, third-party transit data.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true };

function formatMinutes(minutes) {
  return minutes <= 0 ? 'due now' : `in ${minutes} min`;
}

function summarizeStatus(status) {
  const lines = [];
  if (status.stop) {
    lines.push(`Stop: ${status.stop.name} (stop ${status.stop.stopCodes.join('/')})`);
    for (const a of status.arrivals) {
      const where = a.vehicle?.nextStop ? `, bus is near ${a.vehicle.nextStop.name}` : '';
      const source = a.realtime ? 'live' : 'scheduled';
      lines.push(`- Route ${a.routeId} ${a.headsign || ''}: ${formatMinutes(a.minutes)} (${a.arrivalTime}, ${source}${where})`);
    }
  }
  if (status.routes.length > 0 && !status.stop) {
    lines.push(`Route ${status.routes.map((r) => r.name).join(', ')}: ${status.vehicles.length} vehicle(s) reporting`);
    for (const v of status.vehicles) {
      const next = v.nextStop ? ` next stop ${v.nextStop.name} ${formatMinutes(v.nextStop.minutes)}` : '';
      lines.push(`- Route ${v.routeId} ${v.headsign || ''}:${next} (position ${v.lastUpdateSecondsAgo}s old)`);
    }
  }
  if (status.stopCandidates?.length) {
    lines.push('Possible stops:');
    for (const s of status.stopCandidates) lines.push(`- ${s.name} (stop ${s.stopCode}; routes ${s.routes.join(', ')})`);
  }
  lines.push(...status.notes);
  return lines.join('\n');
}

function toolResult(text, structuredContent, meta) {
  return { content: [{ type: 'text', text }], structuredContent, ...(meta ? { _meta: meta } : {}) };
}

function createMcpServer({ transitData, widgetHtml }) {
  const server = new McpServer({ name: APP_SLUG, version: APP_VERSION });

  server.registerResource('transit-map', WIDGET_URI, {
    title: `${APP_NAME} map`,
    description: 'Live vehicle map with arrival times',
    mimeType: WIDGET_MIME_TYPE,
    _meta: WIDGET_RESOURCE_META,
  }, async () => ({
    contents: [{ uri: WIDGET_URI, mimeType: WIDGET_MIME_TYPE, text: widgetHtml, _meta: WIDGET_RESOURCE_META }],
  }));

  server.registerTool('get_transit_status', {
    title: 'Get live transit status',
    description:
      `Live vehicle locations and real-time arrival estimates (in minutes) for ${AGENCY.name}. ` +
      'Use when the rider asks where their bus is or when it will arrive. ' +
      'Pass a stop (name or stop number) for next arrivals there, a route for where its vehicles are, or both. ' +
      'Arrivals marked live come from real-time predictions; scheduled ones come from the timetable. ' +
      'The result renders as a live map the rider can see, so summarize briefly instead of repeating every row. ' +
      'If the result lists stopCandidates, ask the rider which stop they mean.',
    inputSchema: {
      route: z.string().optional().describe('Route number or name, e.g. "8", "8A", "Red", "Georgian Mall"'),
      stop: z.string().optional().describe('Stop number from the stop sign, or a stop/intersection name'),
      direction: z.string().optional().describe('Destination to filter by, e.g. "Park Place" or "Georgian College"'),
    },
    annotations: READ_ONLY,
    _meta: WIDGET_TOOL_META,
  }, async ({ route, stop, direction }) => {
    if (!route && !stop) {
      return toolResult('Ask the rider for a route or a stop.', { notes: ['route or stop is required'] });
    }
    // Route geometry is for the map only; keep it out of the model-visible payload.
    const { map, ...status } = await transitData.getStatus({ route, stop, direction });
    return toolResult(summarizeStatus(status), status, map ? { map } : undefined);
  });

  server.registerTool('find_stops', {
    title: 'Find transit stops',
    description:
      `Find ${AGENCY.name} stops by name, intersection, landmark, or stop number. ` +
      'Returns stop numbers and the routes serving each stop.',
    inputSchema: {
      query: z.string().describe('Stop name, intersection, landmark, or stop number'),
      route: z.string().optional().describe('Only return stops served by this route'),
    },
    annotations: READ_ONLY,
  }, async ({ query, route }) => {
    const stops = await transitData.findStops({ query, route });
    const text = stops.length === 0
      ? 'No matching stops found.'
      : stops.map((s) => `- ${s.name} (stop ${s.stopCode}; routes ${s.routes.join(', ')})`).join('\n');
    return toolResult(text, { stops });
  });

  server.registerTool('list_routes', {
    title: 'List transit routes',
    description: `List all ${AGENCY.name} routes with their names and destinations.`,
    inputSchema: {},
    annotations: READ_ONLY,
  }, async () => {
    const routes = await transitData.listRoutes();
    const text = routes.map((r) => `- ${r.name}${r.longName ? ` ${r.longName}` : ''}: ${r.headsigns.join(' / ')}`).join('\n');
    return toolResult(text, { routes });
  });

  return server;
}

module.exports = { createMcpServer, summarizeStatus };
