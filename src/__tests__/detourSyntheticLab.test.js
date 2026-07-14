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
    expect(() => replaySyntheticDetourTrace({ ...fixture, tickMs: 60_000 }))
      .toThrow('must use 30-second ticks');
  });
});
