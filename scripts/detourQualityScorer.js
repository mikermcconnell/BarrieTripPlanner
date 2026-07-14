const {
  normalizeActiveDetourEntries,
  selectDetourForGroundTruth,
  validateDetourAgainstGroundTruth,
} = require('./detourGroundTruthValidator');

const DEFAULT_PRODUCTION_THRESHOLDS = Object.freeze({
  minLabelledCases: 20,
  minPositiveCases: 10,
  minNegativeCases: 10,
  minPathCases: 10,
  minStopImpactCases: 5,
  minSafetyReplays: 5,
  minPrecision: 0.9,
  minRecall: 0.9,
  minOutputPassRate: 0.95,
  minPathPassRate: 0.95,
  minStopImpactPassRate: 0.95,
  requiredSafetyReplayPassRate: 1,
});

function normalizeRouteId(value) {
  return String(value ?? '').trim().toUpperCase();
}

function roundRate(numerator, denominator) {
  if (!denominator) return null;
  return Number((numerator / denominator).toFixed(4));
}

function visibleRouteEntries(activeDetours, routeId) {
  const expectedRouteId = normalizeRouteId(routeId);
  return normalizeActiveDetourEntries(activeDetours).filter((detour) => (
    normalizeRouteId(detour.routeId) === expectedRouteId && detour.riderVisible !== false
  ));
}

function progressBounds(detour = {}) {
  const sources = [
    detour.eventWindow,
    detour.detourZone,
    detour.clearWindow,
    Array.isArray(detour.segments) ? detour.segments[0] : null,
  ];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const start = Number(
      source.coreStartProgressMeters ??
      source.sourceStartProgressMeters ??
      source.startProgressMeters
    );
    const end = Number(
      source.coreEndProgressMeters ??
      source.sourceEndProgressMeters ??
      source.endProgressMeters
    );
    const shapeId = source.shapeId || detour.shapeId;
    if (shapeId && Number.isFinite(start) && Number.isFinite(end)) {
      return { shapeId: String(shapeId), start: Math.min(start, end), end: Math.max(start, end) };
    }
  }
  return null;
}

function windowsAreEquivalent(left, right) {
  if (!left || !right || left.shapeId !== right.shapeId) return false;
  const leftSpan = Math.max(1, left.end - left.start);
  const rightSpan = Math.max(1, right.end - right.start);
  const overlap = Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
  return overlap / Math.min(leftSpan, rightSpan) >= 0.8 &&
    Math.abs(left.start - right.start) <= 100 &&
    Math.abs(left.end - right.end) <= 100;
}

function detoursAreEquivalent(left, right) {
  if (!left || !right || normalizeRouteId(left.routeId) !== normalizeRouteId(right.routeId)) {
    return false;
  }
  const leftSharedId = String(left.sharedDetourEventId || '').trim();
  const rightSharedId = String(right.sharedDetourEventId || '').trim();
  if (leftSharedId && rightSharedId && leftSharedId === rightSharedId) return true;
  return windowsAreEquivalent(progressBounds(left), progressBounds(right));
}

function findDuplicateGroups(entries = []) {
  const parent = entries.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      if (detoursAreEquivalent(entries[left], entries[right])) union(left, right);
    }
  }

  const groups = new Map();
  entries.forEach((entry, index) => {
    const root = find(index);
    const group = groups.get(root) || [];
    group.push(entry);
    groups.set(root, group);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

function checksPass(result, prefix) {
  const checks = result.checks.filter((check) => check.name.startsWith(prefix));
  return checks.length === 0 ? null : checks.every((check) => check.pass);
}

function compareReplay(expected = {}, actual = {}) {
  const failures = Object.entries(expected).filter(([key, value]) => (
    JSON.stringify(actual?.[key]) !== JSON.stringify(value)
  )).map(([key, expectedValue]) => ({
    field: key,
    expected: expectedValue,
    actual: actual?.[key] ?? null,
  }));
  return { pass: failures.length === 0, failures };
}

function compareSyntheticTrace(expected = {}, actual = {}, fixture = {}) {
  const checks = [];
  const add = (field, pass, expectedValue, actualValue) => checks.push({
    field,
    pass: Boolean(pass),
    expected: expectedValue,
    actual: actualValue,
  });

  if (expected.visibility === 'visible') {
    add('visibility', actual.firstVisibleTick != null, 'visible', actual.firstVisibleTick);
  } else if (expected.visibility === 'never-visible') {
    add('visibility', actual.firstVisibleTick == null, 'never-visible', actual.firstVisibleTick);
  }
  if (expected.visibleByTick != null && Number.isFinite(Number(expected.visibleByTick))) {
    add('visibleByTick', actual.firstVisibleTick != null && actual.firstVisibleTick <= Number(expected.visibleByTick), expected.visibleByTick, actual.firstVisibleTick);
  }
  if (expected.path === 'shown') {
    add('path', actual.pathEverShown === true, 'shown', actual.pathEverShown ? 'shown' : 'suppressed');
  } else if (expected.path === 'suppressed') {
    add('path', actual.pathEverShown === false, 'suppressed', actual.pathEverShown ? 'shown' : 'suppressed');
  }
  if (Array.isArray(expected.skippedStopIds)) {
    const expectedIds = [...expected.skippedStopIds].sort();
    const actualIds = [...(actual.skippedStopIds || [])].sort();
    add('skippedStopIds', JSON.stringify(actualIds) === JSON.stringify(expectedIds), expectedIds, actualIds);
  }
  if (expected.finalState && expected.finalState !== 'active-or-absent') {
    add('finalState', actual.finalState === expected.finalState, expected.finalState, actual.finalState);
  } else if (expected.finalState === 'active-or-absent') {
    add('finalState', ['active', 'absent'].includes(actual.finalState), expected.finalState, actual.finalState);
  }
  if (Number.isFinite(Number(expected.maxVisibleEventCount))) {
    add('maxVisibleEventCount', actual.maxVisibleEventCount <= Number(expected.maxVisibleEventCount), expected.maxVisibleEventCount, actual.maxVisibleEventCount);
  }
  if (Number.isFinite(Number(expected.minConsecutiveVisibleTicks))) {
    add('minConsecutiveVisibleTicks', actual.longestVisibleRun >= Number(expected.minConsecutiveVisibleTicks), expected.minConsecutiveVisibleTicks, actual.longestVisibleRun);
  }
  if (Number.isFinite(Number(expected.clearByTick))) {
    const clearTick = actual.timeline.find((tick) => (
      tick.tick > (actual.firstVisibleTick ?? -1) && tick.state === 'absent'
    ))?.tick ?? null;
    add('clearByTick', clearTick != null && clearTick <= Number(expected.clearByTick), expected.clearByTick, clearTick);
  }
  if (Array.isArray(expected.forbiddenVisibleRouteIds)) {
    const found = actual.allVisibleRouteIds.filter((routeId) => expected.forbiddenVisibleRouteIds.includes(routeId));
    add('forbiddenVisibleRouteIds', found.length === 0, expected.forbiddenVisibleRouteIds, found);
  }
  if (expected.restartContinuity === true) {
    const restartTick = fixture.ticks?.findIndex((tick) => tick?.restart === true) ?? -1;
    const before = restartTick > 0 ? actual.timeline[restartTick - 1]?.visible === true : false;
    const after = restartTick >= 0 ? actual.timeline[restartTick]?.visible === true : false;
    add('restartContinuity', before && after && actual.restartCount > 0, true, { before, after, restartCount: actual.restartCount });
  }

  return {
    pass: checks.every((check) => check.pass),
    checks,
    failures: checks.filter((check) => !check.pass),
  };
}

function scoreDetourQualityCases(cases = [], thresholdOverrides = {}) {
  const thresholds = { ...DEFAULT_PRODUCTION_THRESHOLDS, ...thresholdOverrides };
  const detection = {
    labelledCaseCount: 0,
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
    precision: null,
    recall: null,
  };
  const outputResults = [];
  const safetyResults = [];
  const syntheticResults = [];
  const duplicateGroups = [];
  const caseResults = [];

  for (const qualityCase of Array.isArray(cases) ? cases : []) {
    if (qualityCase?.syntheticTrace) {
      const comparison = compareSyntheticTrace(
        qualityCase.syntheticTrace.expected,
        qualityCase.syntheticTrace.actual,
        qualityCase.syntheticTrace.fixture
      );
      const result = {
        id: qualityCase.id,
        category: qualityCase.syntheticTrace.category || 'uncategorized',
        routeId: qualityCase.syntheticTrace.actual?.routeId || null,
        firstVisibleTick: qualityCase.syntheticTrace.actual?.firstVisibleTick ?? null,
        ...comparison,
      };
      syntheticResults.push(result);
      caseResults.push({ ...result, type: 'synthetic-detector-trace' });
      continue;
    }
    if (qualityCase?.replay) {
      const replayResult = compareReplay(qualityCase.replay.expected, qualityCase.replay.actual);
      safetyResults.push(replayResult);
      caseResults.push({ id: qualityCase.id, type: 'safety-replay', ...replayResult });
      continue;
    }

    const groundTruth = qualityCase?.groundTruth || {};
    const expectedActive = String(groundTruth.status || 'active').toLowerCase() !== 'inactive';
    const visibleEntries = visibleRouteEntries(qualityCase?.activeDetours, groundTruth.routeId);
    const actualVisible = visibleEntries.length > 0;
    detection.labelledCaseCount += 1;
    if (expectedActive && actualVisible) detection.truePositive += 1;
    if (expectedActive && !actualVisible) detection.falseNegative += 1;
    if (!expectedActive && actualVisible) detection.falsePositive += 1;
    if (!expectedActive && !actualVisible) detection.trueNegative += 1;

    const duplicates = findDuplicateGroups(visibleEntries);
    duplicateGroups.push(...duplicates.map((group) => ({
      caseId: qualityCase.id,
      routeId: normalizeRouteId(groundTruth.routeId),
      documentIds: group.map((entry) => entry.id || entry.eventId || entry.detourEventId).filter(Boolean),
    })));

    if (!expectedActive) {
      caseResults.push({
        id: qualityCase.id,
        type: 'labelled-output',
        pass: !actualVisible,
        classification: actualVisible ? 'false-positive' : 'true-negative',
        duplicateDocumentIds: duplicates.flatMap((group) => group.map((entry) => entry.id)).filter(Boolean),
      });
      continue;
    }

    const selected = selectDetourForGroundTruth(visibleEntries, groundTruth);
    const validation = validateDetourAgainstGroundTruth(selected, groundTruth);
    if (actualVisible) outputResults.push(validation);
    caseResults.push({
      id: qualityCase.id,
      type: 'labelled-output',
      pass: validation.pass && duplicates.length === 0,
      classification: actualVisible ? 'true-positive' : 'false-negative',
      validation,
      duplicateDocumentIds: duplicates.flatMap((group) => group.map((entry) => entry.id)).filter(Boolean),
    });
  }

  detection.precision = roundRate(
    detection.truePositive,
    detection.truePositive + detection.falsePositive
  );
  detection.recall = roundRate(
    detection.truePositive,
    detection.truePositive + detection.falseNegative
  );

  const pathResults = outputResults.map((result) => checksPass(result, 'detour path')).filter((value) => value != null);
  const stopResults = outputResults.map((result) => checksPass(result, 'skipped stop')).filter((value) => value != null);
  const safetyPassCount = safetyResults.filter((result) => result.pass).length;
  const outputPassCount = outputResults.filter((result) => result.pass).length;
  const duplicateDocumentCount = duplicateGroups.reduce(
    (total, group) => total + Math.max(0, group.documentIds.length - 1),
    0
  );
  const outputQuality = {
    evaluatedCount: outputResults.length,
    passCount: outputPassCount,
    passRate: roundRate(outputPassCount, outputResults.length),
    pathCaseCount: pathResults.length,
    pathPassRate: roundRate(pathResults.filter(Boolean).length, pathResults.length),
    stopImpactCaseCount: stopResults.length,
    stopImpactPassRate: roundRate(stopResults.filter(Boolean).length, stopResults.length),
  };
  const safetyReplays = {
    evaluatedCount: safetyResults.length,
    passCount: safetyPassCount,
    passRate: roundRate(safetyPassCount, safetyResults.length),
  };
  const positiveCaseCount = detection.truePositive + detection.falseNegative;
  const negativeCaseCount = detection.trueNegative + detection.falsePositive;
  const readinessChecks = [
    ['minimum-labelled-cases', detection.labelledCaseCount >= thresholds.minLabelledCases],
    ['minimum-positive-cases', positiveCaseCount >= thresholds.minPositiveCases],
    ['minimum-negative-cases', negativeCaseCount >= thresholds.minNegativeCases],
    ['minimum-path-cases', outputQuality.pathCaseCount >= thresholds.minPathCases],
    ['minimum-stop-impact-cases', outputQuality.stopImpactCaseCount >= thresholds.minStopImpactCases],
    ['minimum-safety-replays', safetyReplays.evaluatedCount >= thresholds.minSafetyReplays],
    ['precision-target', detection.precision != null && detection.precision >= thresholds.minPrecision],
    ['recall-target', detection.recall != null && detection.recall >= thresholds.minRecall],
    ['output-quality-target', outputQuality.passRate != null && outputQuality.passRate >= thresholds.minOutputPassRate],
    ['path-quality-target', outputQuality.pathPassRate != null && outputQuality.pathPassRate >= thresholds.minPathPassRate],
    ['stop-impact-target', outputQuality.stopImpactPassRate != null && outputQuality.stopImpactPassRate >= thresholds.minStopImpactPassRate],
    ['safety-replay-target', safetyReplays.passRate != null && safetyReplays.passRate >= thresholds.requiredSafetyReplayPassRate],
    ['zero-duplicate-publications', duplicateDocumentCount === 0],
  ];
  const unmet = readinessChecks.filter(([, passed]) => !passed).map(([id]) => id);
  const regressionPass = caseResults.every((result) => result.pass);
  const syntheticPassCount = syntheticResults.filter((result) => result.pass).length;
  const syntheticCategorySummary = Object.fromEntries(
    ['positive', 'safety', 'lifecycle'].map((category) => {
      const results = syntheticResults.filter((result) => result.category === category);
      const passCount = results.filter((result) => result.pass).length;
      return [category, {
        scenarioCount: results.length,
        passCount,
        passRate: roundRate(passCount, results.length),
      }];
    })
  );
  const syntheticPathChecks = syntheticResults.flatMap((result) => result.checks)
    .filter((check) => check.field === 'path');
  const syntheticStopChecks = syntheticResults.flatMap((result) => result.checks)
    .filter((check) => check.field === 'skippedStopIds');
  const syntheticClearChecks = syntheticResults.flatMap((result) => result.checks)
    .filter((check) => check.field === 'clearByTick');
  const positiveDetectionTicks = syntheticResults
    .filter((result) => result.category === 'positive' && result.firstVisibleTick != null)
    .map((result) => result.firstVisibleTick);

  return {
    schemaVersion: 1,
    caseCount: Array.isArray(cases) ? cases.length : 0,
    pass: regressionPass,
    regressionPass,
    productionReadiness: {
      ready: unmet.length === 0,
      thresholds,
      sample: {
        labelledCaseCount: detection.labelledCaseCount,
        positiveCaseCount,
        negativeCaseCount,
        pathCaseCount: outputQuality.pathCaseCount,
        stopImpactCaseCount: outputQuality.stopImpactCaseCount,
        safetyReplayCount: safetyReplays.evaluatedCount,
      },
      unmet,
    },
    detection,
    outputQuality,
    safetyReplays,
    syntheticLab: {
      testOnly: true,
      countsTowardProductionReadiness: false,
      scenarioCount: syntheticResults.length,
      passCount: syntheticPassCount,
      passRate: roundRate(syntheticPassCount, syntheticResults.length),
      categories: syntheticCategorySummary,
      pathCheckCount: syntheticPathChecks.length,
      pathPassRate: roundRate(syntheticPathChecks.filter((check) => check.pass).length, syntheticPathChecks.length),
      stopImpactCheckCount: syntheticStopChecks.length,
      stopImpactPassRate: roundRate(syntheticStopChecks.filter((check) => check.pass).length, syntheticStopChecks.length),
      clearCheckCount: syntheticClearChecks.length,
      clearPassRate: roundRate(syntheticClearChecks.filter((check) => check.pass).length, syntheticClearChecks.length),
      averagePositiveFirstVisibleTick: positiveDetectionTicks.length > 0
        ? Number((positiveDetectionTicks.reduce((sum, value) => sum + value, 0) / positiveDetectionTicks.length).toFixed(2))
        : null,
      results: syntheticResults,
    },
    duplicates: {
      duplicateGroupCount: duplicateGroups.length,
      duplicateDocumentCount,
      groups: duplicateGroups,
    },
    caseResults,
  };
}

module.exports = {
  DEFAULT_PRODUCTION_THRESHOLDS,
  compareSyntheticTrace,
  detoursAreEquivalent,
  findDuplicateGroups,
  scoreDetourQualityCases,
};
