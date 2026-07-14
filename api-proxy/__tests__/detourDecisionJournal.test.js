const {
  buildDecision,
  getDetourDecisionJournalStats,
  recordDetourDecision,
  resetDetourDecisionJournal,
  summarizeGeometry,
} = require('../detourDecisionJournal');

const NOW = Date.parse('2026-06-30T12:00:00Z');

describe('detourDecisionJournal', () => {
  let logSpy;

  beforeEach(() => {
    resetDetourDecisionJournal();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('builds a visible rider decision with evidence and geometry summary', () => {
    const decision = buildDecision({
      publishId: '8A:evt-1',
      routeId: '8A',
      isNew: true,
      writeGeo: true,
      now: NOW,
      doc: {
        riderVisible: true,
        confidence: 'medium',
        vehicleCount: 2,
        currentVehicleCount: 1,
        latestGpsEvidenceAt: NOW - 30_000,
        geometryLastEvidenceAt: NOW - 45_000,
        clearWindows: [{ id: 'window-1' }],
      },
      geometry: {
        confidence: 'medium',
        canShowDetourPath: true,
        likelyDetourPolyline: [
          { latitude: 44.1, longitude: -79.1 },
          { latitude: 44.2, longitude: -79.2 },
        ],
        skippedSegmentPolyline: [
          { latitude: 44.3, longitude: -79.3 },
          { latitude: 44.4, longitude: -79.4 },
        ],
        roadMatchSource: 'osrm-match',
        segments: [
          {
            canShowDetourPath: true,
            likelyDetourPolyline: [
              { latitude: 44.1, longitude: -79.1 },
              { latitude: 44.2, longitude: -79.2 },
            ],
            skippedStopIds: ['100', '101'],
          },
        ],
      },
    });

    expect(decision).toEqual(expect.objectContaining({
      event: 'detour_detector_decision',
      decision: 'rider_visible',
      publishId: '8A:evt-1',
      routeId: '8A',
      riderVisible: true,
      confidence: 'medium',
      vehicleCount: 2,
      latestGpsEvidenceAgeMs: 30_000,
      geometryLastEvidenceAgeMs: 45_000,
      clearWindowCount: 1,
      geometryWriteAttempted: true,
    }));
    expect(decision.geometry).toEqual(expect.objectContaining({
      canShowDetourPath: true,
      renderableSegmentCount: 1,
      likelyPointCount: 2,
      skippedPointCount: 2,
      roadMatchSource: 'osrm-match',
    }));
    expect(decision.geometry.segments[0]).toEqual(expect.objectContaining({
      skippedStopCount: 2,
      likelyPointCount: 2,
    }));
  });

  test('builds a hidden decision for insufficient geometry', () => {
    const decision = buildDecision({
      publishId: '8B:evt-2',
      routeId: '8B',
      isNew: true,
      now: NOW,
      doc: {
        riderVisible: false,
        riderVisibilityReason: 'insufficient-geometry',
        vehicleCount: 2,
        currentVehicleCount: 0,
      },
      geometry: {
        confidence: 'low',
        canShowDetourPath: false,
        geometryTrustBlockedReason: 'span-too-short',
        geometryGate: {
          passed: false,
          reason: 'span-too-short',
          spanMeters: 42,
          hasSkippedSegment: true,
          hasEntryPoint: true,
          hasExitPoint: true,
        },
        segments: [
          {
            canShowDetourPath: false,
            geometryTrustBlockedReason: 'span-too-short',
            geometryGate: {
              passed: false,
              reason: 'span-too-short',
              spanMeters: 42,
              hasSkippedSegment: true,
              hasEntryPoint: true,
              hasExitPoint: true,
            },
          },
        ],
      },
    });

    expect(decision).toEqual(expect.objectContaining({
      decision: 'rider_hidden',
      riderVisible: false,
      riderVisibilityReason: 'insufficient-geometry',
      currentVehicleCount: 0,
    }));
    expect(decision.geometry).toEqual(expect.objectContaining({
      hiddenSegmentCount: 1,
      hiddenSegmentReasons: ['span-too-short'],
      geometryGateReason: 'span-too-short',
      spanMeters: 42,
      hasSkippedSegment: true,
      renderableSegmentCount: 0,
    }));
    expect(decision.geometry.segments[0]).toEqual(expect.objectContaining({
      hasEntryPoint: true,
      hasExitPoint: true,
    }));
  });

  test('suppresses duplicate decision signatures', () => {
    const input = {
      publishId: '8A:evt-1',
      routeId: '8A',
      now: NOW,
      doc: {
        riderVisible: true,
        confidence: 'medium',
        vehicleCount: 2,
      },
      geometry: {
        canShowDetourPath: true,
        likelyDetourPolyline: [
          { latitude: 44.1, longitude: -79.1 },
          { latitude: 44.2, longitude: -79.2 },
        ],
      },
    };

    recordDetourDecision(input);
    recordDetourDecision({ ...input, now: NOW + 30_000 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(getDetourDecisionJournalStats()).toEqual(expect.objectContaining({
      recentDecisionCount: 1,
      trackedDetourCount: 1,
    }));
  });

  test('logs again when the decision signature changes', () => {
    recordDetourDecision({
      publishId: '8A:evt-1',
      routeId: '8A',
      now: NOW,
      doc: { riderVisible: true, confidence: 'medium', vehicleCount: 2 },
      geometry: { canShowDetourPath: true },
    });
    recordDetourDecision({
      publishId: '8A:evt-1',
      routeId: '8A',
      now: NOW + 30_000,
      doc: {
        riderVisible: false,
        riderVisibilityReason: 'insufficient-geometry',
        confidence: 'medium',
        vehicleCount: 2,
      },
      geometry: {
        canShowDetourPath: false,
        detourPathSuppressedReason: 'insufficient-geometry',
      },
    });

    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(logSpy.mock.calls[1][0])).toEqual(expect.objectContaining({
      event: 'detour_detector_decision',
      decision: 'rider_hidden',
      riderVisibilityReason: 'insufficient-geometry',
    }));
  });

  test('summarizes multi-segment geometry for detector auditing', () => {
    const summary = summarizeGeometry({
      canShowDetourPath: true,
      inferredDetourPolyline: [
        { latitude: 44.1, longitude: -79.1 },
        { latitude: 44.2, longitude: -79.2 },
        { latitude: 44.3, longitude: -79.3 },
      ],
      segments: [
        {
          detourEventId: 'seg-1',
          canShowDetourPath: true,
          inferredDetourPolyline: [
            { latitude: 44.1, longitude: -79.1 },
            { latitude: 44.2, longitude: -79.2 },
          ],
          evidencePointCount: 4,
        },
        {
          detourEventId: 'seg-2',
          canShowDetourPath: false,
          detourPathSuppressedReason: 'road-match-closed-overlap',
        },
      ],
    });

    expect(summary).toEqual(expect.objectContaining({
      hasGeometry: true,
      segmentCount: 2,
      renderableSegmentCount: 1,
      hiddenSegmentCount: 1,
      hiddenSegmentReasons: ['road-match-closed-overlap'],
      inferredPointCount: 3,
    }));
    expect(summary.segments[0]).toEqual(expect.objectContaining({
      eventId: 'seg-1',
      inferredPointCount: 2,
      evidencePointCount: 4,
    }));
  });
});
