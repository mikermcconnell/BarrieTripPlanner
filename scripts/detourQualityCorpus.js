const fs = require('fs');
const path = require('path');

const { loadJsonFile } = require('./detourGroundTruthValidator');
const { scoreDetourQualityCases } = require('./detourQualityScorer');
const { replayDetourV2Fixture } = require('./detourV2Replay');
const { replaySyntheticDetourTrace } = require('./detourV2Replay');
const { buildSyntheticDetourScenarios } = require('./detourSyntheticScenarios');

function resolveFromManifest(manifestPath, relativePath) {
  if (!relativePath) throw new Error(`Missing file reference in ${manifestPath}`);
  return path.resolve(path.dirname(manifestPath), relativePath);
}

function loadDetourQualityCorpus(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const manifest = loadJsonFile(absoluteManifestPath);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases)) {
    throw new Error('Detour quality corpus must use schemaVersion 1 and contain a cases array');
  }

  return manifest.cases.flatMap((entry) => {
    if (entry.type === 'ground-truth-output') {
      return {
        id: entry.id,
        groundTruth: loadJsonFile(resolveFromManifest(absoluteManifestPath, entry.groundTruth)),
        activeDetours: loadJsonFile(resolveFromManifest(absoluteManifestPath, entry.activeDetours)),
      };
    }
    if (entry.type === 'detector-replay') {
      const fixture = loadJsonFile(resolveFromManifest(absoluteManifestPath, entry.fixture));
      return {
        id: entry.id,
        replay: {
          expected: fixture.expected || {},
          actual: replayDetourV2Fixture(fixture),
        },
      };
    }
    if (entry.type === 'synthetic-detector-suite') {
      return buildSyntheticDetourScenarios().map((fixture) => ({
        id: fixture.id,
        syntheticTrace: {
          category: fixture.category,
          expected: fixture.expected || {},
          actual: replaySyntheticDetourTrace(fixture),
          fixture,
        },
      }));
    }
    throw new Error(`Unsupported detour quality case type: ${entry.type || '(missing)'}`);
  });
}

function scoreDetourQualityCorpus(manifestPath) {
  return scoreDetourQualityCases(loadDetourQualityCorpus(manifestPath));
}

function writeDetourQualityReport(report, outputPath) {
  const absoluteOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return absoluteOutputPath;
}

module.exports = {
  loadDetourQualityCorpus,
  scoreDetourQualityCorpus,
  writeDetourQualityReport,
};
