#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { replayDetourV2Fixture } = require('./detourV2Replay');

function usage() {
  console.error(`
Usage:
  node scripts/replay-detour-v2-fixture.js <fixture.json>

Replays a compact V2 detour fixture and prints the active event summary.
`);
}

function loadFixture(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function main() {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    usage();
    process.exit(2);
  }

  const fixture = loadFixture(fixturePath);
  const summary = replayDetourV2Fixture(fixture);
  console.log(JSON.stringify({
    fixture: fixturePath,
    expected: fixture.expected || null,
    replay: summary,
  }, null, 2));

  if (summary.riderVisible !== false || summary.canShowDetourPath !== false) {
    console.error('Replay failed: fixture did not reproduce a backend-only hidden detour.');
    process.exit(1);
  }
}

main();
