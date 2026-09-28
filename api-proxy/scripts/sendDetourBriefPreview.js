'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDb } = require('../firebaseAdmin');
const { collectMapGeometry, renderDetourBriefMap } = require('../services/detourBriefMap');
const { buildBriefMessage } = require('../services/detourManagementBrief');
const { sendViaResend } = require('../services/detourEmailMonitor');

function previewMessage(event, map) {
  const message = buildBriefMessage({
    ...event,
    sharedRouteIds: [event.routeId],
  }, map);
  const location = event.eventLocationLabel || 'Blake Street';
  message.subject = `[TEST PREVIEW] Route ${event.routeId} | ${location} detour map`;
  message.text = [
    'TEST PREVIEW — stored detour geometry. This is not a live service notice.',
    '',
    `Route ${event.routeId} | ${location}`,
    'The attached map shows the likely active routing, out-of-service section,',
    'start and end points, and skipped stop from the selected event record.',
    '',
    'Current service status is not being asserted in this preview.',
    'Map data © OpenStreetMap contributors © CARTO.',
  ].join('\n');
  message.html = message.html
    .replace('Confirmed route', 'TEST PREVIEW | Route')
    .replace('Confirmed detour</div>', 'Map preview</div>')
    .replace(/<div style="font-size:13px;line-height:1\.45;color:#4f5d6b;margin-top:6px">[^<]*<br>Active until normal service is confirmed\.<\/div>/,
      '<div style="font-size:13px;line-height:1.45;color:#4f5d6b;margin-top:6px">Stored event geometry.<br>Current service status is not being asserted.</div>')
    .replace('Automated operations notice.', 'TEST PREVIEW from a stored event record. No live service change is being reported.')
    .replace('<tr><td style="padding:18px 20px 8px">',
      '<tr><td style="padding:12px 20px;background:#fff3cd;color:#5f4500;font-size:14px;font-weight:bold">TEST PREVIEW — Map and routing from a stored event record. This is not a live service notice.</td></tr><tr><td style="padding:18px 20px 8px">');
  if (!message.html.includes('TEST PREVIEW — Map and routing') ||
      /Confirmed detour|Confirmed route|Active until normal service is confirmed/.test(message.html)) {
    throw new Error('Preview email still contains live-alert wording');
  }
  return message;
}

async function main() {
  const eventId = process.env.DETOUR_PREVIEW_EVENT_ID;
  if (!eventId || !process.env.CARTO_BASEMAP_API_KEY) throw new Error('Preview event ID and CARTO key are required');
  const db = getDb();
  if (!db) throw new Error('Firestore is unavailable');
  const snapshot = await db.collection('activeDetourEventsV2').doc(eventId).get();
  if (!snapshot.exists) throw new Error(`Detour event not found: ${eventId}`);
  const event = { ...snapshot.data(), eventId: snapshot.id, detourEventId: snapshot.id };
  if (event.state !== 'active' || !event.routeId) throw new Error('Preview event is not active with a route ID');
  const geometry = collectMapGeometry([event]);
  if (geometry.pathPending || !geometry.closures.length || !geometry.endpoints.length || !geometry.skippedStops.length) {
    throw new Error('Preview map is incomplete: requires active routing, out-of-service section, boundaries, and a skipped stop');
  }
  const map = await renderDetourBriefMap([event], { cartoKey: process.env.CARTO_BASEMAP_API_KEY });
  const message = previewMessage(event, map);
  const output = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'detour-brief-preview.jpg');
  fs.writeFileSync(output, map.buffer);
  console.log(JSON.stringify({ stage: 'rendered', routeId: event.routeId,
    diversionPoints: geometry.diversions[0].length, closurePoints: geometry.closures[0].length,
    skippedStops: geometry.skippedStops.length, mapBytes: map.buffer.length,
    baselineDiverged: event.baselineDiverged === true, output }));
  if (process.env.DETOUR_PREVIEW_SEND !== 'true') return;
  const recipient = String(process.env.DETOUR_ALERT_RECIPIENT || '').trim();
  if (!recipient || recipient.includes(',') || recipient.includes(';')) {
    throw new Error('Exactly one preview recipient is required');
  }
  if (!process.env.RESEND_API_KEY || !process.env.DETOUR_ALERT_FROM) {
    throw new Error('Resend key and verified sender are required');
  }
  const provider = await sendViaResend({
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.DETOUR_ALERT_FROM,
    recipients: [recipient],
    message,
    idempotencyKey: `detour-preview-${process.env.GITHUB_RUN_ID || Date.now()}`,
  });
  console.log(JSON.stringify({ stage: 'sent', providerMessageId: provider?.id || null }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
