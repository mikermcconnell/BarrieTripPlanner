'use strict';

const { buildGtfsBaselineChanges } = require('./gtfsBaselineChangeDetector');
const { buildOfficialBaselineImpactCandidates } = require('./officialBaselineImpactMatcher');

function emptyScan(status) {
  return {
    status,
    changes: [],
    significantChanges: [],
    candidates: [],
    changeCount: 0,
    significantChangeCount: 0,
    candidateCount: 0,
  };
}

function buildOfficialBaselineImpactScan({
  previousSnapshot,
  currentSnapshot,
  newsItems = [],
} = {}) {
  if (!previousSnapshot) {
    return emptyScan('needs_initial_snapshot');
  }
  if (!currentSnapshot) {
    return emptyScan('missing_current_snapshot');
  }

  const diff = buildGtfsBaselineChanges({
    previous: previousSnapshot,
    current: currentSnapshot,
  });
  const candidates = buildOfficialBaselineImpactCandidates({
    changes: diff.significantChanges,
    newsItems,
  });

  return {
    status: 'evaluated',
    changes: diff.changes,
    significantChanges: diff.significantChanges,
    candidates,
    changeCount: diff.changes.length,
    significantChangeCount: diff.significantChanges.length,
    candidateCount: candidates.length,
  };
}

module.exports = {
  buildOfficialBaselineImpactScan,
};
