const {
  scoreDetourQualityCases,
} = require('../../scripts/detourQualityScorer');

describe('detourQualityScorer', () => {
  const activeGroundTruth = {
    id: 'route-1-known-detour',
    routeId: '1',
    status: 'active',
    closedSection: {
      start: { latitude: 44.38, longitude: -79.69 },
      end: { latitude: 44.381, longitude: -79.691 },
    },
    detourPath: [
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.3805, longitude: -79.692 },
      { latitude: 44.381, longitude: -79.691 },
    ],
    expectedSkippedStopCodes: ['101'],
    tolerances: {
      closedSectionMaxDistanceMeters: 30,
      detourPathMaxDistanceMeters: 30,
    },
  };

  const validDetour = {
    id: 'event-1',
    eventId: 'event-1',
    routeId: '1',
    state: 'active',
    riderVisible: true,
    sharedDetourEventId: 'physical-event-1',
    shapeId: 'shape-1',
    eventWindow: {
      routeId: '1',
      shapeId: 'shape-1',
      coreStartProgressMeters: 100,
      coreEndProgressMeters: 250,
    },
    skippedSegmentPolyline: [
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.381, longitude: -79.691 },
    ],
    likelyDetourPolyline: activeGroundTruth.detourPath,
    skippedStopCodes: ['101'],
  };

  test('reports labelled detection accuracy and output quality separately', () => {
    const report = scoreDetourQualityCases([
      {
        id: 'true-positive',
        groundTruth: activeGroundTruth,
        activeDetours: { 'event-1': validDetour },
      },
      {
        id: 'false-negative',
        groundTruth: { ...activeGroundTruth, id: 'missed-route-2', routeId: '2' },
        activeDetours: {},
      },
      {
        id: 'true-negative',
        groundTruth: { id: 'normal-route-3', routeId: '3', status: 'inactive' },
        activeDetours: {},
      },
      {
        id: 'false-positive',
        groundTruth: { id: 'normal-route-4', routeId: '4', status: 'inactive' },
        activeDetours: {
          'event-4': { ...validDetour, id: 'event-4', eventId: 'event-4', routeId: '4' },
        },
      },
    ]);

    expect(report.detection).toEqual(expect.objectContaining({
      truePositive: 1,
      falsePositive: 1,
      falseNegative: 1,
      trueNegative: 1,
      precision: 0.5,
      recall: 0.5,
    }));
    expect(report.outputQuality).toEqual(expect.objectContaining({
      evaluatedCount: 1,
      passCount: 1,
      passRate: 1,
      pathPassRate: 1,
      stopImpactPassRate: 1,
    }));
  });

  test('counts equivalent same-route documents as duplicate publications', () => {
    const duplicate = {
      ...validDetour,
      id: '1',
      eventId: '1',
      detourEventId: '1',
    };
    const report = scoreDetourQualityCases([{
      id: 'duplicate-output',
      groundTruth: activeGroundTruth,
      activeDetours: {
        'event-1': validDetour,
        '1': duplicate,
      },
    }]);

    expect(report.duplicates).toEqual(expect.objectContaining({
      duplicateGroupCount: 1,
      duplicateDocumentCount: 1,
    }));
    expect(report.caseResults[0].duplicateDocumentIds.sort()).toEqual(['1', 'event-1']);
  });

  test('includes deterministic safety replay checks without treating them as labelled detections', () => {
    const report = scoreDetourQualityCases([
      {
        id: 'hidden-stale-mixed-replay',
        replay: {
          expected: {
            riderVisible: false,
            canShowDetourPath: false,
            riderVisibilityReason: 'stale-mixed-evidence',
          },
          actual: {
            riderVisible: false,
            canShowDetourPath: false,
            riderVisibilityReason: 'stale-mixed-evidence',
          },
        },
      },
    ]);

    expect(report.caseCount).toBe(1);
    expect(report.detection.labelledCaseCount).toBe(0);
    expect(report.safetyReplays).toEqual({ evaluatedCount: 1, passCount: 1, passRate: 1 });
    expect(report.pass).toBe(true);
    expect(report.productionReadiness).toEqual(expect.objectContaining({
      ready: false,
      unmet: expect.arrayContaining([
        'minimum-labelled-cases',
        'minimum-positive-cases',
        'minimum-negative-cases',
        'minimum-path-cases',
        'minimum-stop-impact-cases',
        'minimum-safety-replays',
      ]),
    }));
  });

  test('reports synthetic traces separately from production readiness', () => {
    const report = scoreDetourQualityCases([{
      id: 'synthetic-positive',
      syntheticTrace: {
        category: 'positive',
        fixture: { ticks: [{}, {}] },
        expected: {
          visibility: 'visible',
          visibleByTick: 1,
          path: 'shown',
          finalState: 'active',
          maxVisibleEventCount: 1,
        },
        actual: {
          routeId: '2A',
          firstVisibleTick: 1,
          finalState: 'active',
          pathEverShown: true,
          maxVisibleEventCount: 1,
          longestVisibleRun: 1,
          allVisibleRouteIds: ['2A'],
          timeline: [{ tick: 0, state: 'absent' }, { tick: 1, state: 'active' }],
        },
      },
    }]);

    expect(report.syntheticLab).toEqual(expect.objectContaining({
      scenarioCount: 1,
      passCount: 1,
      passRate: 1,
      countsTowardProductionReadiness: false,
    }));
    expect(report.detection.labelledCaseCount).toBe(0);
    expect(report.productionReadiness.sample.positiveCaseCount).toBe(0);
  });
});
