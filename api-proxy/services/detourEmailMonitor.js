'use strict';

const crypto = require('crypto');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { getDb } = require('../firebaseAdmin');
const { getDetourHistory } = require('../detourPublisher');
const { buildDetourStorageConfig } = require('../detour/storageConfig');

const DEFAULT_ALERT_FROM = 'BTTP Detour Alerts <onboarding@resend.dev>';
const DEFAULT_NOTIFICATION_COLLECTION = 'detourEmailNotifications';
const DEFAULT_LOOKBACK_MINUTES = 30;
const DEFAULT_MAX_EVENTS = 50;
const MAP_CONTENT_ID = 'detour-map@bttp.local';
const OSM_TILE_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAlertEventTypes(env = process.env) {
  const configured = parseList(env.DETOUR_ALERT_EVENT_TYPES)
    .map((value) => value.toUpperCase());
  if (configured.length > 0) return configured;

  return parseBoolean(env.DETOUR_ALERT_INCLUDE_CLEARED, false)
    ? ['DETOUR_DETECTED', 'DETOUR_CLEARED']
    : ['DETOUR_DETECTED'];
}

function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') {
    const dateValue = value.toDate();
    return dateValue instanceof Date ? dateValue.getTime() : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTimestamp(value) {
  const millis = toMillis(value);
  if (millis == null) return 'unknown';
  return new Date(millis).toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function routeLabel(event) {
  const routeIds = Array.isArray(event.sharedRouteIds) && event.sharedRouteIds.length > 0
    ? event.sharedRouteIds
    : [event.routeId].filter(Boolean);
  return routeIds.length > 0 ? routeIds.join(', ') : 'Unknown route';
}

function eventLabel(eventType) {
  switch (String(eventType || '').toUpperCase()) {
    case 'DETOUR_DETECTED':
      return 'Detour detected';
    case 'DETOUR_CLEARED':
      return 'Detour cleared';
    default:
      return String(eventType || 'Detour event').replace(/_/g, ' ');
  }
}

function collectLikelyRoadNames(event) {
  const names = new Set();
  const addName = (name) => {
    const clean = String(name || '').trim();
    if (clean) names.add(clean);
  };

  if (Array.isArray(event.likelyDetourRoadNames)) {
    event.likelyDetourRoadNames.forEach(addName);
  }

  if (Array.isArray(event.segments)) {
    event.segments.forEach((segment) => {
      if (Array.isArray(segment?.likelyDetourRoadNames)) {
        segment.likelyDetourRoadNames.forEach(addName);
      }
    });
  }

  return [...names];
}

function collectRoadNamesFromFields(event, fieldNames = []) {
  const names = new Set();
  const addNames = (source) => {
    if (!source) return;
    fieldNames.forEach((fieldName) => {
      if (Array.isArray(source[fieldName])) {
        source[fieldName].forEach((name) => {
          const clean = String(name || '').trim();
          if (clean) names.add(clean);
        });
      }
    });
  };

  addNames(event);
  if (Array.isArray(event?.segments)) {
    event.segments.forEach(addNames);
  }
  return [...names];
}

function stopLabel(stop) {
  if (!stop) return '';
  const code = String(
    stop.stopCode ||
    stop.stop_code ||
    stop.code ||
    stop.id ||
    stop.stopId ||
    stop.stop_id ||
    ''
  ).replace(/^#/, '').trim();
  const name = String(stop.name || stop.stopName || stop.label || '').trim();
  if (code && name) return `#${code} ${name}`;
  if (code) return `#${code}`;
  return name;
}

function collectStopsFromFields(event, fields = []) {
  const labels = new Set();
  const addStops = (source) => {
    if (!source) return;
    fields.forEach((fieldName) => {
      if (!Array.isArray(source[fieldName])) return;
      source[fieldName].forEach((stop) => {
        const label = stopLabel(stop);
        if (label) labels.add(label);
      });
    });
  };

  addStops(event);
  if (Array.isArray(event?.segments)) {
    event.segments.forEach(addStops);
  }
  return [...labels];
}

function collectSkippedStops(event) {
  return collectStopsFromFields(event, [
    'skippedStops',
    'skippedStopCodes',
    'skippedStopIds',
  ]);
}

function collectAffectedStops(event) {
  return collectStopsFromFields(event, [
    'affectedStops',
    'affectedStopCodes',
    'affectedStopIds',
  ]);
}

function cleanLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[.:-]+$/g, '')
    .trim();
}

function cleanRoadName(value) {
  return cleanLabel(value)
    .replace(/\b(Road|Rd\.?|Street|St\.?|Avenue|Ave\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Crescent|Cres\.?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCompactList(items = []) {
  const cleaned = [...new Set(items.map(cleanLabel).filter(Boolean))];
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} & ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')} & ${cleaned[cleaned.length - 1]}`;
}

function collectLabelFields(event, fields = []) {
  const labels = [];
  const addLabels = (source) => {
    if (!source) return;
    fields.forEach((fieldName) => {
      const label = cleanLabel(source[fieldName]);
      if (label) labels.push(label);
    });
  };
  addLabels(event);
  if (Array.isArray(event?.segments)) {
    event.segments.forEach(addLabels);
  }
  return [...new Set(labels)];
}

function buildBestLocationTitle(event, { closedRoads = [], skippedStops = [], affectedStops = [] } = {}) {
  const explicitLabels = collectLabelFields(event, [
    'configuredCorridorLabel',
    'closedSegmentLabel',
    'eventLocationLabel',
    'locationText',
    'title',
    'description',
  ]).filter((label) => !/^route\s+\w+\s+detour$/i.test(label));

  const roadTitle = formatCompactList(closedRoads.map(cleanRoadName).filter(Boolean));
  const stopTitle = formatCompactList(skippedStops.length > 0 ? skippedStops : affectedStops);

  const locationTitle = explicitLabels[0] || roadTitle;
  if (locationTitle && stopTitle && !stopTitle.split(/\s*&\s*|\s*,\s*/).some((part) => locationTitle.includes(part))) {
    return `${locationTitle} · ${stopTitle.startsWith('#') ? `Stops ${stopTitle}` : stopTitle}`;
  }
  return locationTitle || stopTitle || '';
}

function buildDetourEmailInsights(event) {
  const location = String(event?.eventLocationLabel || event?.detourZone?.label || event?.locationText || '').trim();
  const closedRoads = collectRoadNamesFromFields(event, [
    'closedSegmentRoadNames',
    'skippedSegmentRoadNames',
    'closedRoadNames',
  ]);
  const likelyRoads = collectLikelyRoadNames(event);
  const skippedStops = collectSkippedStops(event);
  const affectedStops = collectAffectedStops(event);
  const bestLocationTitle = buildBestLocationTitle(event, {
    closedRoads,
    skippedStops,
    affectedStops,
  });

  const closedBase = closedRoads.length > 0
    ? closedRoads.join(', ')
    : (bestLocationTitle || location || '');
  const closedSectionText = location && closedRoads.length > 0
    ? `Likely closed section: ${closedBase} near ${location}`
    : (closedBase ? `Likely closed section: ${closedBase}` : 'Likely closed section: not enough detail yet');
  const detourPathText = likelyRoads.length > 0
    ? `Likely detour path: ${likelyRoads.join(' -> ')}`
    : 'Likely detour path: open BTTP to view the map';
  const skippedStopsText = skippedStops.length > 0
    ? `Stops likely not served by this route: ${skippedStops.join('; ')}`
    : (affectedStops.length > 0
      ? `Stops affected: ${affectedStops.join('; ')}`
      : 'Stops affected: not listed yet');

  return {
    location,
    bestLocationTitle,
    closedRoads,
    likelyRoads,
    skippedStops,
    affectedStops,
    closedSectionText,
    detourPathText,
    skippedStopsText,
  };
}

function normalizePoint(point) {
  if (!point) return null;
  const latitude = Number(point.latitude ?? point.lat);
  const longitude = Number(point.longitude ?? point.lon ?? point.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function normalizePolyline(polyline) {
  if (!Array.isArray(polyline)) return [];
  return polyline.map(normalizePoint).filter(Boolean);
}

function chooseDetourPath(event) {
  const candidates = [];
  const addCandidate = (source) => {
    if (!source) return;
    if (source.canShowDetourPath === false) return;
    candidates.push(source.likelyDetourPolyline);
    candidates.push(source.inferredDetourPolyline);
  };

  addCandidate(event);
  if (Array.isArray(event?.segments)) {
    event.segments.forEach(addCandidate);
  }

  for (const candidate of candidates) {
    const polyline = normalizePolyline(candidate);
    if (polyline.length >= 2) return polyline;
  }
  return [];
}

function chooseClosedPath(event) {
  const candidates = [event?.skippedSegmentPolyline];
  if (Array.isArray(event?.segments)) {
    event.segments.forEach((segment) => candidates.push(segment?.skippedSegmentPolyline));
  }

  for (const candidate of candidates) {
    const polyline = normalizePolyline(candidate);
    if (polyline.length >= 2) return polyline;
  }
  return [];
}

function pathBounds(paths) {
  const points = paths.flat();
  if (points.length === 0) return null;
  const lats = points.map((point) => point.latitude);
  const lons = points.map((point) => point.longitude);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  };
}

function drawPolyline(ctx, points, project, options = {}) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = options.strokeStyle || '#5B2C83';
  ctx.lineWidth = options.lineWidth || 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (Array.isArray(options.dash)) ctx.setLineDash(options.dash);
  ctx.beginPath();
  points.forEach((point, index) => {
    const projected = project(point);
    if (index === 0) ctx.moveTo(projected.x, projected.y);
    else ctx.lineTo(projected.x, projected.y);
  });
  ctx.stroke();
  ctx.restore();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mercatorWorldPixel(point, zoom) {
  const scale = 256 * (2 ** zoom);
  const lat = clamp(point.latitude, -85.05112878, 85.05112878);
  const latRad = lat * Math.PI / 180;
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2) * scale,
  };
}

function chooseStaticMapZoom(bounds, width, height, padding = 70) {
  const northWest = { latitude: bounds.maxLat, longitude: bounds.minLon };
  const southEast = { latitude: bounds.minLat, longitude: bounds.maxLon };
  for (let zoom = 17; zoom >= 10; zoom -= 1) {
    const a = mercatorWorldPixel(northWest, zoom);
    const b = mercatorWorldPixel(southEast, zoom);
    if (
      Math.abs(b.x - a.x) <= width - padding * 2 &&
      Math.abs(b.y - a.y) <= height - padding * 2
    ) {
      return zoom;
    }
  }
  return 10;
}

function samplePath(points, maxPoints = 40) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  const sampled = [];
  const lastIndex = points.length - 1;
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(points[Math.round((index / (maxPoints - 1)) * lastIndex)]);
  }
  return sampled;
}

function collectMapStopPoints(event) {
  const stops = [];
  const addStops = (source) => {
    if (!source) return;
    [
      'skippedStops',
      'affectedStops',
    ].forEach((fieldName) => {
      if (!Array.isArray(source[fieldName])) return;
      source[fieldName].forEach((stop) => {
        const point = normalizePoint(stop);
        if (point) stops.push({
          ...point,
          label: stopLabel(stop),
        });
      });
    });
  };

  addStops(event);
  if (Array.isArray(event?.segments)) {
    event.segments.forEach(addStops);
  }

  const deduped = new Map();
  stops.forEach((stop) => {
    deduped.set(`${stop.latitude.toFixed(6)},${stop.longitude.toFixed(6)}`, stop);
  });
  return [...deduped.values()].slice(0, 8);
}

function drawMapLegend(ctx, event, insights, width) {
  const title = insights.bestLocationTitle || `Route ${routeLabel(event)} detour`;
  const boxWidth = Math.min(width - 28, 430);
  const boxHeight = 72;
  const x = 14;
  const y = 14;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = 'rgba(40,35,45,0.18)';
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.strokeRect(x, y, boxWidth, boxHeight);

  ctx.fillStyle = '#2B2430';
  ctx.font = 'bold 17px Arial';
  ctx.fillText(`Route ${routeLabel(event)} detour`, x + 12, y + 24);
  ctx.font = '13px Arial';
  ctx.fillText(title.slice(0, 54), x + 12, y + 44);

  ctx.strokeStyle = '#D64545';
  ctx.lineWidth = 5;
  ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 61);
  ctx.lineTo(x + 58, y + 61);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#2B2430';
  ctx.fillText('closed section', x + 66, y + 65);

  ctx.strokeStyle = '#5B2C83';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + 190, y + 61);
  ctx.lineTo(x + 234, y + 61);
  ctx.stroke();
  ctx.fillStyle = '#2B2430';
  ctx.fillText('detour path', x + 242, y + 65);
  ctx.restore();
}

function drawAttribution(ctx, width, height) {
  const text = 'Map data © OpenStreetMap contributors';
  ctx.save();
  ctx.font = '11px Arial';
  const metrics = ctx.measureText(text);
  const x = width - metrics.width - 12;
  const y = height - 10;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillRect(x - 5, y - 13, metrics.width + 10, 17);
  ctx.fillStyle = '#4A4450';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawMapMarker(ctx, point, label, options = {}) {
  ctx.save();
  const radius = options.radius || 8;
  ctx.fillStyle = options.fillStyle || '#0B7A75';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (label) {
    ctx.font = 'bold 12px Arial';
    const text = String(label).slice(0, 16);
    const metrics = ctx.measureText(text);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillRect(point.x + 10, point.y - 16, metrics.width + 8, 18);
    ctx.strokeStyle = 'rgba(40,35,45,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(point.x + 10, point.y - 16, metrics.width + 8, 18);
    ctx.fillStyle = '#2B2430';
    ctx.fillText(text, point.x + 14, point.y - 3);
  }
  ctx.restore();
}

async function fetchTileImage(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': 'BTTP detour email map renderer',
    },
  });
  if (!response.ok) {
    throw new Error(`tile ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return loadImage(Buffer.from(arrayBuffer));
}

async function buildDetourStaticMapAttachment(event, {
  fetchImpl = globalThis.fetch,
  env = process.env,
} = {}) {
  if (parseBoolean(env.DETOUR_ALERT_STATIC_MAP_ENABLED, true) === false) return null;
  if (typeof fetchImpl !== 'function') return null;

  const closedPath = samplePath(chooseClosedPath(event));
  const detourPath = samplePath(chooseDetourPath(event));
  if (closedPath.length < 2 || detourPath.length < 2) return null;

  const width = 640;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F4F1F7';
  ctx.fillRect(0, 0, width, height);

  const stopPoints = collectMapStopPoints(event);
  const allPaths = [closedPath, detourPath, stopPoints].filter((path) => path.length > 0);
  const bounds = pathBounds(allPaths);
  if (!bounds) return null;

  const center = {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLon + bounds.maxLon) / 2,
  };
  const zoom = chooseStaticMapZoom(bounds, width, height);
  const centerPixel = mercatorWorldPixel(center, zoom);
  const project = (point) => {
    const pixel = mercatorWorldPixel(point, zoom);
    return {
      x: width / 2 + (pixel.x - centerPixel.x),
      y: height / 2 + (pixel.y - centerPixel.y),
    };
  };

  const topLeft = {
    x: centerPixel.x - width / 2,
    y: centerPixel.y - height / 2,
  };
  const minTileX = Math.floor(topLeft.x / 256);
  const minTileY = Math.floor(topLeft.y / 256);
  const maxTileX = Math.floor((topLeft.x + width) / 256);
  const maxTileY = Math.floor((topLeft.y + height) / 256);
  const tileCount = 2 ** zoom;
  let drawnTiles = 0;
  const tileTemplate = String(env.DETOUR_ALERT_OSM_TILE_TEMPLATE || OSM_TILE_TEMPLATE);

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue;
      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;
      const url = tileTemplate
        .replace('{z}', String(zoom))
        .replace('{x}', String(wrappedTileX))
        .replace('{y}', String(tileY));
      try {
        const image = await fetchTileImage(url, fetchImpl);
        ctx.drawImage(
          image,
          Math.round(tileX * 256 - topLeft.x),
          Math.round(tileY * 256 - topLeft.y),
          256,
          256
        );
        drawnTiles += 1;
      } catch (_err) {
        // Keep rendering with any tiles that load; if none load, skip the map.
      }
    }
  }

  if (drawnTiles === 0) return null;

  // White halo under rider-facing geometry keeps the detour visible on busy roads.
  drawPolyline(ctx, closedPath, project, {
    strokeStyle: '#FFFFFF',
    lineWidth: 14,
    dash: [12, 10],
  });
  drawPolyline(ctx, closedPath, project, {
    strokeStyle: '#D64545',
    lineWidth: 8,
    dash: [12, 10],
  });
  drawPolyline(ctx, detourPath, project, {
    strokeStyle: '#FFFFFF',
    lineWidth: 13,
  });
  drawPolyline(ctx, detourPath, project, {
    strokeStyle: '#5B2C83',
    lineWidth: 7,
  });

  const start = detourPath[0];
  const end = detourPath[detourPath.length - 1];
  if (start) drawMapMarker(ctx, project(start), 'entry', { fillStyle: '#0B7A75' });
  if (end) drawMapMarker(ctx, project(end), 'rejoin', { fillStyle: '#2F5597' });
  stopPoints.forEach((stop) => {
    drawMapMarker(ctx, project(stop), stop.label || 'stop', {
      fillStyle: '#F59E0B',
      radius: 7,
    });
  });

  drawMapLegend(ctx, event, buildDetourEmailInsights(event), width);
  drawAttribution(ctx, width, height);

  return {
    content: canvas.toBuffer('image/png').toString('base64'),
    filename: 'detour-map-inline.png',
    content_type: 'image/png',
    content_id: MAP_CONTENT_ID,
  };
}

function buildDetourMapFallbackAttachment(inlineAttachment) {
  if (!inlineAttachment?.content) return null;
  return {
    content: inlineAttachment.content,
    filename: 'detour-map.png',
    content_type: 'image/png',
  };
}

function makeNotificationId(event) {
  const stableParts = [
    event.eventType || '',
    event.eventId || event.detourEventId || event.id || '',
    event.routeId || '',
    event.detectedAt || '',
    event.occurredAt || '',
  ];
  return crypto
    .createHash('sha256')
    .update(stableParts.join('|'))
    .digest('hex');
}

function buildSubject(event) {
  return `Barrie Transit Detour Alert | ${eventLabel(event.eventType)} | Route ${routeLabel(event)}`;
}

function shouldSendDetourEmailEvent(event) {
  return event?.riderVisible === true;
}

function eventIdentifierValues(event = {}) {
  return [
    event.detourEventId,
    event.eventId,
    event.sharedDetourEventId,
    event.id,
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function activeDocMatchesEvent(active = {}, event = {}) {
  const eventIds = new Set(eventIdentifierValues(event));
  const activeIds = eventIdentifierValues(active);
  if (eventIds.size > 0 && activeIds.some((id) => eventIds.has(id))) return true;
  const eventRouteId = String(event.routeId || '').trim();
  return eventRouteId && String(active.routeId || '').trim() === eventRouteId;
}

function rankActiveDetourCandidate(active = {}, event = {}) {
  let score = 0;
  if (active.riderVisible === true) score += 100;
  if (activeDocMatchesEvent(active, event)) score += 50;
  if (String(active.detourEventId || '') && String(active.detourEventId || '') === String(event.detourEventId || event.eventId || '')) score += 30;
  if (String(active.routeId || '') && String(active.routeId || '') === String(event.routeId || '')) score += 10;
  if (buildDetourEmailInsights(active).bestLocationTitle) score += 6;
  if (collectSkippedStops(active).length > 0) score += 5;
  if (collectLikelyRoadNames(active).length > 0) score += 4;
  if (chooseClosedPath(active).length >= 2 && chooseDetourPath(active).length >= 2) score += 4;
  return score;
}

async function queryActiveDetourCandidates(db, collectionName, event) {
  const collection = db.collection(collectionName);
  const candidates = [];
  const addSnapshot = (snapshot, id = '') => {
    if (!snapshot?.exists) return;
    candidates.push({
      id: id || snapshot.id || null,
      ...(typeof snapshot.data === 'function' ? snapshot.data() : {}),
    });
  };
  const addQuerySnapshot = (snapshot) => {
    if (!snapshot?.docs) return;
    snapshot.docs.forEach((doc) => addSnapshot(doc, doc.id));
  };

  const routeId = String(event?.routeId || '').trim();
  if (routeId && typeof collection.doc === 'function') {
    try {
      addSnapshot(await collection.doc(routeId).get(), routeId);
    } catch (_err) {
      // Non-fatal. V2 active detour docs are not keyed only by routeId.
    }
  }

  if (routeId && typeof collection.where === 'function') {
    try {
      addQuerySnapshot(await collection.where('routeId', '==', routeId).limit(10).get());
    } catch (_err) {
      // Non-fatal. Some test doubles or deployments may not support this query.
    }
  }

  const deduped = new Map();
  candidates.forEach((candidate, index) => {
    const key = candidate.id || `${candidate.routeId || 'candidate'}:${candidate.detourEventId || index}`;
    deduped.set(key, candidate);
  });
  return [...deduped.values()];
}

async function enrichEventFromActiveDetour(db, storageConfig, event) {
  if (!db || !storageConfig?.activeCollection || !event?.routeId) return event;
  const candidates = await queryActiveDetourCandidates(db, storageConfig.activeCollection, event);
  const best = candidates
    .filter((candidate) => candidate.riderVisible === true && activeDocMatchesEvent(candidate, event))
    .sort((a, b) => rankActiveDetourCandidate(b, event) - rankActiveDetourCandidate(a, event))[0];

  if (!best) return event;
  return {
    ...event,
    ...best,
    id: event.id || best.id || null,
    eventType: event.eventType,
    eventId: event.eventId || best.eventId || best.detourEventId || null,
    detourEventId: event.detourEventId || best.detourEventId || best.eventId || null,
    occurredAt: event.occurredAt || best.occurredAt || best.updatedAt || null,
    detectedAt: event.detectedAt || best.detectedAt || null,
  };
}

function buildEmailMessage(event, { appUrl = '', mapAttachment = null } = {}) {
  const subject = buildSubject(event);
  const roads = collectLikelyRoadNames(event);
  const insights = buildDetourEmailInsights(event);
  const mapFallbackAttachment = buildDetourMapFallbackAttachment(mapAttachment);
  const location = event.eventLocationLabel || event.detourZone?.label || '';
  const rows = [
    ['Event', eventLabel(event.eventType)],
    ['Route(s)', routeLabel(event)],
    ['Detected at', formatTimestamp(event.detectedAt || event.occurredAt)],
    ['Updated at', formatTimestamp(event.occurredAt)],
    ['Rider visible', event.riderVisible === false ? 'No' : 'Yes'],
    ['Visibility reason', event.riderVisibilityReason || '—'],
    ['Confidence', event.eventConfidence || event.confidence || 'unknown'],
    ['Vehicles', event.uniqueVehicleCount ?? event.vehicleCount ?? 'unknown'],
    ['Location', insights.bestLocationTitle || location || '—'],
    ['Likely closed section', insights.closedSectionText.replace(/^Likely closed section:\s*/, '')],
    ['Likely detour roads', roads.length > 0 ? roads.join(', ') : '—'],
    ['Likely path summary', insights.detourPathText.replace(/^Likely detour path:\s*/, '')],
    ['Skipped/affected stops', insights.skippedStops.length > 0
      ? insights.skippedStops.join('; ')
      : (insights.affectedStops.length > 0 ? insights.affectedStops.join('; ') : '—')],
    ['Event ID', event.detourEventId || event.eventId || event.id || '—'],
  ];

  const htmlRows = rows
    .map(([label, value]) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(value)}</td>
      </tr>`)
    .join('');

  const appLink = appUrl
    ? `<p style="margin:16px 0 0"><a href="${escapeHtml(appUrl)}">Open BTTP</a></p>`
    : '';
  const mapPreview = mapAttachment
    ? `
        <div style="margin:18px 0">
          <p style="margin:0 0 8px;font-weight:bold">Approximate detour map</p>
          <img src="cid:${MAP_CONTENT_ID}" alt="Approximate detour map" width="640" style="width:100%;max-width:640px;border:1px solid #ddd;border-radius:8px">
          <p style="margin:8px 0 0;color:#555;font-size:12px">If this image does not display in Outlook, open the attached detour-map.png.</p>
        </div>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto">
    <tr>
      <td style="background:#5B2C83;padding:16px 20px;color:#fff;font-size:18px;font-weight:bold">
        BARRIE TRANSIT DETOUR ALERT
      </td>
    </tr>
    <tr>
      <td style="padding:20px">
        <p style="font-size:16px;margin:0 0 12px"><strong>Confirmed public detour</strong> for route ${escapeHtml(routeLabel(event))}.</p>
        ${insights.bestLocationTitle ? `<p style="font-size:18px;margin:0 0 12px"><strong>${escapeHtml(insights.bestLocationTitle)}</strong></p>` : ''}
        <p style="margin:0 0 12px">${escapeHtml(insights.closedSectionText)}<br>${escapeHtml(insights.detourPathText)}<br>${escapeHtml(insights.skippedStopsText)}</p>
        ${mapPreview}
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${htmlRows}</table>
        ${appLink}
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    '',
    insights.bestLocationTitle ? `Area: ${insights.bestLocationTitle}` : null,
    insights.closedSectionText,
    insights.detourPathText,
    insights.skippedStopsText,
    mapFallbackAttachment
      ? 'If the map image does not display, open the attached detour-map.png.'
      : null,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    appUrl ? `Open BTTP: ${appUrl}` : null,
  ].filter(Boolean).join('\n');

  return {
    subject,
    html,
    text,
    attachments: [
      mapAttachment,
      mapFallbackAttachment,
    ].filter(Boolean),
  };
}

function normalizeResendAttachment(attachment) {
  const normalized = {};
  const copyStringField = (fieldName) => {
    if (attachment[fieldName] != null) {
      normalized[fieldName] = attachment[fieldName];
    }
  };

  copyStringField('content');
  copyStringField('filename');
  copyStringField('path');
  normalized.content_type = attachment.content_type || attachment.contentType;
  normalized.content_id = attachment.content_id || attachment.contentId;

  Object.keys(normalized).forEach((fieldName) => {
    if (normalized[fieldName] == null || normalized[fieldName] === '') {
      delete normalized[fieldName];
    }
  });

  return normalized;
}

async function sendViaResend({ apiKey, from, recipients, message, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('global fetch is unavailable; use Node 18+ or provide fetchImpl');
  }

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: Array.isArray(message.attachments) && message.attachments.length > 0
        ? message.attachments.map(normalizeResendAttachment)
        : undefined,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Resend API ${response.status}: ${body}`);
  }

  try {
    return JSON.parse(body);
  } catch (_err) {
    return { id: 'unknown' };
  }
}

async function hasNotification(db, collectionName, notificationId) {
  const snapshot = await db.collection(collectionName).doc(notificationId).get();
  return snapshot.exists;
}

async function recordNotification(db, collectionName, notificationId, event, details = {}) {
  await db.collection(collectionName).doc(notificationId).set({
    notificationId,
    eventType: event.eventType || null,
    eventId: event.eventId || event.detourEventId || null,
    detourEventId: event.detourEventId || event.eventId || null,
    historyDocId: event.id || null,
    routeId: event.routeId || null,
    sharedRouteIds: Array.isArray(event.sharedRouteIds) ? event.sharedRouteIds : [],
    occurredAt: toMillis(event.occurredAt),
    detectedAt: toMillis(event.detectedAt),
    sentAt: Date.now(),
    provider: 'resend',
    providerMessageId: details.id || details.messageId || null,
  }, { merge: true });
}

async function runDetourEmailMonitor({
  env = process.env,
  db = null,
  queryDetourHistory = getDetourHistory,
  sendEmail = sendViaResend,
  now = () => Date.now(),
} = {}) {
  if (parseBoolean(env.DETOUR_EMAIL_ALERT_ENABLED, true) === false) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const recipients = parseList(env.DETOUR_ALERT_RECIPIENTS || env.DETOUR_ALERT_RECIPIENT);
  if (recipients.length === 0) {
    return { ok: true, skipped: true, reason: 'no-recipients' };
  }

  const apiKey = String(env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: true, skipped: true, reason: 'resend-not-configured' };
  }

  if (!db) {
    db = getDb();
  }

  if (!db) {
    return { ok: false, skipped: true, reason: 'firestore-not-configured' };
  }

  const storageConfig = buildDetourStorageConfig(env);
  const eventTypes = getAlertEventTypes(env);
  const limit = parsePositiveInteger(env.DETOUR_ALERT_MAX_EVENTS, DEFAULT_MAX_EVENTS);
  const lookbackMinutes = parsePositiveInteger(env.DETOUR_ALERT_LOOKBACK_MIN, DEFAULT_LOOKBACK_MINUTES);
  const startMs = now() - (lookbackMinutes * 60 * 1000);
  const notificationCollection =
    String(env.DETOUR_ALERT_NOTIFICATION_COLLECTION || DEFAULT_NOTIFICATION_COLLECTION).trim();
  const from = String(env.DETOUR_ALERT_FROM || DEFAULT_ALERT_FROM).trim();
  const appUrl = String(env.DETOUR_ALERT_APP_URL || '').trim();

  const logs = await queryDetourHistory({
    limit,
    startMs,
    eventTypes,
    storageConfig,
  });

  const events = [...logs].reverse();
  const sent = [];
  const skipped = [];

  for (const event of events) {
    const emailEvent = await enrichEventFromActiveDetour(db, storageConfig, event);

    if (!shouldSendDetourEmailEvent(emailEvent)) {
      skipped.push({
        id: event.id || event.eventId || null,
        reason: 'not-rider-visible',
        riderVisible: emailEvent.riderVisible ?? null,
        riderVisibilityReason: emailEvent.riderVisibilityReason || null,
      });
      continue;
    }

    const notificationId = makeNotificationId(emailEvent);
    if (await hasNotification(db, notificationCollection, notificationId)) {
      skipped.push({ id: event.id || event.eventId || null, reason: 'already-notified' });
      continue;
    }

    const mapAttachment = await buildDetourStaticMapAttachment(emailEvent, { env });
    const message = buildEmailMessage(emailEvent, { appUrl, mapAttachment });
    const providerResult = await sendEmail({
      apiKey,
      from,
      recipients,
      message,
    });
    await recordNotification(db, notificationCollection, notificationId, emailEvent, providerResult || {});
    sent.push({
      id: event.id || event.eventId || null,
      eventType: emailEvent.eventType,
      routeId: emailEvent.routeId,
      notificationId,
    });
  }

  return {
    ok: true,
    storage: {
      historyCollection: storageConfig.historyCollection,
      notificationCollection,
    },
    eventTypes,
    checked: logs.length,
    sentCount: sent.length,
    skippedCount: skipped.length,
    sent,
    skipped,
  };
}

module.exports = {
  buildDetourEmailInsights,
  buildDetourStaticMapAttachment,
  collectLikelyRoadNames,
  enrichEventFromActiveDetour,
  buildEmailMessage,
  buildSubject,
  getAlertEventTypes,
  makeNotificationId,
  runDetourEmailMonitor,
  shouldSendDetourEmailEvent,
  sendViaResend,
};
