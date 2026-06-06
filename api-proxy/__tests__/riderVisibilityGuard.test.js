const {
  applyRiderVisibilityGuard,
} = require('../detour/riderVisibilityGuard');

describe('rider visibility guardrails', () => {
  test('suppresses same-stop self-loop segments even when one stop is marked impacted', () => {
    const doc = {
      routeId: '8A',
      riderVisible: true,
      segments: [{
        entryStopId: '485',
        exitStopId: '485',
        skippedStopIds: ['485'],
        skippedStopCodes: ['485'],
        affectedStopIds: ['485'],
        affectedStopCodes: ['485'],
        spanMeters: 157,
        canShowDetourPath: true,
      }],
    };

    applyRiderVisibilityGuard(doc);

    expect(doc).toEqual(expect.objectContaining({
      riderVisible: false,
      riderVisibilityReason: 'suppressed-invalid-geometry',
      staleForReview: true,
    }));
  });

  test('keeps short no-skipped-stop GPS detours public', () => {
    const doc = {
      routeId: '100',
      riderVisible: true,
      segments: [{
        spanMeters: 150,
        skippedStopIds: [],
        affectedStopIds: [],
        entryPoint: { latitude: 44.3919, longitude: -79.6928 },
        exitPoint: { latitude: 44.3908, longitude: -79.6930 },
        skippedSegmentPolyline: [
          { latitude: 44.3919, longitude: -79.6928 },
          { latitude: 44.3908, longitude: -79.6930 },
        ],
      }],
    };

    applyRiderVisibilityGuard(doc);
    expect(doc.riderVisible).toBe(true);
    expect(doc.riderVisibilityReason).toBeUndefined();
  });
});
