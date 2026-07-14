'use strict';

const crypto = require('crypto');
const { getDb } = require('../firebaseAdmin');
const { getDetourHistory } = require('../detourPublisher');
const { buildDetourStorageConfig } = require('../detour/storageConfig');

const REVIEW_COLLECTION = 'detourOperatorReviews';
const FLAP_MERGE_WINDOW_MS = 15 * 60 * 1000;
const HISTORY_FETCH_LIMIT = 1000;
const DETECTION_LABELS = new Set(['true-positive', 'false-positive', 'uncertain']);
const QUALITY_LABELS = new Set(['pass', 'fail', 'not-applicable']);
const EVIDENCE_SOURCES = new Set([
  'official-notice', 'operator-knowledge', 'gps-map', 'service-control', 'other',
]);

function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRouteId(value) {
  return String(value || '').trim().toUpperCase();
}

function eventIdentity(event = {}) {
  const routeId = normalizeRouteId(event.routeId);
  const eventId = String(event.detourEventId || event.eventId || routeId).trim();
  return routeId && eventId ? `${routeId}\u0000${eventId}` : '';
}

function isSimulatedEvent(event = {}) {
  const source = String(event.source || '').toLowerCase();
  return event.simulated === true || source.includes('simulation') || source.includes('fixture');
}

function pointSignature(point) {
  if (!point) return '';
  const lat = Number(point.latitude ?? point.lat);
  const lon = Number(point.longitude ?? point.lon ?? point.lng);
  return Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(4)},${lon.toFixed(4)}` : '';
}

function geometrySignature(event = {}) {
  const likely = Array.isArray(event.likelyDetourPolyline) ? event.likelyDetourPolyline : [];
  return [
    event.shapeId || '', pointSignature(event.entryPoint), pointSignature(event.exitPoint),
    pointSignature(likely[0]), pointSignature(likely[likely.length - 1]),
  ].join('|');
}

function makeCaseId(detection) {
  const seed = `${detection.id || ''}|${eventIdentity(detection)}|${toMillis(detection.occurredAt) || 0}`;
  return `detour-review-${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 20)}`;
}

function compactTimelineEvent(event = {}) {
  return {
    id: event.id || null,
    eventType: String(event.eventType || '').toUpperCase(),
    occurredAt: toMillis(event.occurredAt),
    detectedAt: toMillis(event.detectedAt),
    clearedAt: toMillis(event.clearedAt),
    riderVisible: event.riderVisible !== false,
    riderVisibilityReason: event.riderVisibilityReason || null,
    confidence: event.confidence || null,
    vehicleCount: Number(event.uniqueVehicleCount ?? event.vehicleCount ?? 0) || 0,
    currentVehicleCount: Number(event.currentVehicleCount ?? 0) || 0,
    clearReason: event.clearReason || null,
  };
}

function detectionSnapshot(detection = {}) {
  const saved = detection.reviewSnapshot || {};
  const segments = Array.isArray(saved.segments)
    ? saved.segments : Array.isArray(detection.segments) ? detection.segments : [];
  const skippedStops = Array.isArray(saved.skippedStops)
    ? saved.skippedStops : Array.isArray(detection.skippedStops) ? detection.skippedStops : null;
  return {
    routeId: normalizeRouteId(detection.routeId),
    eventId: detection.detourEventId || detection.eventId || null,
    shapeId: saved.shapeId || detection.shapeId || null,
    eventWindow: detection.eventWindow || null,
    entryPoint: saved.entryPoint || detection.entryPoint || null,
    exitPoint: saved.exitPoint || detection.exitPoint || null,
    skippedSegmentPolyline: saved.skippedSegmentPolyline || detection.skippedSegmentPolyline || null,
    inferredDetourPolyline: saved.inferredDetourPolyline || detection.inferredDetourPolyline || null,
    likelyDetourPolyline: saved.likelyDetourPolyline || detection.likelyDetourPolyline || null,
    likelyDetourRoadNames: saved.likelyDetourRoadNames || detection.likelyDetourRoadNames || [],
    canShowDetourPath: saved.canShowDetourPath ?? detection.canShowDetourPath ?? null,
    skippedStops,
    segments,
    riderPublishGates: saved.riderPublishGates || detection.riderPublishGates || null,
  };
}

function canMergeFlap(previousCase, detection) {
  if (!previousCase || previousCase.clearedAt == null) return false;
  const detectedAt = toMillis(detection.occurredAt);
  if (detectedAt == null || detectedAt - previousCase.clearedAt > FLAP_MERGE_WINDOW_MS) return false;
  const before = geometrySignature(previousCase.detection);
  const after = geometrySignature(detection);
  return !before || !after || before === after;
}

function buildReviewCases(history = [], reviews = []) {
  const sorted = [...history].filter((event) => !isSimulatedEvent(event))
    .sort((a, b) => (toMillis(a.occurredAt) || 0) - (toMillis(b.occurredAt) || 0));
  const cases = [];
  const openByIdentity = new Map();
  const latestByIdentity = new Map();

  for (const event of sorted) {
    const identity = eventIdentity(event);
    if (!identity) continue;
    const eventType = String(event.eventType || '').toUpperCase();
    if (eventType === 'DETOUR_DETECTED') {
      const prior = latestByIdentity.get(identity);
      if (canMergeFlap(prior, event)) {
        prior.detectionIds.push(event.id || null);
        prior.timeline.push(compactTimelineEvent(event));
        prior.lastObservedAt = toMillis(event.occurredAt);
        prior.clearedAt = null;
        prior.clearReason = null;
        prior.riderVisible ||= event.riderVisible !== false;
        prior.maxVehicleCount = Math.max(prior.maxVehicleCount, Number(event.uniqueVehicleCount ?? event.vehicleCount ?? 0) || 0);
        openByIdentity.set(identity, prior);
        continue;
      }
      const snapshot = detectionSnapshot(event);
      const reviewCase = {
        caseId: makeCaseId(event),
        routeId: normalizeRouteId(event.routeId),
        eventId: event.detourEventId || event.eventId || event.routeId,
        detectionHistoryId: event.id || null,
        detectionIds: [event.id || null],
        detectedAt: toMillis(event.detectedAt) ?? toMillis(event.occurredAt),
        lastObservedAt: toMillis(event.occurredAt),
        clearedAt: null,
        clearReason: null,
        riderVisible: event.riderVisible !== false,
        riderVisibilityReason: event.riderVisibilityReason || null,
        confidence: event.confidence || 'unknown',
        maxVehicleCount: Number(event.uniqueVehicleCount ?? event.vehicleCount ?? 0) || 0,
        detection: event,
        snapshot,
        pathEvidenceAvailable: Boolean(
          (Array.isArray(snapshot.likelyDetourPolyline) && snapshot.likelyDetourPolyline.length >= 2) ||
          (Array.isArray(snapshot.inferredDetourPolyline) && snapshot.inferredDetourPolyline.length >= 2)
        ),
        stopEvidenceAvailable: Array.isArray(snapshot.skippedStops),
        timeline: [compactTimelineEvent(event)],
        review: null,
      };
      cases.push(reviewCase);
      openByIdentity.set(identity, reviewCase);
      latestByIdentity.set(identity, reviewCase);
      continue;
    }
    const current = openByIdentity.get(identity) || latestByIdentity.get(identity);
    if (!current) continue;
    current.timeline.push(compactTimelineEvent(event));
    current.lastObservedAt = Math.max(current.lastObservedAt || 0, toMillis(event.occurredAt) || 0);
    current.maxVehicleCount = Math.max(current.maxVehicleCount, Number(event.uniqueVehicleCount ?? event.vehicleCount ?? 0) || 0);
    if (event.riderVisible !== false) current.riderVisible = true;
    if (eventType.includes('CLEARED')) {
      current.clearedAt = toMillis(event.clearedAt) ?? toMillis(event.occurredAt);
      current.clearReason = event.clearReason || null;
      openByIdentity.delete(identity);
    }
  }
  const byId = new Map(reviews.map((review) => [review.caseId || review.id, review]));
  cases.forEach((reviewCase) => { reviewCase.review = byId.get(reviewCase.caseId) || null; });
  return cases;
}

function reviewStatus(review) {
  if (!review) return 'pending';
  return review.detectionLabel === 'uncertain' ? 'uncertain' : 'reviewed';
}

function priorityScore(reviewCase) {
  return (reviewCase.riderVisible ? 1000 : 0) +
    (String(reviewCase.confidence).toLowerCase() === 'high' ? 200 : 0) +
    Math.min(reviewCase.maxVehicleCount || 0, 10) * 20 + (reviewCase.review ? -500 : 0);
}

function summarizeReview(review) {
  if (!review) return null;
  return {
    detectionLabel: review.detectionLabel,
    pathQuality: review.pathQuality,
    stopImpactQuality: review.stopImpactQuality,
    evidenceSources: review.evidenceSources || [],
    note: review.note || '',
    reviewerUid: review.reviewerUid || null,
    reviewerEmail: review.reviewerEmail || null,
    revision: Number(review.revision || 0),
    reviewedAt: toMillis(review.reviewedAt),
    updatedAt: toMillis(review.updatedAt),
  };
}

function summarizeCase(reviewCase) {
  return {
    caseId: reviewCase.caseId,
    routeId: reviewCase.routeId,
    eventId: reviewCase.eventId,
    detectedAt: reviewCase.detectedAt,
    lastObservedAt: reviewCase.lastObservedAt,
    clearedAt: reviewCase.clearedAt,
    clearReason: reviewCase.clearReason,
    riderVisible: reviewCase.riderVisible,
    riderVisibilityReason: reviewCase.riderVisibilityReason,
    confidence: reviewCase.confidence,
    maxVehicleCount: reviewCase.maxVehicleCount,
    pathEvidenceAvailable: reviewCase.pathEvidenceAvailable,
    stopEvidenceAvailable: reviewCase.stopEvidenceAvailable,
    status: reviewStatus(reviewCase.review),
    review: summarizeReview(reviewCase.review),
  };
}

function normalizeReviewInput(input = {}, reviewCase) {
  const detectionLabel = String(input.detectionLabel || '').trim().toLowerCase();
  if (!DETECTION_LABELS.has(detectionLabel)) throw new Error('Choose a valid detection label');
  const evidenceSources = [...new Set((Array.isArray(input.evidenceSources) ? input.evidenceSources : [])
    .map((value) => String(value).trim().toLowerCase()).filter((value) => EVIDENCE_SOURCES.has(value)))];
  const note = String(input.note || '').trim().slice(0, 2000);
  if (detectionLabel !== 'uncertain' && evidenceSources.length === 0) throw new Error('Select at least one evidence source');
  if (detectionLabel !== 'uncertain' && note.length < 3) throw new Error('Add a short operator note');
  let pathQuality = String(input.pathQuality || 'not-applicable').trim().toLowerCase();
  let stopImpactQuality = String(input.stopImpactQuality || 'not-applicable').trim().toLowerCase();
  if (detectionLabel !== 'true-positive') {
    pathQuality = 'not-applicable';
    stopImpactQuality = 'not-applicable';
  }
  if (!QUALITY_LABELS.has(pathQuality) || !QUALITY_LABELS.has(stopImpactQuality)) {
    throw new Error('Choose valid path and stop-impact quality values');
  }
  if (detectionLabel === 'true-positive' && reviewCase.pathEvidenceAvailable && pathQuality === 'not-applicable') {
    throw new Error('Review the displayed detour path');
  }
  if (detectionLabel === 'true-positive' && reviewCase.stopEvidenceAvailable && stopImpactQuality === 'not-applicable') {
    throw new Error('Review the displayed stop impacts');
  }
  return { detectionLabel, pathQuality, stopImpactQuality, evidenceSources, note };
}

function normalizeReviewDoc(doc) {
  const data = typeof doc.data === 'function' ? doc.data() : doc;
  return { id: doc.id || data.id || data.caseId, ...data, reviewedAt: toMillis(data.reviewedAt), updatedAt: toMillis(data.updatedAt) };
}

async function loadReviews(db) {
  const snapshot = await db.collection(REVIEW_COLLECTION).get();
  return snapshot.docs.map(normalizeReviewDoc);
}

async function loadMatchedNotices(db, reviewCase) {
  try {
    const snapshot = await db.collection('transitNews').orderBy('publishedAt', 'desc').limit(200).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((notice) => {
      const routes = Array.isArray(notice.affectedRoutes) ? notice.affectedRoutes.map(normalizeRouteId) : [];
      if (!routes.includes(reviewCase.routeId)) return false;
      const starts = toMillis(notice.startsAt ?? notice.publishedAt ?? notice.date);
      const ends = toMillis(notice.endsAt ?? notice.archivedAt);
      return (starts == null || starts <= reviewCase.lastObservedAt) && (ends == null || ends >= reviewCase.detectedAt);
    }).slice(0, 10).map((notice) => ({
      id: notice.id, title: notice.title || '', body: notice.body || '', url: notice.url || null,
      affectedRoutes: notice.affectedRoutes || [], startsAt: toMillis(notice.startsAt ?? notice.publishedAt ?? notice.date),
      endsAt: toMillis(notice.endsAt ?? notice.archivedAt),
    }));
  } catch (_error) {
    return [];
  }
}

function summarizeEligibleReviews(reviews = [], minReviewedCount = 20) {
  const eligible = reviews.filter((review) => review?.eligibility?.readinessEligible === true &&
    ['true-positive', 'false-positive'].includes(review.detectionLabel));
  const truePositiveCount = eligible.filter((review) => review.detectionLabel === 'true-positive').length;
  const falsePositiveCount = eligible.filter((review) => review.detectionLabel === 'false-positive').length;
  const reviewedCount = eligible.length;
  const precision = reviewedCount > 0 ? truePositiveCount / reviewedCount : null;
  const targetPrecision = 0.9;
  const enoughReviews = reviewedCount >= minReviewedCount;
  const meetsPrecision = precision != null && precision >= targetPrecision;
  return {
    reviewedCount, truePositiveCount, falsePositiveCount, precision, targetPrecision, minReviewedCount,
    enoughReviews, meetsPrecision, ready: enoughReviews && meetsPrecision,
    reason: !enoughReviews ? 'insufficient-labelled-sample' : meetsPrecision ? 'target-met' : 'precision-below-target',
    source: 'audited-operator-reviews',
  };
}

async function getEligibleDetourReviewSummary({ minReviewedCount = 20, db = getDb() } = {}) {
  if (!db) return null;
  try { return summarizeEligibleReviews(await loadReviews(db), minReviewedCount); }
  catch (error) {
    console.error('[detour-reviews] Failed to summarize audited reviews:', error.message);
    return null;
  }
}

function createDetourReviewOps({ db = null, queryHistory = getDetourHistory, env = process.env, now = () => Date.now() } = {}) {
  const storageConfig = buildDetourStorageConfig(env);
  const resolveDb = () => db || getDb();
  async function loadCases() {
    const activeDb = resolveDb();
    if (!activeDb) throw new Error('Firestore not configured');
    const [history, reviews] = await Promise.all([
      queryHistory({ storageConfig, limit: HISTORY_FETCH_LIMIT, internal: true }), loadReviews(activeDb),
    ]);
    return buildReviewCases(history, reviews);
  }
  async function listCases(options = {}) {
    const parsedLimit = Number.parseInt(String(options.limit ?? 25), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 25;
    const statusFilter = String(options.status || 'pending').toLowerCase();
    const visibility = String(options.visibility || 'rider').toLowerCase();
    const routeId = normalizeRouteId(options.routeId);
    const startMs = toMillis(options.start);
    const endMs = toMillis(options.end);
    const allCases = await loadCases();
    let filtered = allCases.filter((entry) => {
      if (statusFilter !== 'all' && reviewStatus(entry.review) !== statusFilter) return false;
      if (visibility === 'rider' && !entry.riderVisible) return false;
      if (visibility === 'hidden' && entry.riderVisible) return false;
      if (routeId && entry.routeId !== routeId) return false;
      if (startMs != null && entry.lastObservedAt < startMs) return false;
      if (endMs != null && entry.detectedAt > endMs) return false;
      return true;
    });
    filtered.sort((a, b) => priorityScore(b) - priorityScore(a) || b.detectedAt - a.detectedAt);
    const cursor = String(options.cursor || '');
    const startIndex = cursor ? Math.max(0, filtered.findIndex((entry) => entry.caseId === cursor) + 1) : 0;
    const page = filtered.slice(startIndex, startIndex + limit);
    const reviews = allCases.map((entry) => entry.review).filter(Boolean);
    return {
      cases: page.map(summarizeCase),
      nextCursor: startIndex + limit < filtered.length ? page[page.length - 1]?.caseId || null : null,
      totals: {
        all: allCases.length, pending: allCases.filter((entry) => !entry.review).length,
        reviewed: allCases.filter((entry) => reviewStatus(entry.review) === 'reviewed').length,
        uncertain: allCases.filter((entry) => reviewStatus(entry.review) === 'uncertain').length,
        riderVisiblePending: allCases.filter((entry) => entry.riderVisible && !entry.review).length,
      },
      readiness: summarizeEligibleReviews(reviews, Number.parseInt(env.DETOUR_MIN_LABELLED_DETECTIONS || '20', 10) || 20),
    };
  }
  async function getCase(caseId) {
    const entry = (await loadCases()).find((item) => item.caseId === caseId);
    if (!entry) return null;
    return { ...summarizeCase(entry), snapshot: entry.snapshot, timeline: entry.timeline,
      detectionIds: entry.detectionIds.filter(Boolean), matchedNotices: await loadMatchedNotices(resolveDb(), entry) };
  }
  async function saveReview(caseId, input, reviewer = {}) {
    const reviewCase = (await loadCases()).find((entry) => entry.caseId === caseId);
    if (!reviewCase) return { status: 404, body: { error: 'Review case not found' } };
    let normalized;
    try { normalized = normalizeReviewInput(input, reviewCase); }
    catch (error) { return { status: 400, body: { error: error.message } }; }
    const expectedRevision = Number.parseInt(String(input.revision ?? 0), 10) || 0;
    const activeDb = resolveDb();
    const ref = activeDb.collection(REVIEW_COLLECTION).doc(caseId);
    let saved;
    try {
      await activeDb.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(ref);
        const current = currentSnapshot.exists ? currentSnapshot.data() : null;
        const revision = Number(current?.revision || 0);
        if (revision !== expectedRevision) {
          const conflict = new Error('Review changed since it was loaded');
          conflict.code = 'review-conflict';
          throw conflict;
        }
        const timestamp = now();
        saved = {
          schemaVersion: 1, caseId, routeId: reviewCase.routeId, eventId: reviewCase.eventId,
          detectionHistoryId: reviewCase.detectionHistoryId, detectionIds: reviewCase.detectionIds.filter(Boolean),
          detectedAt: reviewCase.detectedAt, lastObservedAt: reviewCase.lastObservedAt,
          riderVisible: reviewCase.riderVisible, confidence: reviewCase.confidence, ...normalized,
          eligibility: { realWorld: true, riderVisible: reviewCase.riderVisible,
            readinessEligible: reviewCase.riderVisible && normalized.detectionLabel !== 'uncertain' },
          frozenCaseSnapshot: { ...summarizeCase(reviewCase), snapshot: reviewCase.snapshot, timeline: reviewCase.timeline },
          reviewerUid: reviewer.uid || null, reviewerEmail: reviewer.email || null,
          revision: revision + 1, reviewedAt: current?.reviewedAt || timestamp, updatedAt: timestamp,
        };
        transaction.set(ref, saved);
        transaction.set(ref.collection('revisions').doc(`revision-${saved.revision}`), saved);
      });
    } catch (error) {
      if (error.code === 'review-conflict') return { status: 409, body: { error: error.message } };
      throw error;
    }
    return { status: 200, body: { review: summarizeReview(saved) } };
  }
  async function exportCase(caseId) {
    const detail = await getCase(caseId);
    if (!detail?.review) return null;
    return {
      schemaVersion: 1, exportedAt: new Date(now()).toISOString(), source: 'operator-review-tool',
      caseId, routeId: detail.routeId,
      status: detail.review.detectionLabel === 'true-positive' ? 'active' : 'normal-service',
      operatorReview: {
        detectionLabel: detail.review.detectionLabel, pathQuality: detail.review.pathQuality,
        stopImpactQuality: detail.review.stopImpactQuality, evidenceSources: detail.review.evidenceSources,
        note: detail.review.note,
      },
      capturedAt: detail.detectedAt, expected: detail.snapshot, sourceDetectionIds: detail.detectionIds,
    };
  }
  return { listCases, getCase, saveReview, exportCase };
}

module.exports = {
  REVIEW_COLLECTION, FLAP_MERGE_WINDOW_MS, buildReviewCases, createDetourReviewOps,
  getEligibleDetourReviewSummary, normalizeReviewInput, summarizeEligibleReviews,
};
