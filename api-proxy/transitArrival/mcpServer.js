'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { APP_NAME, APP_SLUG, APP_VERSION } = require('./config');
const {
  WIDGET_URI,
  LEGACY_WIDGET_URIS,
  WIDGET_MIME_TYPE,
  WIDGET_RESOURCE_META,
  WIDGET_TOOL_META,
} = require('./widget');

// openWorldHint: these tools read public, third-party transit data.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true };

function formatMinutes(minutes) {
  return minutes <= 0 ? 'due now' : `in ${minutes} min`;
}

const routeLabel = (item) => item.routeName || item.routeId;
const stopLine = (s) => `- ${s.name} (${s.agencyName ? `${s.agencyName}, ` : ''}stop ${s.stopCode}; routes ${s.routes.join(', ')})`;

function summarizeStatus(status) {
  const lines = [];
  if (status.agency) lines.push(`Agency: ${status.agency.name}`);
  if (status.agencies) lines.push(`Agencies: ${status.agencies.map((a) => a.name).join(', ')}`);
  if (status.stop) {
    lines.push(`Stop: ${status.stop.name} (stop ${status.stop.stopCodes.join('/')})`);
    for (const a of status.arrivals) {
      const where = a.vehicle?.nextStop ? `, vehicle is near ${a.vehicle.nextStop.name}` : '';
      const source = a.realtime ? 'live' : 'scheduled';
      const by = a.agencyName ? ` (${a.agencyName})` : '';
      lines.push(`- Route ${routeLabel(a)}${by} ${a.headsign || ''}: ${formatMinutes(a.minutes)} (${a.arrivalTime}, ${source}${where})`);
    }
  }
  if (status.routes.length > 0 && !status.stop) {
    lines.push(`Route ${status.routes.map((r) => r.name).join(', ')}: ${status.vehicles.length} vehicle(s) reporting`);
    for (const v of status.vehicles) {
      const next = v.nextStop ? ` next stop ${v.nextStop.name} ${formatMinutes(v.nextStop.minutes)}` : '';
      lines.push(`- Route ${routeLabel(v)} ${v.headsign || ''}:${next} (position ${v.lastUpdateSecondsAgo}s old)`);
    }
  }
  if (status.stopCandidates?.length) {
    lines.push('Possible stops:');
    for (const s of status.stopCandidates) lines.push(stopLine(s));
  }
  lines.push(...status.notes);
  return lines.join('\n');
}

function toolResult(text, structuredContent, meta) {
  return { content: [{ type: 'text', text }], structuredContent, ...(meta ? { _meta: meta } : {}) };
}

function createMcpServer({ network, widgetHtml }) {
  const server = new McpServer({ name: APP_SLUG, version: APP_VERSION });
  const coverage = network.agencies.map((a) => `${a.name} (id "${a.id}", ${a.region})`).join('; ');
  const agencyParam = z.string().optional().describe(
    `Transit agency id, name, or city. Covered: ${coverage}. ` +
    'Pass it whenever the rider has said or implied their city; omit it only if unknown.'
  );
  const examples = network.agencies.map((a) => a.examples).filter(Boolean);
  const exampleList = (key) => examples.map((e) => `"${e[key]}"`).join(', ');

  [WIDGET_URI, ...LEGACY_WIDGET_URIS].forEach((uri, i) => {
    server.registerResource(i === 0 ? 'transit-map' : `transit-map-legacy-${i}`, uri, {
      title: `${APP_NAME} map`,
      description: 'Live vehicle map with arrival times',
      mimeType: WIDGET_MIME_TYPE,
      _meta: WIDGET_RESOURCE_META,
    }, async () => ({
      contents: [{ uri, mimeType: WIDGET_MIME_TYPE, text: widgetHtml, _meta: WIDGET_RESOURCE_META }],
    }));
  });

  server.registerTool('get_transit_status', {
    title: 'Get live transit status',
    description:
      'Real-time public transit: live vehicle locations and arrival estimates in minutes for buses, streetcars, subways and trains. ' +
      `Covered agencies: ${coverage}. ` +
      'Use this whenever the rider asks things like "where\'s my bus?", "when\'s the next bus/train/streetcar?", ' +
      '"is my bus late?", "how long until the 504 comes?" or "next departures from Union Station". ' +
      'If they ask "where\'s my bus?" without a stop or route, call it anyway and then ask which stop or route. ' +
      'Pass a stop (name or stop number) for next arrivals there, a route for where its vehicles are, or both. ' +
      'Arrivals marked live come from real-time predictions; scheduled ones come from the timetable. ' +
      'The result renders as a live map the rider can see, so summarize briefly instead of repeating every row. ' +
      'If the result lists stopCandidates or agencyCandidates, ask the rider which one they mean. ' +
      'Do not use for cities or agencies not listed here.',
    inputSchema: {
      route: z.string().optional().describe(`Route number or name, e.g. ${exampleList('route')}`),
      stop: z.string().optional().describe('Stop number from the stop sign, or a stop/intersection/landmark name'),
      direction: z.string().optional().describe(`Destination to filter by, e.g. ${exampleList('direction')}`),
      agency: agencyParam,
    },
    annotations: READ_ONLY,
    _meta: WIDGET_TOOL_META,
  }, async ({ route, stop, direction, agency }) => {
    if (!route && !stop) {
      return toolResult('Ask the rider for a route or a stop.', { notes: ['route or stop is required'] });
    }
    // Route geometry is for the map only; keep it out of the model-visible payload.
    const { map, ...status } = await network.getStatus({ route, stop, direction, agency });
    return toolResult(summarizeStatus(status), status, map ? { map } : undefined);
  });

  server.registerTool('find_stops', {
    title: 'Find transit stops',
    description:
      'Find stops by name, intersection, landmark, or stop number. ' +
      'Returns stop numbers, their agency, and the routes serving each stop.',
    inputSchema: {
      query: z.string().describe('Stop name, intersection, landmark, or stop number'),
      route: z.string().optional().describe('Only return stops served by this route'),
      agency: agencyParam,
    },
    annotations: READ_ONLY,
  }, async ({ query, route, agency }) => {
    const { stops, notes } = await network.findStops({ query, route, agency });
    const text = stops.length === 0 ? ['No matching stops found.', ...notes].join('\n') : stops.map(stopLine).join('\n');
    return toolResult(text, { stops, notes });
  });

  server.registerTool('list_routes', {
    title: 'List transit routes',
    description: 'List a transit agency\'s routes with their names and destinations. Without an agency, lists the covered agencies.',
    inputSchema: { agency: agencyParam },
    annotations: READ_ONLY,
  }, async ({ agency }) => {
    const result = await network.listRoutes({ agency });
    const text = result.routes.length === 0
      ? result.notes.join('\n')
      : [`Agency: ${result.agency.name}`,
        ...result.routes.map((r) => `- ${r.name}${r.longName ? ` ${r.longName}` : ''}: ${r.headsigns.join(' / ')}`)].join('\n');
    return toolResult(text, result);
  });

  return server;
}

module.exports = { createMcpServer, summarizeStatus };
