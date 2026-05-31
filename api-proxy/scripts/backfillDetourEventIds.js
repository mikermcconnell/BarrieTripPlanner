const fs = require('fs');
const path = require('path');

const { getDb } = require('../firebaseAdmin');
const { buildDetourEventId } = require('../detourPublisher');
const { buildDetourStorageConfig } = require('../detour/storageConfig');

const SAME_EVENT_ENDPOINT_THRESHOLD_METERS = 225;
const SAME_EVENT_CENTROID_THRESHOLD_METERS = 450;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv(projectRoot = path.resolve(__dirname, '..', '..')) {
  loadEnvFile(path.join(projectRoot, '.env'));
  loadEnvFile(path.join(projectRoot, 'api-proxy', '.env'));

  const localServiceAccountPath = path.join(projectRoot, '.tmp', '.firebase-sa.json');
  if (
    !process.env.FIREBASE_SERVICE_ACCOUNT_JSON &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    fs.existsSync(localServiceAccountPath)
  ) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = localServiceAccountPath;
  }
}

function routeFamilyId(routeId) {
  const normalized = String(routeId || '').trim().toUpperCase();
  const match = normalized.match(/^(\d+)[A-Z]$/);
  return match ? match[1] : normalized;
}

function pointFrom(value) {
  const latitude = Number(value?.latitude ?? value?.lat);
  const longitude = Number(value?.longitude ?? value?.lon ?? value?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function getEndpointPair(segment = {}) {
  const polylineCandidates = [
    segment.skippedSegmentPolyline,
    segment.likelyDetourPolyline,
    segment.inferredDetourPolyline,
  ];
  for (const polyline of polylineCandidates) {
    if (Array.isArray(polyline) && polyline.length >= 2) {
      const start = pointFrom(polyline[0]);
      const end = pointFrom(polyline[polyline.length - 1]);
      if (start && end) return [start, end];
    }
  }

  const entry = pointFrom(segment.entryPoint);
  const exit = pointFrom(segment.exitPoint);
  return entry && exit ? [entry, exit] : null;
}

function distanceMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const radiusMeters = 6_371_000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * radiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function centroidOf(pair) {
  if (!pair) return null;
  return {
    latitude: (pair[0].latitude + pair[1].latitude) / 2,
    longitude: (pair[0].longitude + pair[1].longitude) / 2,
  };
}

function normalizeRoadName(value) {
  return String(value || '').trim().toLowerCase();
}

function roadOverlapScore(a = {}, b = {}) {
  const roadsA = new Set((a.likelyDetourRoadNames || []).map(normalizeRoadName).filter(Boolean));
  const roadsB = new Set((b.likelyDetourRoadNames || []).map(normalizeRoadName).filter(Boolean));
  if (roadsA.size === 0 || roadsB.size === 0) return 0;
  return [...roadsA].filter((road) => roadsB.has(road)).length;
}

function samePhysicalEvent(a, b) {
  if (routeFamilyId(a.routeId) !== routeFamilyId(b.routeId)) return false;

  const endpointsA = getEndpointPair(a.segment);
  const endpointsB = getEndpointPair(b.segment);
  if (!endpointsA || !endpointsB) return false;

  const sameDirectionMax = Math.max(
    distanceMeters(endpointsA[0], endpointsB[0]),
    distanceMeters(endpointsA[1], endpointsB[1])
  );
  const oppositeDirectionMax = Math.max(
    distanceMeters(endpointsA[0], endpointsB[1]),
    distanceMeters(endpointsA[1], endpointsB[0])
  );
  if (Math.min(sameDirectionMax, oppositeDirectionMax) <= SAME_EVENT_ENDPOINT_THRESHOLD_METERS) {
    return true;
  }

  const centroidDistance = distanceMeters(centroidOf(endpointsA), centroidOf(endpointsB));
  return centroidDistance <= SAME_EVENT_CENTROID_THRESHOLD_METERS &&
    roadOverlapScore(a.segment, b.segment) >= 2;
}

function flattenActiveDetourDocs(docs) {
  const flattened = [];
  for (const doc of docs) {
    const data = doc.data || {};
    const routeId = String(data.routeId || doc.id || '').trim();
    const segments = Array.isArray(data.segments) && data.segments.length > 0
      ? data.segments
      : [data];
    segments.forEach((segment, segmentIndex) => {
      flattened.push({
        docId: doc.id,
        routeId,
        segmentIndex,
        segment,
        existingEventId: segment?.detourEventId || data.detourEventId || null,
        baseEventId: buildDetourEventId(routeId, segment),
      });
    });
  }
  return flattened;
}

function groupSegments(flattenedSegments) {
  const groups = [];
  for (const item of flattenedSegments) {
    let targetGroup = null;
    for (const group of groups) {
      if (group.items.some((existing) => samePhysicalEvent(item, existing))) {
        targetGroup = group;
        break;
      }
    }
    if (!targetGroup) {
      targetGroup = { items: [] };
      groups.push(targetGroup);
    }
    targetGroup.items.push(item);
  }
  return groups.map((group) => {
    const eventId = group.items
      .map((item) => item.existingEventId || item.baseEventId)
      .filter(Boolean)
      .sort()[0];
    return { ...group, eventId };
  });
}

function buildBackfillUpdates(docs) {
  const flattened = flattenActiveDetourDocs(docs);
  const groups = groupSegments(flattened);
  const eventIdByKey = new Map();

  groups.forEach((group) => {
    group.items.forEach((item) => {
      eventIdByKey.set(`${item.docId}:${item.segmentIndex}`, group.eventId);
    });
  });

  return docs.map((doc) => {
    const data = doc.data || {};
    const segments = Array.isArray(data.segments) ? data.segments : [];
    if (segments.length === 0) {
      const eventId = eventIdByKey.get(`${doc.id}:0`) || data.detourEventId || null;
      return {
        docId: doc.id,
        eventId,
        update: eventId ? { detourEventId: eventId } : null,
      };
    }

    const updatedSegments = segments.map((segment, segmentIndex) => ({
      ...segment,
      detourEventId: eventIdByKey.get(`${doc.id}:${segmentIndex}`) || segment.detourEventId || null,
    }));
    const topLevelEventId = updatedSegments[0]?.detourEventId || data.detourEventId || null;

    return {
      docId: doc.id,
      eventId: topLevelEventId,
      segmentEventIds: updatedSegments.map((segment) => segment.detourEventId || null),
      update: {
        detourEventId: topLevelEventId,
        segments: updatedSegments,
      },
    };
  });
}

async function runBackfill({ dryRun = true } = {}) {
  loadLocalEnv();
  const db = getDb();
  if (!db) {
    throw new Error('Firestore Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.');
  }
  const storageConfig = buildDetourStorageConfig(process.env);

  const snapshot = await db.collection(storageConfig.activeCollection).get();
  const docs = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  const updates = buildBackfillUpdates(docs);

  if (!dryRun) {
    const batch = db.batch();
    updates.forEach((item) => {
      if (item.update) {
        batch.set(db.collection(storageConfig.activeCollection).doc(item.docId), item.update, { merge: true });
      }
    });
    await batch.commit();
  }

  return {
    dryRun,
    activeCollection: storageConfig.activeCollection,
    documentCount: docs.length,
    updatedDocumentCount: updates.filter((item) => item.update).length,
    updates: updates.map(({ docId, eventId, segmentEventIds }) => ({
      docId,
      eventId,
      segmentEventIds: segmentEventIds || (eventId ? [eventId] : []),
    })),
  };
}

if (require.main === module) {
  const dryRun = !process.argv.includes('--write');
  runBackfill({ dryRun })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (dryRun) {
        console.log('Dry run only. Re-run with --write to apply the backfill.');
      }
    })
    .catch((error) => {
      console.error(`[backfillDetourEventIds] ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  buildBackfillUpdates,
  distanceMeters,
  flattenActiveDetourDocs,
  getEndpointPair,
  groupSegments,
  runBackfill,
  samePhysicalEvent,
};
