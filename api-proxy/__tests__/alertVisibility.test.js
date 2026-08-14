const {
  evaluateRiderAlertVisibility,
} = require('../detour/alertVisibility');

const NOW = Date.parse('2026-07-15T17:30:00Z');

function confirmedDetour(overrides = {}) {
  return {
    state: 'active',
    confidence: 'high',
    uniqueVehicleCount: 2,
    evidencePointCount: 8,
    latestGpsEvidenceAt: NOW - 30 * 60 * 1000,
    riderVisible: false,
    riderVisibilityReason: 'stale-mixed-evidence',
    ...overrides,
  };
}

function boundedGeometry(overrides = {}) {
  return {
    confidence: 'high',
    evidencePointCount: 8,
    segments: [{
      entryPoint: { latitude: 44.3481, longitude: -79.6143 },
      exitPoint: { latitude: 44.3493, longitude: -79.61 },
      spanMeters: 371,
      evidencePointCount: 8,
    }],
    ...overrides,
  };
}

function liveBlakeDetour(overrides = {}) {
  return confirmedDetour({
    routeId: '8B',
    eventId: '8B:fd9e71d0-cbbe-449f-b261-1685c7e62bd2:8800-9200',
    confidence: 'medium',
    uniqueVehicleCount: 2,
    evidencePointCount: 4,
    riderVisibilityReason: 'insufficient-geometry',
    eventWindow: {
      coreStartProgressMeters: 8800,
      coreEndProgressMeters: 9200,
      geoCenter: { latitude: 44.39675, longitude: -79.664 },
      geoBounds: {
        minLatitude: 44.395,
        maxLatitude: 44.3985,
        minLongitude: -79.6655,
        maxLongitude: -79.6625,
      },
    },
    ...overrides,
  });
}

describe('rider detour alert visibility', () => {
  test('publishes a recent, well-supported alert while withholding its unsafe path', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour(), {
      now: NOW,
      geometry: boundedGeometry(),
    })).toEqual({
      alertVisible: true,
      reason: 'fresh-confirmed-gps-evidence',
    });
  });

  test('does not let an official notice override stale auto-detection evidence', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({
      latestGpsEvidenceAt: NOW - 4 * 24 * 60 * 60 * 1000,
    }), {
      now: NOW,
      geometry: boundedGeometry(),
      officialNoticeMatched: true,
    })).toEqual({
      alertVisible: false,
      reason: 'stale-unresolved-awaiting-gps-clear',
    });
  });

  test('quarantines a stale unresolved event without an official match', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({
      latestGpsEvidenceAt: NOW - 4 * 24 * 60 * 60 * 1000,
    }), {
      now: NOW,
      geometry: boundedGeometry(),
    })).toEqual({
      alertVisible: false,
      reason: 'stale-unresolved-awaiting-gps-clear',
    });
  });

  test('uses the schedule-aware rider decision instead of the legacy wall-clock age', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({
      latestGpsEvidenceAt: NOW - 10 * 60 * 60 * 1000,
      riderVisible: true,
      riderVisibilityReason: 'gps-clear-required',
      riderVisibilityPolicySource: 'observed-passage-opportunities',
      riderVisibilityMissedOpportunityCount: 1,
    }), {
      now: NOW,
      geometry: boundedGeometry(),
    })).toEqual({
      alertVisible: true,
      reason: 'schedule-aware-gps-clear-required',
    });
  });

  test('still hides a schedule-aware event after the visibility policy expires it', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({
      latestGpsEvidenceAt: NOW - 10 * 60 * 60 * 1000,
      riderVisible: false,
      riderVisibilityReason: 'stale-evidence-awaiting-gps-clear',
      riderVisibilityPolicySource: 'observed-passage-opportunities',
      riderVisibilityMissedOpportunityCount: 2,
    }), {
      now: NOW,
      geometry: boundedGeometry(),
    })).toEqual({
      alertVisible: false,
      reason: 'stale-unresolved-awaiting-gps-clear',
    });
  });

  test('quarantines fresh but sparse fragmented evidence', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({ evidencePointCount: 3 }), {
      now: NOW,
      geometry: boundedGeometry({ evidencePointCount: 3, segments: [{
        entryPoint: { latitude: 44.339, longitude: -79.67 },
        exitPoint: { latitude: 44.345, longitude: -79.67 },
        spanMeters: 186,
        evidencePointCount: 3,
      }] }),
    })).toEqual({
      alertVisible: false,
      reason: 'insufficient-recent-gps-evidence',
    });
  });

  test('publishes a fresh two-reading short detour only with two complete transition boundaries', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({ evidencePointCount: 2 }), {
      now: NOW,
      geometry: boundedGeometry({
        evidencePointCount: 2,
        segments: [{
          entryPoint: { latitude: 44.3982, longitude: -79.6543 },
          exitPoint: { latitude: 44.3953, longitude: -79.6648 },
          spanMeters: 1163,
          evidencePointCount: 2,
          boundaryConsensus: {
            lowerSignatureCount: 2,
            upperSignatureCount: 2,
          },
        }],
      }),
    })).toEqual({
      alertVisible: true,
      reason: 'fresh-complete-transition-evidence',
    });
  });

  test('quarantines a geometryless event even when its evidence is recent', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour(), {
      now: NOW,
      geometry: { confidence: 'high', evidencePointCount: 8, segments: [] },
    })).toEqual({
      alertVisible: false,
      reason: 'insufficient-alert-geometry',
    });
  });

  test('publishes a bounded Route 100 alert while exact geometry details are pending', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({
      routeId: '100',
      riderVisibilityReason: 'insufficient-geometry',
      eventWindow: {
        coreStartProgressMeters: 100,
        coreEndProgressMeters: 900,
        geoCenter: { latitude: 44.389, longitude: -79.69 },
        geoBounds: {
          minLatitude: 44.38,
          maxLatitude: 44.398,
          minLongitude: -79.70,
          maxLongitude: -79.68,
        },
      },
    }), {
      now: NOW,
      geometry: { confidence: 'high', evidencePointCount: 8, segments: [] },
    })).toEqual({
      alertVisible: true,
      detailsPending: true,
      reason: 'fresh-confirmed-gps-details-pending',
    });
  });

  test('keeps the live-shaped zero-width Route 8A Blake event hidden', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({
      routeId: '8A',
      eventId: '8A:f8afde22-c790-4e13-bd28-45ad3b718ef3:3900-4000',
      confidence: 'medium',
      evidencePointCount: 6,
      riderVisibilityReason: 'insufficient-geometry',
      eventWindow: {
        coreStartProgressMeters: 3950,
        coreEndProgressMeters: 3950,
        geoCenter: { latitude: 44.39675, longitude: -79.664 },
        geoBounds: {
          minLatitude: 44.395,
          maxLatitude: 44.3985,
          minLongitude: -79.6655,
          maxLongitude: -79.6625,
        },
      },
    }), {
      now: NOW,
      geometry: { confidence: 'medium', evidencePointCount: 6, segments: [] },
    })).toEqual({
      alertVisible: false,
      reason: 'insufficient-alert-geometry',
    });
  });

  test('keeps the live-shaped Route 8B Blake event hidden with only four useful points', () => {
    expect(evaluateRiderAlertVisibility(liveBlakeDetour(), {
      now: NOW,
      geometry: { confidence: 'medium', evidencePointCount: 4, segments: [] },
    })).toEqual({
      alertVisible: false,
      reason: 'insufficient-recent-gps-evidence',
    });
  });

  test('publishes the live-shaped Route 8B Blake event alert-only after six useful points', () => {
    expect(evaluateRiderAlertVisibility(liveBlakeDetour({ evidencePointCount: 6 }), {
      now: NOW,
      geometry: { confidence: 'medium', evidencePointCount: 6, segments: [] },
    })).toEqual({
      alertVisible: true,
      detailsPending: true,
      reason: 'fresh-confirmed-gps-details-pending',
    });
  });

  test.each([
    ['top-level suppression flag', { invalidGeometrySuppressed: true }, {}],
    ['top-level stale mixed evidence', { staleMixedEvidence: true }, {}],
    ['top-level stale mixed reason', { riderVisibilityReason: 'stale-mixed-evidence' }, {}],
    ['top-level trust blocker', {}, { geometryTrustBlockedReason: 'stale-mixed-evidence' }],
    ['segment trust blocker', {}, { segments: [{ geometryTrustBlockedReason: 'detour-boundary-gap' }] }],
    ['segment geometry gate', {}, { segments: [{ geometryGate: { reason: 'jumpy-inferred-path' } }] }],
  ])('keeps a safe bounded window hidden with a known-invalid %s', (_label, sourceOverrides, geometryOverrides) => {
    expect(evaluateRiderAlertVisibility(liveBlakeDetour({
      evidencePointCount: 6,
      ...sourceOverrides,
    }), {
      now: NOW,
      geometry: {
        confidence: 'medium',
        evidencePointCount: 6,
        segments: [],
        ...geometryOverrides,
      },
    })).toEqual({
      alertVisible: false,
      reason: 'insufficient-alert-geometry',
    });
  });

  test('still allows alert-only fallback for ordinary incomplete geometry', () => {
    expect(evaluateRiderAlertVisibility(liveBlakeDetour({ evidencePointCount: 6 }), {
      now: NOW,
      geometry: {
        confidence: 'medium',
        evidencePointCount: 6,
        geometryTrustBlockedReason: 'missing-entry-or-exit',
        segments: [],
      },
    })).toEqual({
      alertVisible: true,
      detailsPending: true,
      reason: 'fresh-confirmed-gps-details-pending',
    });
  });

  test('does not expose known-invalid geometry through the details-pending fallback', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({
      routeId: '100',
      riderVisibilityReason: 'suppressed-invalid-geometry',
      eventWindow: {
        coreStartProgressMeters: 100,
        coreEndProgressMeters: 900,
        geoCenter: { latitude: 44.389, longitude: -79.69 },
        geoBounds: {
          minLatitude: 44.38,
          maxLatitude: 44.398,
          minLongitude: -79.70,
          maxLongitude: -79.68,
        },
      },
    }), {
      now: NOW,
      geometry: { confidence: 'high', evidencePointCount: 8, segments: [] },
    })).toEqual({
      alertVisible: false,
      reason: 'suppressed-invalid-geometry',
    });
  });

  test('does not publish details-pending alerts for an unbounded geographic window', () => {
    const decision = evaluateRiderAlertVisibility(confirmedDetour({
      routeId: '100',
      riderVisibilityReason: 'insufficient-geometry',
      eventWindow: {
        coreStartProgressMeters: 100,
        coreEndProgressMeters: 900,
        geoCenter: { latitude: 44.39, longitude: -79.69 },
        geoBounds: {
          minLatitude: 44.30,
          maxLatitude: 44.48,
          minLongitude: -79.80,
          maxLongitude: -79.58,
        },
      },
    }), {
      now: NOW,
      geometry: { confidence: 'high', evidencePointCount: 8, segments: [] },
    });

    expect(decision).toEqual({
      alertVisible: false,
      reason: 'insufficient-alert-geometry',
    });
  });

  test('does not publish an alert before two vehicles confirm the detour', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({ uniqueVehicleCount: 1 }), {
      now: NOW,
      geometry: boundedGeometry(),
    }).alertVisible).toBe(false);
  });

  test('does not publish an alert when confidence is missing', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({ confidence: null }), {
      now: NOW,
      geometry: boundedGeometry({ confidence: null }),
    })).toEqual({
      alertVisible: false,
      reason: 'insufficient-alert-confidence',
    });
  });

  test.each([
    'baseline-update-pending',
    'baseline-diverged',
    'suppressed-invalid-geometry',
    'zero-confirmed-vehicle-count',
  ])('keeps %s records out of rider alerts', (reason) => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({ riderVisibilityReason: reason }), {
      now: NOW,
      geometry: boundedGeometry(),
    })).toEqual({ alertVisible: false, reason });
  });

  test('hides an alert as soon as normal-route clear proof is accepted', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }), {
      now: NOW,
      geometry: boundedGeometry(),
    })).toEqual({ alertVisible: false, reason: 'normal-route-clear-pending' });
  });

  test('removes the alert after the event clears', () => {
    expect(evaluateRiderAlertVisibility(confirmedDetour({ state: 'cleared' }), {
      now: NOW,
      geometry: boundedGeometry(),
    })).toEqual({ alertVisible: false, reason: 'detour-cleared' });
  });
});
