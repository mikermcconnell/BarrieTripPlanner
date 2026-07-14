const {
  buildReviewCases,
  createDetourReviewOps,
  normalizeReviewInput,
  summarizeEligibleReviews,
} = require('../services/detourReviewOps');

const detected = (overrides = {}) => ({
  id: 'detected-1',
  eventType: 'DETOUR_DETECTED',
  eventId: '8B:shape:100-200',
  routeId: '8B',
  occurredAt: Date.parse('2026-07-09T14:00:00Z'),
  detectedAt: Date.parse('2026-07-09T14:00:00Z'),
  riderVisible: true,
  confidence: 'high',
  uniqueVehicleCount: 3,
  likelyDetourPolyline: [
    { latitude: 44.4, longitude: -79.7 },
    { latitude: 44.41, longitude: -79.71 },
  ],
  reviewSnapshot: { skippedStops: [] },
  ...overrides,
});

describe('detour operator review domain', () => {
  test('builds one case with its lifecycle and excludes simulations', () => {
    const history = [
      detected(),
      {
        id: 'clear-1', eventType: 'DETOUR_CLEARED', eventId: '8B:shape:100-200', routeId: '8B',
        occurredAt: Date.parse('2026-07-09T14:20:00Z'), clearReason: 'normal-route-gps-proof',
      },
      detected({ id: 'sim', routeId: '11', eventId: 'simulated:11', source: 'dev-detour-simulation' }),
    ];
    const cases = buildReviewCases(history, []);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ routeId: '8B', riderVisible: true, maxVehicleCount: 3 });
    expect(cases[0].timeline).toHaveLength(2);
    expect(cases[0].clearedAt).toBe(Date.parse('2026-07-09T14:20:00Z'));
  });

  test('merges a short same-geometry clear/re-detect flap', () => {
    const cases = buildReviewCases([
      detected(),
      { id: 'clear', eventType: 'DETOUR_CLEARED', eventId: '8B:shape:100-200', routeId: '8B', occurredAt: Date.parse('2026-07-09T14:05:00Z') },
      detected({ id: 'detected-2', occurredAt: Date.parse('2026-07-09T14:10:00Z') }),
    ], []);
    expect(cases).toHaveLength(1);
    expect(cases[0].detectionIds).toEqual(['detected-1', 'detected-2']);
  });

  test('requires evidence and quality decisions for a confirmed detour', () => {
    const reviewCase = buildReviewCases([detected()], [])[0];
    expect(() => normalizeReviewInput({ detectionLabel: 'true-positive' }, reviewCase))
      .toThrow(/evidence source/i);
    expect(() => normalizeReviewInput({
      detectionLabel: 'true-positive', evidenceSources: ['official-notice'], note: 'Confirmed notice',
    }, reviewCase)).toThrow(/displayed detour path/i);
    expect(normalizeReviewInput({
      detectionLabel: 'true-positive', pathQuality: 'pass', stopImpactQuality: 'pass',
      evidenceSources: ['official-notice'], note: 'Confirmed notice',
    }, reviewCase)).toMatchObject({ detectionLabel: 'true-positive', pathQuality: 'pass' });
  });

  test('readiness excludes hidden and uncertain reviews', () => {
    const summary = summarizeEligibleReviews([
      { detectionLabel: 'true-positive', eligibility: { readinessEligible: true } },
      { detectionLabel: 'false-positive', eligibility: { readinessEligible: true } },
      { detectionLabel: 'uncertain', eligibility: { readinessEligible: false } },
      { detectionLabel: 'true-positive', eligibility: { readinessEligible: false } },
    ], 2);
    expect(summary).toMatchObject({ reviewedCount: 2, truePositiveCount: 1, falsePositiveCount: 1, precision: 0.5, ready: false });
  });

  test('persists a revisioned review and immutable audit copy', async () => {
    const stored = new Map();
    const reviewRef = (id) => ({
      id,
      collection: (name) => ({ doc: (revisionId) => ({ id: `${id}/${name}/${revisionId}` }) }),
    });
    const db = {
      collection: (name) => {
        if (name !== 'detourOperatorReviews') throw new Error(`Unexpected collection ${name}`);
        return {
          get: async () => ({ docs: [...stored.entries()].filter(([key]) => !key.includes('/revisions/')).map(([id, data]) => ({ id, data: () => data })) }),
          doc: reviewRef,
        };
      },
      runTransaction: async (callback) => callback({
        get: async (ref) => ({ exists: stored.has(ref.id), data: () => stored.get(ref.id) }),
        set: (ref, value) => stored.set(ref.id, value),
      }),
    };
    const ops = createDetourReviewOps({
      db,
      queryHistory: async () => [detected()],
      now: () => Date.parse('2026-07-10T12:00:00Z'),
    });
    const [reviewCase] = buildReviewCases([detected()], []);
    const result = await ops.saveReview(reviewCase.caseId, {
      detectionLabel: 'true-positive', pathQuality: 'pass', stopImpactQuality: 'pass',
      evidenceSources: ['official-notice'], note: 'Confirmed by operations', revision: 0,
    }, { uid: 'mike', email: 'mike@example.com' });
    expect(result.status).toBe(200);
    expect(result.body.review).toMatchObject({ detectionLabel: 'true-positive', revision: 1 });
    expect(stored.get(reviewCase.caseId)).toMatchObject({
      eligibility: { readinessEligible: true }, reviewerUid: 'mike', revision: 1,
    });
    expect(stored.has(`${reviewCase.caseId}/revisions/revision-1`)).toBe(true);
  });
});
