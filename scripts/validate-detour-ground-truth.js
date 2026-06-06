#!/usr/bin/env node

const path = require('path');
const {
  fetchLiveActiveDetours,
  loadEnvFile,
  loadJsonFile,
  selectDetourForGroundTruth,
  validateDetourAgainstGroundTruth,
} = require('./detourGroundTruthValidator');

function parseArgs(argv) {
  const args = {
    fixture: 'docs/detour-ground-truth/route-10-mulcaster-simcoe-2026-05-26.json',
    source: 'live',
    activeDetoursJson: null,
    activeCollection: null,
  };
  let positionalIndex = 0;

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fixture') {
      args.fixture = argv[index + 1];
      index += 1;
    } else if (arg === '--source') {
      args.source = argv[index + 1];
      index += 1;
    } else if (arg === '--active-detours-json') {
      args.activeDetoursJson = argv[index + 1];
      args.source = 'json';
      index += 1;
    } else if (arg === '--active-collection') {
      args.activeCollection = argv[index + 1];
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (!String(arg).startsWith('--')) {
      if (positionalIndex === 0) {
        args.fixture = arg;
      } else if (positionalIndex === 1) {
        args.activeDetoursJson = arg;
        args.source = 'json';
      }
      positionalIndex += 1;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Validate activeDetours output against an operator-supplied ground-truth case.

Usage:
  node scripts/validate-detour-ground-truth.js --fixture docs/detour-ground-truth/route-10-mulcaster-simcoe-2026-05-26.json
  node scripts/validate-detour-ground-truth.js --active-detours-json path/to/active-detours.json

Options:
  --fixture <path>              Ground-truth JSON fixture.
  --source live|json            Source for active detour data. Defaults to live.
  --active-collection <name>    Firestore collection to read. Defaults to EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION or activeDetours.
  --active-detours-json <path>  Validate against a saved activeDetours map instead of Firestore.
`);
}

function printResult(result) {
  console.log(`Ground truth: ${result.id}`);
  console.log(`Route: ${result.routeId}`);
  console.log(`Result: ${result.pass ? 'PASS' : 'FAIL'}`);
  result.checks.forEach((check) => {
    const status = check.pass ? 'PASS' : 'FAIL';
    const details = Object.entries(check)
      .filter(([key]) => !['name', 'pass'].includes(key))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    console.log(`- ${status}: ${check.name}${details ? ` (${details})` : ''}`);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const fixturePath = path.resolve(process.cwd(), args.fixture);
  const groundTruth = loadJsonFile(fixturePath);
  let activeDetours;

  if (args.source === 'json' || args.activeDetoursJson) {
    if (!args.activeDetoursJson) {
      throw new Error('--active-detours-json is required when --source=json');
    }
    activeDetours = loadJsonFile(path.resolve(process.cwd(), args.activeDetoursJson));
  } else if (args.source === 'live') {
    const env = {
      ...process.env,
      ...loadEnvFile(),
      ...loadEnvFile(path.join(process.cwd(), 'api-proxy', '.env')),
      ...loadEnvFile(path.join(process.cwd(), 'api-proxy', '.env.barrie-transit-trip-plan-cc84e')),
    };
    activeDetours = await fetchLiveActiveDetours({
      apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY || env.FIREBASE_API_KEY,
      projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID,
      collectionName:
        args.activeCollection ||
        env.EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION ||
        env.DETOUR_ACTIVE_COLLECTION ||
        'activeDetours',
    });
  } else {
    throw new Error(`Unknown source: ${args.source}`);
  }

  const detour = selectDetourForGroundTruth(activeDetours, groundTruth);
  const result = validateDetourAgainstGroundTruth(detour, groundTruth);
  printResult(result);
  if (!result.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
