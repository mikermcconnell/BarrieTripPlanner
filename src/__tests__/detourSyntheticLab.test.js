const { buildSyntheticDetourScenarios } = require('../../scripts/detourSyntheticScenarios');
const { replaySyntheticDetourTrace } = require('../../scripts/detourV2Replay');
const { scoreDetourQualityCases } = require('../../scripts/detourQualityScorer');

describe('synthetic detour lab', () => {
  test('runs 15 test-only scenarios through the real V2 detector at 30-second cadence', () => {
    const scenarios = buildSyntheticDetourScenarios();
    expect(scenarios).toHaveLength(15);
    expect(scenarios.filter((scenario) => scenario.category === 'positive')).toHaveLength(5);
    expect(scenarios.filter((scenario) => scenario.category === 'safety')).toHaveLength(5);
    expect(scenarios.filter((scenario) => scenario.category === 'lifecycle')).toHaveLength(5);
    expect(new Set(scenarios.map((scenario) => scenario.routeId))).toEqual(
      new Set(['2A', '7A', '8A', '11', '12A'])
    );

    const results = scenarios.map((fixture) => ({
      id: fixture.id,
      syntheticTrace: {
        category: fixture.category,
        fixture,
        expected: fixture.expected,
        actual: replaySyntheticDetourTrace(fixture),
      },
    }));
    const report = scoreDetourQualityCases(results);

    expect(report.regressionPass).toBe(true);
    expect(report.syntheticLab).toEqual(expect.objectContaining({
      testOnly: true,
      countsTowardProductionReadiness: false,
      scenarioCount: 15,
      passCount: 15,
      passRate: 1,
      averagePositiveFirstVisibleTick: 1,
      pathPassRate: 1,
      stopImpactPassRate: 1,
      clearPassRate: 1,
    }));
    expect(report.syntheticLab.categories).toEqual({
      positive: { scenarioCount: 5, passCount: 5, passRate: 1 },
      safety: { scenarioCount: 5, passCount: 5, passRate: 1 },
      lifecycle: { scenarioCount: 5, passCount: 5, passRate: 1 },
    });
  });

  test('does not let synthetic passes satisfy production sample minimums', () => {
    const cases = buildSyntheticDetourScenarios().map((fixture) => ({
      id: fixture.id,
      syntheticTrace: {
        category: fixture.category,
        fixture,
        expected: fixture.expected,
        actual: replaySyntheticDetourTrace(fixture),
      },
    }));
    const report = scoreDetourQualityCases(cases);

    expect(report.productionReadiness.ready).toBe(false);
    expect(report.productionReadiness.sample).toEqual({
      labelledCaseCount: 0,
      positiveCaseCount: 0,
      negativeCaseCount: 0,
      pathCaseCount: 0,
      stopImpactCaseCount: 0,
      safetyReplayCount: 0,
    });
  });

  test('rejects traces that are not clearly synthetic or use a different cadence', () => {
    const fixture = buildSyntheticDetourScenarios()[0];
    expect(() => replaySyntheticDetourTrace({ ...fixture, synthetic: false }))
      .toThrow('must set synthetic=true');
    expect(() => replaySyntheticDetourTrace({ ...fixture, tickMs: 15_000 }))
      .toThrow('must use 30- or 60-second ticks');
  });
});

describe('production-cadence stress coverage (synthetic, not ground truth)', () => {
  const positives = buildSyntheticDetourScenarios().filter((fixture) => fixture.category === 'positive');
  test.each(positives.map(f => [f.id, f]))('%s at one-minute sampling', (_id, fixture) => {
    const result = replaySyntheticDetourTrace({...fixture, tickMs:60000,
      ticks:fixture.ticks.filter((_, index) => index % 2 === 0),
    });
    expect(result.firstVisibleElapsedMs).toBe(60000);
    expect(result.pathEverShown).toBe(true);
    expect(result.skippedStopIds).toEqual(fixture.expected.skippedStopIds);
  });
  test.each(positives.map(f => [f.id, f]))('%s with buses 15 minutes apart', (_id, fixture) => {
    const ticks = [0, 1].flatMap(bus => fixture.ticks.map((tick, index) => ({
      vehicles: tick.vehicles.filter((_, vehicleIndex) => vehicleIndex === bus),
      timestampMs: fixture.startTimeMs + bus * 900000 + index * 30000,
    })));
    const result = replaySyntheticDetourTrace({...fixture, ticks});
    expect(result.timeline.slice(0,3).every(tick => !tick.visible)).toBe(true);
    expect(result.firstVisibleElapsedMs).toBe(900000);
    expect(result.pathEverShown).toBe(true);
    expect(result.skippedStopIds).toEqual(fixture.expected.skippedStopIds);
  });
  test('labels saved-output accuracy separately from live detector evidence', () => {
    const path = require('path');
    const {scoreDetourQualityCorpus} = require('../../scripts/detourQualityCorpus');
    const report = scoreDetourQualityCorpus(path.join(__dirname, '../../docs/detour-ground-truth/quality-corpus.json'));
    expect(report.evidenceCoverage).toEqual({
      detectionMetricSource:'saved-output-versus-labels', savedOutputCases:10,
      runtimeSnapshotReplays:1, syntheticTraces:15, labelledRawTraceReplays:0,
      currentDetectorAccuracyEstablished:false,
    });
    expect(report.productionReadiness.ready).toBe(false);
  });
});
