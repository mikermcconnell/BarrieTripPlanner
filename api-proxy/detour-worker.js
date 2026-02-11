const JSZip = require('jszip');
const admin = require('firebase-admin');

const GTFS = {
  STATIC_ZIP: 'https://www.myridebarrie.ca/gtfs/Google_transit.zip',
  VEHICLES: 'https://www.myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb',
  ALERTS: 'https://www.myridebarrie.ca/gtfs/GTFS_ServiceAlerts.pb',
};

const CONFIG = {
  enabled: process.env.DETOUR_WORKER_ENABLED === 'true',
  pollMs: Number(process.env.DETOUR_POLL_INTERVAL_MS || 15000),
  staticRefreshMs: Number(process.env.DETOUR_STATIC_REFRESH_MS || 6 * 60 * 60 * 1000),
  evidenceWindowMs: Number(process.env.DETOUR_EVIDENCE_WINDOW_MS || 30 * 60 * 1000),
  minRouteEvidence: Number(process.env.DETOUR_MIN_ROUTE_EVIDENCE || 8),
  minUniqueVehicles: Number(process.env.DETOUR_MIN_UNIQUE_VEHICLES || 2),
  offRouteThresholdMeters: Number(process.env.DETOUR_OFF_ROUTE_THRESHOLD_METERS || 55),
  detourCollection: process.env.DETOUR_COLLECTION || 'publicDetoursActive',
  metaCollection: process.env.DETOUR_META_COLLECTION || 'publicSystem',
  metaDoc: process.env.DETOUR_META_DOC || 'detours',
};

const DETOUR_ALERT_EFFECTS = new Set(['Detour', 'Modified Service', 'No Service', 'Reduced Service']);

let db = null;
let staticData = null;
let staticLoadedAt = 0;
let timer = null;
let running = false;
let snapshot = {
  enabled: CONFIG.enabled,
  lastTickAt: null,
  lastPublishAt: null,
  lastError: null,
  count: 0,
  auto: 0,
  official: 0,
  hybrid: 0,
};

const state = {
  routeEvidence: {},
};

// Optimization: track what we last published to avoid redundant writes
let lastPublishedHash = null;
let lastPublishedIds = new Set();

// Optimization: adaptive polling — slow when idle, fast when detours active
const POLL_NORMAL_MS = 60000;  // 1 minute when no active detours
const POLL_ACTIVE_MS = CONFIG.pollMs; // configured interval (default 15s) when detours detected
let currentPollMs = POLL_NORMAL_MS;

const toRad = (d) => d * (Math.PI / 180);
const haversine = (lat1, lon1, lat2, lon2) => {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371000 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const pointToSegmentDistance = (p, a, b) => {
  const x = p.longitude;
  const y = p.latitude;
  const x1 = a.longitude;
  const y1 = a.latitude;
  const x2 = b.longitude;
  const y2 = b.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return haversine(y, x, y1, x1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return haversine(y, x, y1 + t * dy, x1 + t * dx);
};

const pointToPolylineDistance = (point, polyline) => {
  if (!polyline || polyline.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    min = Math.min(min, pointToSegmentDistance(point, polyline[i], polyline[i + 1]));
  }
  return min;
};

const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else current += ch;
  }
  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
};

const parseCSV = (text) => {
  const lines = text.trim().split('\n');
  if (!lines.length) return [];
  let header = lines[0];
  if (header.charCodeAt(0) === 0xfeff) header = header.slice(1);
  const headers = header.split(',').map((h) => h.trim().replace(/"/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx];
    });
    rows.push(row);
  }
  return rows;
};

const canonicalRouteId = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\d+/);
  return match ? String(parseInt(match[0], 10)) : trimmed;
};

const decodeVarint = (buffer, offset) => {
  let result = 0;
  let shift = 0;
  let bytesRead = 0;
  while (offset + bytesRead < buffer.length) {
    const byte = buffer[offset + bytesRead];
    result |= (byte & 0x7f) << shift;
    bytesRead += 1;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result, bytesRead };
};

const skipField = (buffer, offset, wireType) => {
  if (wireType === 0) {
    while (offset < buffer.length && (buffer[offset] & 0x80) !== 0) offset += 1;
    return offset + 1;
  }
  if (wireType === 1) return offset + 8;
  if (wireType === 5) return offset + 4;
  if (wireType === 2) {
    const { value: len, bytesRead } = decodeVarint(buffer, offset);
    return offset + bytesRead + len;
  }
  return offset + 1;
};

const decodeStringField = (buffer, offset) => {
  const { value: len, bytesRead } = decodeVarint(buffer, offset);
  const start = offset + bytesRead;
  return {
    value: new TextDecoder().decode(buffer.slice(start, start + len)),
    newOffset: start + len,
  };
};

const decodeFloat = (buffer, offset) => {
  const tmp = new Uint8Array(4);
  tmp[0] = buffer[offset];
  tmp[1] = buffer[offset + 1];
  tmp[2] = buffer[offset + 2];
  tmp[3] = buffer[offset + 3];
  return new DataView(tmp.buffer).getFloat32(0, true);
};

const loadStatic = async (logger) => {
  const response = await fetch(GTFS.STATIC_ZIP);
  if (!response.ok) throw new Error(`Static GTFS failed (${response.status})`);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const files = {};
  for (const name of Object.keys(zip.files)) {
    if (name.endsWith('.txt')) files[name] = await zip.files[name].async('string');
  }

  const trips = files['trips.txt'] ? parseCSV(files['trips.txt']) : [];
  const shapesRows = files['shapes.txt'] ? parseCSV(files['shapes.txt']) : [];
  const stopsRows = files['stops.txt'] ? parseCSV(files['stops.txt']) : [];
  const tripMapping = {};
  const routeShapeMapping = {};
  trips.forEach((trip) => {
    tripMapping[trip.trip_id] = {
      routeId: canonicalRouteId(trip.route_id) || trip.route_id,
      directionId: trip.direction_id !== '' ? String(parseInt(trip.direction_id || '0', 10)) : null,
      shapeId: trip.shape_id || null,
    };
    const routeId = canonicalRouteId(trip.route_id) || trip.route_id;
    if (!routeShapeMapping[routeId]) routeShapeMapping[routeId] = new Set();
    if (trip.shape_id) routeShapeMapping[routeId].add(trip.shape_id);
  });

  const shapes = {};
  shapesRows.forEach((row) => {
    if (!row.shape_id) return;
    const lat = parseFloat(row.shape_pt_lat);
    const lon = parseFloat(row.shape_pt_lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    if (!shapes[row.shape_id]) shapes[row.shape_id] = [];
    shapes[row.shape_id].push({
      latitude: lat,
      longitude: lon,
      seq: parseInt(row.shape_pt_sequence || '0', 10),
    });
  });
  Object.keys(shapes).forEach((shapeId) => {
    shapes[shapeId].sort((a, b) => a.seq - b.seq);
  });

  const stops = stopsRows
    .map((row) => ({
      id: row.stop_id,
      code: row.stop_code || row.stop_id,
      name: row.stop_name || `Stop ${row.stop_id}`,
      latitude: parseFloat(row.stop_lat),
      longitude: parseFloat(row.stop_lon),
    }))
    .filter((s) => !Number.isNaN(s.latitude) && !Number.isNaN(s.longitude));

  const normalizedRouteShape = {};
  Object.keys(routeShapeMapping).forEach((routeId) => {
    normalizedRouteShape[routeId] = Array.from(routeShapeMapping[routeId]);
  });

  logger.info('[detour-worker] static GTFS loaded routes=%d shapes=%d', Object.keys(normalizedRouteShape).length, Object.keys(shapes).length);
  return { tripMapping, routeShapeMapping: normalizedRouteShape, shapes, stops };
};

const fetchVehicles = async (tripMapping) => {
  const response = await fetch(GTFS.VEHICLES);
  if (!response.ok) throw new Error(`Vehicle feed failed (${response.status})`);
  const data = new Uint8Array(await response.arrayBuffer());
  const vehicles = [];
  let offset = 0;

  while (offset < data.length) {
    const { value: tag, bytesRead: tagBytes } = decodeVarint(data, offset);
    offset += tagBytes;
    const field = tag >> 3;
    const wire = tag & 0x7;
    if (field !== 2 || wire !== 2) {
      offset = skipField(data, offset, wire);
      continue;
    }
    const { value: len, bytesRead: lenBytes } = decodeVarint(data, offset);
    offset += lenBytes;
    const entity = data.slice(offset, offset + len);
    offset += len;

    let entityId = null;
    let tripId = null;
    let routeId = null;
    let vehicleId = null;
    let lat = null;
    let lon = null;
    let eOff = 0;
    while (eOff < entity.length) {
      const { value: eTag, bytesRead: eTagBytes } = decodeVarint(entity, eOff);
      eOff += eTagBytes;
      const ef = eTag >> 3;
      const ew = eTag & 0x7;
      if (ef === 1 && ew === 2) {
        const parsed = decodeStringField(entity, eOff);
        entityId = parsed.value;
        eOff = parsed.newOffset;
      } else if (ef === 4 && ew === 2) {
        const { value: vpLen, bytesRead: vpLenBytes } = decodeVarint(entity, eOff);
        eOff += vpLenBytes;
        const vp = entity.slice(eOff, eOff + vpLen);
        eOff += vpLen;
        let vpOff = 0;
        while (vpOff < vp.length) {
          const { value: vpTag, bytesRead: vpTagBytes } = decodeVarint(vp, vpOff);
          vpOff += vpTagBytes;
          const vf = vpTag >> 3;
          const vw = vpTag & 0x7;
          if (vf === 1 && vw === 2) {
            const { value: tdLen, bytesRead: tdLenBytes } = decodeVarint(vp, vpOff);
            vpOff += tdLenBytes;
            const td = vp.slice(vpOff, vpOff + tdLen);
            vpOff += tdLen;
            let tdOff = 0;
            while (tdOff < td.length) {
              const { value: tdTag, bytesRead: tdTagBytes } = decodeVarint(td, tdOff);
              tdOff += tdTagBytes;
              const tf = tdTag >> 3;
              const tw = tdTag & 0x7;
              if (tf === 1 && tw === 2) {
                const parsed = decodeStringField(td, tdOff);
                tripId = parsed.value;
                tdOff = parsed.newOffset;
              } else if (tf === 5 && tw === 2) {
                const parsed = decodeStringField(td, tdOff);
                routeId = canonicalRouteId(parsed.value) || parsed.value;
                tdOff = parsed.newOffset;
              } else tdOff = skipField(td, tdOff, tw);
            }
          } else if (vf === 8 && vw === 2) {
            const { value: vdLen, bytesRead: vdLenBytes } = decodeVarint(vp, vpOff);
            vpOff += vdLenBytes;
            const vd = vp.slice(vpOff, vpOff + vdLen);
            vpOff += vdLen;
            let vdOff = 0;
            while (vdOff < vd.length) {
              const { value: vdTag, bytesRead: vdTagBytes } = decodeVarint(vd, vdOff);
              vdOff += vdTagBytes;
              const vdf = vdTag >> 3;
              const vdw = vdTag & 0x7;
              if (vdf === 1 && vdw === 2) {
                const parsed = decodeStringField(vd, vdOff);
                vehicleId = parsed.value;
                vdOff = parsed.newOffset;
              } else vdOff = skipField(vd, vdOff, vdw);
            }
          } else if (vf === 2 && vw === 2) {
            const { value: posLen, bytesRead: posLenBytes } = decodeVarint(vp, vpOff);
            vpOff += posLenBytes;
            const pos = vp.slice(vpOff, vpOff + posLen);
            vpOff += posLen;
            let pOff = 0;
            while (pOff < pos.length) {
              const { value: pTag, bytesRead: pTagBytes } = decodeVarint(pos, pOff);
              pOff += pTagBytes;
              const pf = pTag >> 3;
              const pw = pTag & 0x7;
              if (pf === 1 && pw === 5) {
                lat = decodeFloat(pos, pOff);
                pOff += 4;
              } else if (pf === 2 && pw === 5) {
                lon = decodeFloat(pos, pOff);
                pOff += 4;
              } else pOff = skipField(pos, pOff, pw);
            }
          } else vpOff = skipField(vp, vpOff, vw);
        }
      } else eOff = skipField(entity, eOff, ew);
    }

    if (lat && lon) {
      const tripInfo = tripMapping[tripId] || {};
      vehicles.push({
        id: vehicleId || entityId,
        routeId: routeId || tripInfo.routeId || null,
        directionId: tripInfo.directionId ?? null,
        coordinate: { latitude: lat, longitude: lon },
      });
    }
  }
  return vehicles;
};

const fetchAlerts = async () => {
  const response = await fetch(GTFS.ALERTS);
  if (!response.ok) throw new Error(`Alert feed failed (${response.status})`);
  const data = new Uint8Array(await response.arrayBuffer());
  const alerts = [];
  let offset = 0;

  while (offset < data.length) {
    const { value: tag, bytesRead: tagBytes } = decodeVarint(data, offset);
    offset += tagBytes;
    const field = tag >> 3;
    const wire = tag & 0x7;
    if (field !== 2 || wire !== 2) {
      offset = skipField(data, offset, wire);
      continue;
    }
    const { value: len, bytesRead: lenBytes } = decodeVarint(data, offset);
    offset += lenBytes;
    const entity = data.slice(offset, offset + len);
    offset += len;

    let alertId = null;
    let effect = 'Unknown';
    let title = 'Service Alert';
    const affectedRoutes = new Set();
    let eOff = 0;
    while (eOff < entity.length) {
      const { value: eTag, bytesRead: eTagBytes } = decodeVarint(entity, eOff);
      eOff += eTagBytes;
      const ef = eTag >> 3;
      const ew = eTag & 0x7;
      if (ef === 1 && ew === 2) {
        const parsed = decodeStringField(entity, eOff);
        alertId = parsed.value;
        eOff = parsed.newOffset;
      } else if (ef === 5 && ew === 2) {
        const { value: aLen, bytesRead: aLenBytes } = decodeVarint(entity, eOff);
        eOff += aLenBytes;
        const alert = entity.slice(eOff, eOff + aLen);
        eOff += aLen;
        let aOff = 0;
        while (aOff < alert.length) {
          const { value: aTag, bytesRead: aTagBytes } = decodeVarint(alert, aOff);
          aOff += aTagBytes;
          const af = aTag >> 3;
          const aw = aTag & 0x7;
          if (af === 5 && aw === 2) {
            const { value: ieLen, bytesRead: ieLenBytes } = decodeVarint(alert, aOff);
            aOff += ieLenBytes;
            const ie = alert.slice(aOff, aOff + ieLen);
            aOff += ieLen;
            let ieOff = 0;
            while (ieOff < ie.length) {
              const { value: ieTag, bytesRead: ieTagBytes } = decodeVarint(ie, ieOff);
              ieOff += ieTagBytes;
              const ief = ieTag >> 3;
              const iew = ieTag & 0x7;
              if (ief === 2 && iew === 2) {
                const parsed = decodeStringField(ie, ieOff);
                const normalized = canonicalRouteId(parsed.value);
                if (normalized) affectedRoutes.add(normalized);
                ieOff = parsed.newOffset;
              } else ieOff = skipField(ie, ieOff, iew);
            }
          } else if (af === 7 && aw === 0) {
            const parsed = decodeVarint(alert, aOff);
            const map = { 1: 'No Service', 2: 'Reduced Service', 3: 'Significant Delays', 4: 'Detour', 6: 'Modified Service' };
            effect = map[parsed.value] || 'Unknown';
            aOff += parsed.bytesRead;
          } else if (af === 10 && aw === 2) {
            const { value: tLen, bytesRead: tLenBytes } = decodeVarint(alert, aOff);
            aOff += tLenBytes;
            const translated = alert.slice(aOff, aOff + tLen);
            aOff += tLen;
            let trOff = 0;
            while (trOff < translated.length) {
              const { value: trTag, bytesRead: trTagBytes } = decodeVarint(translated, trOff);
              trOff += trTagBytes;
              const trf = trTag >> 3;
              const trw = trTag & 0x7;
              if (trf === 1 && trw === 2) {
                const { value: entryLen, bytesRead: entryLenBytes } = decodeVarint(translated, trOff);
                trOff += entryLenBytes;
                const entry = translated.slice(trOff, trOff + entryLen);
                trOff += entryLen;
                let enOff = 0;
                while (enOff < entry.length) {
                  const { value: enTag, bytesRead: enTagBytes } = decodeVarint(entry, enOff);
                  enOff += enTagBytes;
                  const enf = enTag >> 3;
                  const enw = enTag & 0x7;
                  if (enf === 1 && enw === 2) {
                    const parsed = decodeStringField(entry, enOff);
                    title = parsed.value;
                    enOff = parsed.newOffset;
                    break;
                  } else enOff = skipField(entry, enOff, enw);
                }
                break;
              } else trOff = skipField(translated, trOff, trw);
            }
          } else aOff = skipField(alert, aOff, aw);
        }
      } else eOff = skipField(entity, eOff, ew);
    }

    if (alertId && DETOUR_ALERT_EFFECTS.has(effect) && affectedRoutes.size > 0) {
      alerts.push({ id: alertId, effect, title, affectedRoutes: Array.from(affectedRoutes) });
    }
  }
  return alerts;
};

const getRouteShapes = (routeId) => (staticData.routeShapeMapping[routeId] || []).map((shapeId) => staticData.shapes[shapeId]).filter((shape) => Array.isArray(shape) && shape.length >= 2);

const trackEvidence = (vehicles) => {
  const now = Date.now();
  vehicles.forEach((vehicle) => {
    if (!vehicle.routeId || !vehicle.coordinate) return;
    const routeId = canonicalRouteId(vehicle.routeId) || vehicle.routeId;
    const routeKey = `${routeId}_${vehicle.directionId ?? 'unknown'}`;
    const routeShapes = getRouteShapes(routeId);
    if (!routeShapes.length) return;
    let minDistance = Infinity;
    routeShapes.forEach((shape) => {
      minDistance = Math.min(minDistance, pointToPolylineDistance(vehicle.coordinate, shape));
    });
    if (minDistance <= CONFIG.offRouteThresholdMeters) return;

    if (!state.routeEvidence[routeKey]) {
      state.routeEvidence[routeKey] = {
        routeId,
        directionId: vehicle.directionId ?? null,
        events: [],
      };
    }

    state.routeEvidence[routeKey].events.push({
      vehicleId: vehicle.id,
      ts: now,
      point: vehicle.coordinate,
      distance: Math.round(minDistance),
    });
  });

  Object.keys(state.routeEvidence).forEach((routeKey) => {
    const evidence = state.routeEvidence[routeKey];
    evidence.events = evidence.events.filter((event) => now - event.ts <= CONFIG.evidenceWindowMs);
    if (!evidence.events.length) delete state.routeEvidence[routeKey];
  });
};

const buildAutoDetours = () => {
  const now = Date.now();
  const detours = [];
  Object.keys(state.routeEvidence).forEach((routeKey) => {
    const evidence = state.routeEvidence[routeKey];
    const uniqueVehicles = new Set(evidence.events.map((event) => event.vehicleId));
    if (evidence.events.length < CONFIG.minRouteEvidence) return;
    if (uniqueVehicles.size < CONFIG.minUniqueVehicles) return;
    const recentPoints = evidence.events.slice(-12).map((e) => ({
      latitude: e.point.latitude,
      longitude: e.point.longitude,
      timestamp: e.ts,
    }));
    const first = evidence.events[0];
    const last = evidence.events[evidence.events.length - 1];
    const score = Math.min(95, 60 + uniqueVehicles.size * 8 + Math.floor(evidence.events.length / 2));
    detours.push({
      id: `server_auto_${routeKey}`,
      routeId: evidence.routeId,
      directionId: evidence.directionId,
      routeKey,
      status: 'suspected',
      source: 'auto',
      confidenceScore: score,
      confidenceLevel: score >= 85 ? 'high-confidence' : score >= 70 ? 'likely' : 'suspected',
      evidenceCount: uniqueVehicles.size,
      firstDetectedAt: first.ts,
      lastSeenAt: last.ts,
      segmentLabel: `Off-route evidence (${evidence.events.length} points)`,
      polyline: recentPoints,
      officialAlert: { matched: false },
      alertCorrelation: 'none',
      affectedStops: [],
    });
  });
  return detours;
};

const mergeHybridDetours = (autoDetours, alerts) => {
  const now = Date.now();
  const byRoute = new Map();
  autoDetours.forEach((detour) => {
    byRoute.set(detour.routeId, detour);
  });

  alerts.forEach((alert) => {
    alert.affectedRoutes.forEach((routeIdRaw) => {
      const routeId = canonicalRouteId(routeIdRaw) || routeIdRaw;
      if (byRoute.has(routeId)) {
        const detour = byRoute.get(routeId);
        detour.source = 'hybrid';
        detour.officialAlert = {
          matched: true,
          alertId: alert.id,
          title: alert.title,
          effect: alert.effect,
          matchedAt: now,
        };
        detour.alertCorrelation = 'matched';
        detour.confidenceScore = Math.min(100, (detour.confidenceScore || 0) + 8);
        detour.confidenceLevel = detour.confidenceScore >= 85 ? 'high-confidence' : 'likely';
      } else {
        byRoute.set(routeId, {
          id: `server_official_${alert.id}_${routeId}`,
          routeId,
          directionId: null,
          routeKey: `${routeId}_official`,
          status: 'suspected',
          source: 'official',
          confidenceScore: 96,
          confidenceLevel: 'high-confidence',
          evidenceCount: 0,
          firstDetectedAt: now,
          lastSeenAt: now,
          segmentLabel: alert.title || 'Official detour alert',
          polyline: [],
          officialAlert: {
            matched: true,
            alertId: alert.id,
            title: alert.title,
            effect: alert.effect,
            matchedAt: now,
          },
          alertCorrelation: 'official-only',
          affectedStops: [],
        });
      }
    });
  });

  return Array.from(byRoute.values()).sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
};

const initFirestore = () => {
  if (db) return db;
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else {
      throw new Error('Missing Firebase Admin credentials for detour worker');
    }
  }
  db = admin.firestore();
  return db;
};

const publishDetours = async (detours, logger) => {
  const firestore = initFirestore();
  const now = Date.now();
  const auto = detours.filter((d) => d.source === 'auto').length;
  const official = detours.filter((d) => d.source === 'official').length;
  const hybrid = detours.filter((d) => d.source === 'hybrid').length;

  // Optimization A: diff before write — build a content hash to detect changes
  const contentHash = detours
    .map((d) => `${d.id}:${d.confidenceScore}:${d.source}:${d.status}`)
    .sort()
    .join('|');

  if (contentHash === lastPublishedHash) {
    // Nothing changed — only update the metadata timestamp (1 write instead of N+1)
    await firestore
      .collection(CONFIG.metaCollection)
      .doc(CONFIG.metaDoc)
      .set(
        { updatedAt: now, worker: { pollMs: currentPollMs, evidenceWindowMs: CONFIG.evidenceWindowMs } },
        { merge: true }
      );
    snapshot = { ...snapshot, lastTickAt: now };
    return;
  }

  // Detour state changed — do full batch write
  const coll = firestore.collection(CONFIG.detourCollection);
  const nextIds = new Set(detours.map((d) => d.id));
  const batch = firestore.batch();

  detours.forEach((detour) => {
    batch.set(coll.doc(detour.id), { ...detour, updatedAt: now }, { merge: true });
  });

  // Optimization C: use cached IDs instead of reading full collection
  lastPublishedIds.forEach((id) => {
    if (!nextIds.has(id)) batch.delete(coll.doc(id));
  });

  batch.set(
    firestore.collection(CONFIG.metaCollection).doc(CONFIG.metaDoc),
    { updatedAt: now, detourCount: detours.length, autoCount: auto, officialCount: official, hybridCount: hybrid, worker: { pollMs: currentPollMs, evidenceWindowMs: CONFIG.evidenceWindowMs } },
    { merge: true }
  );

  await batch.commit();
  lastPublishedHash = contentHash;
  lastPublishedIds = nextIds;
  snapshot = {
    ...snapshot,
    lastPublishAt: now,
    count: detours.length,
    auto,
    official,
    hybrid,
  };
  logger.info('[detour-worker] publish count=%d auto=%d hybrid=%d official=%d', detours.length, auto, hybrid, official);
};

const maybeRefreshStatic = async (logger, force = false) => {
  const now = Date.now();
  if (!force && staticData && now - staticLoadedAt < CONFIG.staticRefreshMs) return;
  staticData = await loadStatic(logger);
  staticLoadedAt = now;
};

const tick = async (logger) => {
  if (running) return;
  running = true;
  try {
    await maybeRefreshStatic(logger);
    const [vehicles, alerts] = await Promise.all([fetchVehicles(staticData.tripMapping), fetchAlerts()]);
    trackEvidence(vehicles);
    const autoDetours = buildAutoDetours();
    const merged = mergeHybridDetours(autoDetours, alerts);
    await publishDetours(merged, logger);
    snapshot = { ...snapshot, lastTickAt: Date.now(), lastError: null };

    // Optimization D: adaptive polling — speed up when detours are active
    const desiredPollMs = merged.length > 0 ? POLL_ACTIVE_MS : POLL_NORMAL_MS;
    if (desiredPollMs !== currentPollMs && timer) {
      clearInterval(timer);
      currentPollMs = desiredPollMs;
      timer = setInterval(() => tick(logger), currentPollMs);
      logger.info('[detour-worker] poll interval changed to %dms (active detours: %d)', currentPollMs, merged.length);
    }
  } catch (error) {
    snapshot = { ...snapshot, lastTickAt: Date.now(), lastError: error.message };
    logger.error('[detour-worker] tick failed:', error);
  } finally {
    running = false;
  }
};

const startDetourWorker = ({ logger }) => {
  if (!CONFIG.enabled) {
    logger.info('[detour-worker] disabled');
    return {
      enabled: false,
      getSnapshot: () => snapshot,
      forceTick: async () => {},
      stop: () => {},
    };
  }

  currentPollMs = POLL_NORMAL_MS;
  logger.info('[detour-worker] starting poll=%dms (active=%dms) window=%dms', currentPollMs, POLL_ACTIVE_MS, CONFIG.evidenceWindowMs);
  tick(logger);
  timer = setInterval(() => tick(logger), currentPollMs);
  return {
    enabled: true,
    getSnapshot: () => snapshot,
    forceTick: async () => tick(logger),
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
};

module.exports = { startDetourWorker };

