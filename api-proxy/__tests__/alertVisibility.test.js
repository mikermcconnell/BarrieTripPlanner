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
