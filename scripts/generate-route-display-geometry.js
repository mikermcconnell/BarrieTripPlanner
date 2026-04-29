const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const GTFS_URL = 'https://www.myridebarrie.ca/gtfs/Google_transit.zip';
const OSRM_MATCH_URL = process.env.ROUTE_DISPLAY_MATCH_URL || 'https://router.project-osrm.org/match/v1/driving';
const MAX_MATCH_POINTS = Number(process.env.ROUTE_DISPLAY_MAX_MATCH_POINTS || 95);
const MATCH_RADIUS_METERS = Number(process.env.ROUTE_DISPLAY_MATCH_RADIUS_METERS || 35);
const MIN_SAMPLE_SPACING_METERS = Number(process.env.ROUTE_DISPLAY_MIN_SAMPLE_SPACING_METERS || 160);
const MATCH_TIMEOUT_MS = Number(process.env.ROUTE_DISPLAY_MATCH_TIMEOUT_MS || 15000);
const OUTPUT_PATH = path.resolve(__dirname, '..', 'assets', 'route-display-geometry.json');
const OVERRIDES_PATH = path.resolve(__dirname, '..', 'assets', 'route-display-overrides.json');

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else current += char;
  }
  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
}

function parseCSV(csvText) {
  const lines = String(csvText || '').trim().split('\n');
  if (lines.length === 0) return [];
  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xfeff) headerLine = headerLine.slice(1);
  const headers = headerLine.split(',').map((h) => h.trim().replace(/"/g, ''));
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line.trim());
    if (values.length !== headers.length) return null;
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index]; });
    return row;
  }).filter(Boolean);
}

function haversineMeters(a, b) {
  const r = 6371000;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function cleanShape(points) {
  const cleaned = [];
  for (const point of points || []) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
    const prev = cleaned[cleaned.length - 1];
    if (!prev || haversineMeters(prev, point) > 2) cleaned.push(point);
  }
  return cleaned;
}

function sampleShape(points) {
  const clean = cleanShape(points);
  if (clean.length <= MAX_MATCH_POINTS) return clean;

  const sampled = [clean[0]];
  let distanceSinceLast = 0;
  for (let i = 1; i < clean.length - 1; i += 1) {
    distanceSinceLast += haversineMeters(clean[i - 1], clean[i]);
    if (distanceSinceLast >= MIN_SAMPLE_SPACING_METERS) {
      sampled.push(clean[i]);
      distanceSinceLast = 0;
    }
  }
  sampled.push(clean[clean.length - 1]);

  if (sampled.length <= MAX_MATCH_POINTS) return sampled;

  const evenlySampled = [sampled[0]];
  const step = (sampled.length - 1) / (MAX_MATCH_POINTS - 1);
  for (let i = 1; i < MAX_MATCH_POINTS - 1; i += 1) {
    evenlySampled.push(sampled[Math.round(i * step)]);
  }
  evenlySampled.push(sampled[sampled.length - 1]);
  return cleanShape(evenlySampled);
}

function simplifyBySpacing(points, minMeters = 12) {
  const clean = cleanShape(points);
  if (clean.length <= 2) return clean;
  const simplified = [clean[0]];
  for (let i = 1; i < clean.length - 1; i += 1) {
    if (haversineMeters(simplified[simplified.length - 1], clean[i]) >= minMeters) {
      simplified.push(clean[i]);
    }
  }
  simplified.push(clean[clean.length - 1]);
  return simplified;
}

function pointToSegmentDistance(point, start, end) {
  const latScale = 111000;
  const lonScale = 111000 * Math.cos((point.latitude * Math.PI) / 180);
  const px = point.longitude * lonScale;
  const py = point.latitude * latScale;
  const ax = start.longitude * lonScale;
  const ay = start.latitude * latScale;
  const bx = end.longitude * lonScale;
  const by = end.latitude * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pointToPolylineDistance(point, line) {
  if (!line || line.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    min = Math.min(min, pointToSegmentDistance(point, line[i - 1], line[i]));
  }
  return min;
}

function validateMatchedGeometry(original, sampled, matched) {
  if (!Array.isArray(matched) || matched.length < 2) return { ok: false, reason: 'empty match' };
  const startDrift = haversineMeters(original[0], matched[0]);
  const endDrift = haversineMeters(original[original.length - 1], matched[matched.length - 1]);
  const sampleDistances = sampled.map((point) => pointToPolylineDistance(point, matched)).filter(Number.isFinite);
  const maxDrift = Math.max(...sampleDistances, startDrift, endDrift);
  const avgDrift = sampleDistances.reduce((sum, value) => sum + value, 0) / Math.max(1, sampleDistances.length);

  if (startDrift > 250 || endDrift > 250) return { ok: false, reason: `endpoint drift ${Math.round(Math.max(startDrift, endDrift))}m` };
  if (avgDrift > 90) return { ok: false, reason: `average drift ${Math.round(avgDrift)}m` };
  if (maxDrift > 350) return { ok: false, reason: `max drift ${Math.round(maxDrift)}m` };
  return { ok: true, startDrift, endDrift, avgDrift, maxDrift };
}

async function matchShape(points) {
  const sampled = sampleShape(points);
  if (sampled.length < 2) return { status: 'fallback', reason: 'too few points', sourcePointCount: points.length };

  const coords = sampled.map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`).join(';');
  const radiuses = sampled.map(() => MATCH_RADIUS_METERS).join(';');
  const url = `${OSRM_MATCH_URL}/${coords}?geometries=geojson&overview=full&gaps=ignore&radiuses=${radiuses}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'BTTP-route-display-generator/1.0' },
    signal: AbortSignal.timeout(MATCH_TIMEOUT_MS),
  });
  if (!res.ok) return { status: 'fallback', reason: `HTTP ${res.status}`, sourcePointCount: points.length };

  const payload = await res.json();
  if (payload.code !== 'Ok' || !Array.isArray(payload.matchings) || payload.matchings.length === 0) {
    return { status: 'fallback', reason: payload.code || 'no matchings', sourcePointCount: points.length };
  }

  const matched = simplifyBySpacing(payload.matchings.flatMap((matching) => (
    matching?.geometry?.coordinates || []
  )).map(([longitude, latitude]) => ({ latitude, longitude })), 8);

  const validation = validateMatchedGeometry(points, sampled, matched);
  if (!validation.ok) {
    return { status: 'fallback', reason: validation.reason, sourcePointCount: points.length };
  }

  return {
    status: 'snapped',
    coordinates: matched,
    quality: {
      inputPoints: points.length,
      sampledPoints: sampled.length,
      outputPoints: matched.length,
      avgDriftMeters: Math.round(validation.avgDrift),
      maxDriftMeters: Math.round(validation.maxDrift),
    },
  };
}

async function loadGtfsShapes() {
  const res = await fetch(GTFS_URL, { headers: { 'User-Agent': 'BTTP-route-display-generator/1.0' } });
  if (!res.ok) throw new Error(`GTFS download failed: HTTP ${res.status}`);
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const shapesFile = zip.file('shapes.txt');
  if (!shapesFile) throw new Error('GTFS zip missing shapes.txt');
  const rows = parseCSV(await shapesFile.async('string'));
  const shapes = {};
  for (const row of rows) {
    const shapeId = row.shape_id;
    if (!shapeId) continue;
    if (!shapes[shapeId]) shapes[shapeId] = [];
    shapes[shapeId].push({
      latitude: Number.parseFloat(row.shape_pt_lat),
      longitude: Number.parseFloat(row.shape_pt_lon),
      sequence: Number.parseInt(row.shape_pt_sequence || '0', 10),
    });
  }
  for (const shape of Object.values(shapes)) shape.sort((a, b) => a.sequence - b.sequence);
  return shapes;
}

function readOverrides() {
  if (!fs.existsSync(OVERRIDES_PATH)) return {};
  return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8')).shapes || {};
}

async function main() {
  const shapes = await loadGtfsShapes();
  const overrides = readOverrides();
  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: GTFS_URL,
    provider: OSRM_MATCH_URL,
    options: {
      maxMatchPoints: MAX_MATCH_POINTS,
      matchRadiusMeters: MATCH_RADIUS_METERS,
      minSampleSpacingMeters: MIN_SAMPLE_SPACING_METERS,
    },
    shapes: {},
  };

  const entries = Object.entries(shapes);
  let snapped = 0;
  let fallback = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const [shapeId, points] = entries[index];
    if (overrides[shapeId]) {
      output.shapes[shapeId] = { status: 'manual', coordinates: overrides[shapeId].coordinates || overrides[shapeId] };
      console.log(`[${index + 1}/${entries.length}] ${shapeId}: manual override`);
      continue;
    }

    try {
      const result = await matchShape(points);
      output.shapes[shapeId] = result;
      if (result.status === 'snapped') snapped += 1;
      else fallback += 1;
      console.log(`[${index + 1}/${entries.length}] ${shapeId}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    } catch (error) {
      fallback += 1;
      output.shapes[shapeId] = { status: 'fallback', reason: error.message, sourcePointCount: points.length };
      console.log(`[${index + 1}/${entries.length}] ${shapeId}: fallback (${error.message})`);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  output.summary = { total: entries.length, snapped, fallback, manual: Object.keys(overrides).length };
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(output.summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
