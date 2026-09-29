'use strict';

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { haversineDistance } = require('../detour/roadGeometry');
const { getNoticeRouteColor, getNoticeRouteTextColor } = require('./detourNoticeStyle');
const { prepareBriefDisplayEvent } = require('./detourBriefDisplay');

const WIDTH = 960;
const MAP_HEIGHT = 540;
const TILE_SIZE = 512; // CARTO @2x raster tiles
const PAD = 64;
const MAX_CLOSURE_POINT_GAP_METERS = 350;

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lon ?? value.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function line(value) {
  return Array.isArray(value) ? value.map(point).filter(Boolean) : [];
}

function distinctLines(lines) {
  const seen = new Set();
  return lines.filter((path) => {
    if (path.length < 2) return false;
    const key = JSON.stringify(path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function followsPublishedRouteShape(path) {
  return path.length >= 3 && path.every((p, index) => (
    index === 0 || haversineDistance(path[index - 1], p) <= MAX_CLOSURE_POINT_GAP_METERS
  ));
}

function hasRoadMatchedDiversion(segment) {
  return segment.canShowDetourPath === true &&
    /^osrm-(match|route)$/.test(String(segment.roadMatchSource || ''));
}

function collectMapGeometry(events) {
  const closures = [];
  const diversions = [];
  const styledClosures = [];
  const styledDiversions = [];
  const anchors = [];
  const skippedStops = [];
  const endpoints = [];
  for (const event of events.map(prepareBriefDisplayEvent)) {
    const routeId = String(event.routeId || '').trim().toUpperCase();
    const segments = Array.isArray(event.segments) && event.segments.length ? event.segments : [event];
    for (const segment of segments) {
      const closed = line(segment.skippedSegmentPolyline);
      if (followsPublishedRouteShape(closed)) {
        closures.push(closed);
        styledClosures.push({ path: closed, routeId });
      }
      else if (closed.length >= 2) anchors.push(closed[0], closed[closed.length - 1]);
      let activePathShown = false;
      if (hasRoadMatchedDiversion(segment)) {
        const diversion = line(segment.likelyDetourPolyline);
        if (segment.briefStopImpactsPending ? followsPublishedRouteShape(diversion) : diversion.length >= 3) {
          diversions.push(diversion);
          styledDiversions.push({ path: diversion, routeId });
          activePathShown = true;
        }
      }
      const entry = point(segment.entryPoint);
      const exit = point(segment.exitPoint);
      if (entry) anchors.push(entry);
      if (exit) anchors.push(exit);
      if (activePathShown && entry && exit) endpoints.push({ entry, exit });
      for (const stop of Array.isArray(segment.skippedStops) ? segment.skippedStops : []) {
        const p = point(stop);
        if (p) skippedStops.push(p);
      }
    }
  }
  const uniqueClosures = distinctLines(closures);
  const uniqueDiversions = distinctLines(diversions);
  const all = [...uniqueClosures.flat(), ...uniqueDiversions.flat(), ...anchors, ...skippedStops];
  return { closures: uniqueClosures, diversions: uniqueDiversions, styledClosures, styledDiversions,
    anchors, skippedStops, endpoints, points: all, pathPending: uniqueDiversions.length === 0 };
}

function world(pointValue, zoom) {
  const n = 2 ** zoom;
  const sin = Math.sin(pointValue.latitude * Math.PI / 180);
  return {
    x: (pointValue.longitude + 180) / 360 * n * TILE_SIZE,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n * TILE_SIZE,
  };
}

function viewport(points) {
  if (!points.length) return null;
  for (let zoom = 16; zoom >= 10; zoom--) {
    const projected = points.map((p) => world(p, zoom));
    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    if (spanX <= WIDTH - PAD * 2 && spanY <= MAP_HEIGHT - PAD * 2) {
      return { zoom, centerX: (Math.min(...xs) + Math.max(...xs)) / 2, centerY: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
  }
  return null;
}

function stroke(ctx, path, project, color, width, dashed = false, offset = 0, outline = true) {
  const projected = path.map(project);
  const shifted = projected.map((xy, index) => {
    if (!offset) return xy;
    const before = projected[Math.max(0, index - 1)];
    const after = projected[Math.min(projected.length - 1, index + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: xy.x - dy / length * offset, y: xy.y + dx / length * offset };
  });
  ctx.setLineDash(dashed ? [15, 11] : []);
  ctx.beginPath();
  shifted.forEach((xy, index) => {
    if (index) ctx.lineTo(xy.x, xy.y);
    else ctx.moveTo(xy.x, xy.y);
  });
  if (outline) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = width + 5;
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([]);
}

function strokeRoutePaths(ctx, styledPaths, project, routeColors, width, dashed) {
  const groups = new Map();
  for (const entry of styledPaths) {
    const key = JSON.stringify(entry.path);
    if (!groups.has(key)) groups.set(key, { path: entry.path, routeIds: new Set() });
    groups.get(key).routeIds.add(entry.routeId);
  }
  for (const { path, routeIds } of groups.values()) {
    const colors = [...new Set([...routeIds].map((routeId) => getNoticeRouteColor(routeId, routeColors)))];
    if (colors.length === 1) {
      stroke(ctx, path, project, colors[0], width, dashed);
    } else {
      stroke(ctx, path, project, '#ffffff', colors.length * 6 + 7, dashed, 0, false);
      colors.forEach((color, index) => stroke(ctx, path, project, color, 6, dashed,
        (index - (colors.length - 1) / 2) * 6, false));
    }
  }
}

function pointAlongPath(path, fraction) {
  const lengths = path.slice(1).map((p, index) =>
    Math.hypot(p.x - path[index].x, p.y - path[index].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * fraction;
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index]) {
      const t = remaining / lengths[index];
      return {
        x: path[index].x + (path[index + 1].x - path[index].x) * t,
        y: path[index].y + (path[index + 1].y - path[index].y) * t,
      };
    }
    remaining -= lengths[index];
  }
  return path[path.length - 1];
}

function drawRouteIcons(ctx, styledPaths, project, routeColors) {
  const groups = new Map();
  for (const { path, routeId } of styledPaths) {
    const key = JSON.stringify(path);
    if (!groups.has(key)) groups.set(key, { path, routeIds: new Set() });
    groups.get(key).routeIds.add(routeId);
  }
  for (const { path, routeIds } of groups.values()) {
    const projected = path.map(project);
    const routes = [...routeIds].map((routeId) => ({
      routeId, label: routeId,
    }));
    const seen = new Set();
    const uniqueRoutes = routes.filter(({ label }) => !seen.has(label) && seen.add(label));
    uniqueRoutes.forEach(({ routeId, label }, index) => {
      const fraction = Math.max(0.25, Math.min(0.8, 0.6 + (index - (uniqueRoutes.length - 1) / 2) * 0.18));
      const p = pointAlongPath(projected, fraction);
      const color = getNoticeRouteColor(routeId, routeColors);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.32)'; ctx.shadowBlur = 7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = getNoticeRouteTextColor(color);
      ctx.font = `bold ${label.length > 2 ? 29 : label.length > 1 ? 36 : 44}px Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x, p.y + 2);
      ctx.restore();
    });
  }
}

function drawEndpoint(ctx, p, label, color) {
  const boxWidth = label === 'START' ? 91 : 72;
  const boxX = p.x + boxWidth + 28 <= WIDTH ? p.x + 24 : p.x - boxWidth - 24;
  ctx.save();
  ctx.shadowColor = 'rgba(10,30,50,0.35)'; ctx.shadowBlur = 5;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(boxX, p.y - 15, boxWidth, 30);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label[0], p.x, p.y + 1);
  ctx.fillStyle = color; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'left';
  ctx.fillText(label, boxX + 9, p.y + 1);
  ctx.restore();
}

async function renderDetourBriefMap(events, { cartoKey, routeColors, fetchImpl = globalThis.fetch } = {}) {
  cartoKey = String(cartoKey || '').trim();
  if (!cartoKey) throw new Error('CARTO_BASEMAP_API_KEY is missing');
  const geometry = collectMapGeometry(events);
  const view = viewport(geometry.points);
  if (!view) throw new Error('No usable detour map coordinates');
  const canvas = createCanvas(WIDTH, MAP_HEIGHT);
  const ctx = canvas.getContext('2d');
  const left = view.centerX - WIDTH / 2;
  const top = view.centerY - MAP_HEIGHT / 2;
  const minX = Math.floor(left / TILE_SIZE);
  const maxX = Math.floor((left + WIDTH - 1) / TILE_SIZE);
  const minY = Math.floor(top / TILE_SIZE);
  const maxY = Math.floor((top + MAP_HEIGHT - 1) / TILE_SIZE);
  const tiles = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) tiles.push({ x, y });
  const images = await Promise.all(tiles.map(async ({ x, y }) => {
    const url = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${view.zoom}/${x}/${y}@2x.png?key=${encodeURIComponent(cartoKey)}`;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`CARTO tile request failed: ${response.status}`);
    // CARTO's key-error placeholder is an HTTP 200 PNG with a wm-* ETag.
    // Treat it as a failed map so the sender retains its waiting_map retry.
    if (/^(?:W\/)?"?wm-/i.test(response.headers?.get?.('etag') || '')) {
      throw new Error('CARTO returned a watermarked error tile; check the basemap key');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 3_000_000) throw new Error('CARTO tile response has invalid size');
    const tile = await loadImage(buffer);
    if (tile.width !== TILE_SIZE || tile.height !== TILE_SIZE) throw new Error('CARTO tile has unexpected dimensions');
    return tile;
  }));
  tiles.forEach(({ x, y }, index) => ctx.drawImage(images[index], x * TILE_SIZE - left, y * TILE_SIZE - top, TILE_SIZE, TILE_SIZE));
  const project = (p) => { const xy = world(p, view.zoom); return { x: xy.x - left, y: xy.y - top }; };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokeRoutePaths(ctx, geometry.styledClosures, project, routeColors, 8, true);
  strokeRoutePaths(ctx, geometry.styledDiversions, project, routeColors, 10, false);
  drawRouteIcons(ctx, geometry.styledDiversions, project, routeColors);
  if (!geometry.closures.length && geometry.anchors.length) {
    for (const anchor of geometry.anchors) {
      const xy = project(anchor);
      ctx.beginPath(); ctx.arc(xy.x, xy.y, 32, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(217,54,69,0.20)'; ctx.fill();
      ctx.strokeStyle = '#d93645'; ctx.lineWidth = 4; ctx.stroke();
    }
  }
  for (const stop of geometry.skippedStops) {
    const xy = project(stop);
    ctx.beginPath(); ctx.arc(xy.x, xy.y, 11, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#d93645'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xy.x - 7, xy.y - 7); ctx.lineTo(xy.x + 7, xy.y + 7);
    ctx.strokeStyle = '#d93645'; ctx.lineWidth = 3; ctx.stroke();
  }
  const drawnEndpoints = new Set();
  for (const { entry, exit } of geometry.endpoints) {
    for (const [label, value, color] of [['START', entry, '#087f5b'], ['END', exit, '#0f4777']]) {
      const key = `${label}:${value.latitude.toFixed(6)}:${value.longitude.toFixed(6)}`;
      if (drawnEndpoints.has(key)) continue;
      drawnEndpoints.add(key);
      drawEndpoint(ctx, project(value), label, color);
    }
  }
  // The email provides one readable HTML legend below the image.
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(WIDTH - 301, MAP_HEIGHT - 30, 293, 22);
  ctx.font = '12px Arial'; ctx.fillStyle = '#263347';
  ctx.fillText('© OpenStreetMap contributors  © CARTO', WIDTH - 293, MAP_HEIGHT - 14);
  const buffer = canvas.toBuffer('image/jpeg', 82);
  if (buffer.length > 600_000) throw new Error('Rendered map exceeds email size limit');
  return { buffer, pathPending: geometry.pathPending, renderedAt: Date.now(), geometry };
}

module.exports = { collectMapGeometry, renderDetourBriefMap, viewport };
