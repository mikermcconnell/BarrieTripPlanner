'use strict';

// Rebuild the review image from the public Route 8B event using the same
// production renderer and Blake Street display correction as the email.
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('../api-proxy/node_modules/@napi-rs/canvas');
const { renderDetourBriefMap } = require('../api-proxy/services/detourBriefMap');

const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'detour-management-blake-map.jpg');

function firebaseValue(value) {
  if ('mapValue' in value) return Object.fromEntries(
    Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, firebaseValue(child)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(firebaseValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  return null;
}

function publicFirebaseKey() {
  const env = fs.readFileSync(path.join(root, '.env.production'), 'utf8');
  const match = env.match(/^EXPO_PUBLIC_FIREBASE_API_KEY=(.*)$/m);
  if (!match) throw new Error('Production Firebase key is unavailable');
  return match[1].trim();
}

async function osmTileResponse(cartoUrl) {
  const match = cartoUrl.match(/\/(\d+)\/(\d+)\/(\d+)@2x\.png/);
  if (!match) throw new Error('Unexpected map tile URL');
  const [, zoom, x, y] = match.map(Number);
  const tile = createCanvas(512, 512);
  const ctx = tile.getContext('2d');
  await Promise.all([0, 1].flatMap((dy) => [0, 1].map(async (dx) => {
    const url = `https://tile.openstreetmap.org/${zoom + 1}/${x * 2 + dx}/${y * 2 + dy}.png`;
    const response = await fetch(url, { headers: { 'User-Agent': 'BTTP-detour-email-preview/1.0' } });
    if (!response.ok) throw new Error(`OpenStreetMap tile request failed: ${response.status}`);
    const image = await loadImage(Buffer.from(await response.arrayBuffer()));
    ctx.drawImage(image, dx * 256, dy * 256, 256, 256);
  })));
  return new Response(tile.toBuffer('image/png'), { status: 200 });
}

async function main() {
  const url = new URL('https://firestore.googleapis.com/v1/projects/barrie-transit-trip-plan-cc84e/databases/(default)/documents/activeDetourEventsV2');
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('key', publicFirebaseKey());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Detour feed request failed: ${response.status}`);
  const data = await response.json();
  const events = (data.documents || []).map((document) => ({
    ...firebaseValue({ mapValue: { fields: document.fields || {} } }),
    eventId: document.name.split('/').at(-1),
  }));
  const source = events.find((event) => event.routeId === '8B' && event.eventLocationLabel === 'Blake Street'
    && event.state === 'active' && event.alertVisible === true);
  if (!source) throw new Error('Active Route 8B Blake Street event was not found');
  const map = await renderDetourBriefMap([source], {
    cartoKey: 'preview-uses-openstreetmap',
    routeColors: { '8B': '#000000' },
    fetchImpl: osmTileResponse,
  });
  if (map.geometry.closures.length !== 1 || map.geometry.diversions.length !== 1) {
    throw new Error('Expected one out-of-service path and one active path');
  }
  const canvas = createCanvas(960, 640);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(await loadImage(map.buffer), 0, 0);
  // The review image uses OSM tiles in place of the production CARTO basemap.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(659, 510, 301, 22);
  ctx.fillStyle = '#263347';
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('© OpenStreetMap contributors', 667, 526);
  fs.writeFileSync(output, canvas.toBuffer('image/jpeg', 82));
  console.log(`Updated ${output}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
