'use strict';

const { getStaticData } = require('../gtfsLoader');
const { fetchNewsItems } = require('../newsFetcher');
const {
  buildGtfsSnapshot,
  getLatestSnapshot,
  saveLatestSnapshot,
} = require('../gtfsSnapshotStore');
const { buildOfficialBaselineImpactScan } = require('../officialBaselineImpactScan');
const {
  publishOfficialBaselineImpactCandidates,
} = require('../officialBaselineImpactPublisher');

function createOfficialBaselineImpactOps({
  getStaticData: loadStaticData = getStaticData,
  fetchNewsItems: loadNewsItems = fetchNewsItems,
  getLatestSnapshot: loadLatestSnapshot = getLatestSnapshot,
  saveLatestSnapshot: persistLatestSnapshot = saveLatestSnapshot,
  publishCandidates: persistCandidates = publishOfficialBaselineImpactCandidates,
  now = Date.now,
} = {}) {
  let lastResult = null;
  let running = false;

  async function runOnce({
    publishCandidates = false,
  } = {}) {
    if (running) {
      return {
        ok: false,
        status: 'already_running',
        message: 'Official baseline impact scan is already running.',
      };
    }

    running = true;
    const timestamp = now();
    try {
      const currentStaticData = await loadStaticData();
      const currentSnapshot = buildGtfsSnapshot(currentStaticData, { createdAt: timestamp });
      const previousSnapshot = await loadLatestSnapshot();

      if (!previousSnapshot) {
        await persistLatestSnapshot(currentSnapshot, { now: timestamp });
        lastResult = {
          ok: true,
          status: 'needs_initial_snapshot',
          changeCount: 0,
          significantChangeCount: 0,
          candidateCount: 0,
          publishedCount: 0,
          scannedAt: timestamp,
        };
        return lastResult;
      }

      const newsItems = await loadNewsItems();
      const scan = buildOfficialBaselineImpactScan({
        previousSnapshot,
        currentSnapshot,
        newsItems,
      });

      let publishResult = { publishedCount: 0, skipped: true, reason: 'publish_disabled' };
      if (publishCandidates && scan.candidates.length > 0) {
        publishResult = await persistCandidates(scan.candidates, { now: timestamp });
      }

      await persistLatestSnapshot(currentSnapshot, { now: timestamp });

      lastResult = {
        ok: true,
        status: scan.status,
        changeCount: scan.changeCount,
        significantChangeCount: scan.significantChangeCount,
        candidateCount: scan.candidateCount,
        candidates: scan.candidates,
        publishedCount: publishResult.publishedCount || 0,
        publishSkipped: Boolean(publishResult.skipped),
        scannedAt: timestamp,
      };
      return lastResult;
    } finally {
      running = false;
    }
  }

  function getStatus() {
    return {
      enabled: true,
      running,
      lastResult,
    };
  }

  return {
    getStatus,
    runOnce,
  };
}

module.exports = {
  createOfficialBaselineImpactOps,
};
