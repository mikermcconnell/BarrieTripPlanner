'use strict';

const { createOfficialBaselineImpactOps } = require('./services/officialBaselineImpactOps');

const publishCandidatesByDefault = process.env.OFFICIAL_BASELINE_IMPACT_PUBLISH_CANDIDATES === 'true';
const ops = createOfficialBaselineImpactOps();

async function runOnce(options = {}) {
  return ops.runOnce({
    publishCandidates: options.publishCandidates ?? publishCandidatesByDefault,
  });
}

function getStatus() {
  return {
    ...ops.getStatus(),
    publishCandidatesByDefault,
  };
}

module.exports = {
  getStatus,
  runOnce,
};
