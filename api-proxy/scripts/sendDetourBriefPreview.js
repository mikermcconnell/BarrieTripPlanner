'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDb } = require('../firebaseAdmin');
const { collectMapGeometry, renderDetourBriefMap } = require('../services/detourBriefMap');
const { buildBriefMessage } = require('../services/detourManagementBrief');
const { sendViaResend, enrichEventStopNames } = require('../services/detourEmailMonitor');
const { getStaticData } = require('../gtfsLoader');

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
  if (geometry.pathPending || !geometry.closures.length || !geometry.endpoints.length) {
    throw new Error('Preview map is incomplete: requires active routing, out-of-service section, and boundaries');
  }
  let gtfsData;
  try { gtfsData = await getStaticData(); } catch (error) { console.warn('Preview stop enrichment unavailable:', error.message); }
  const map = await renderDetourBriefMap([event], { cartoKey: process.env.CARTO_BASEMAP_API_KEY, routeColors: gtfsData?.routeColors });
  const message = buildBriefMessage(enrichEventStopNames(event, gtfsData), map, gtfsData?.routeColors, { preview: true });
  const output = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'detour-brief-preview.jpg');
  fs.writeFileSync(output, map.buffer);
  fs.writeFileSync(output.replace(/\.jpg$/, '.html'), message.html.replace('cid:detour-map', 'detour-brief-preview.jpg'));
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

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { main };
