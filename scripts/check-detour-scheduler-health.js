#!/usr/bin/env node

const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  evaluateDetourSchedulerHealth,
} = require('../api-proxy/services/detourSchedulerHealth');
const {
  fetchLiveActiveDetours,
  loadEnvFile,
} = require('./detourGroundTruthValidator');

function parseArgs(argv) {
  const args = {
    service: 'apiproxy',
    region: 'us-central1',
    schedulerJob: 'bttp-detour-run-once',
    schedulerLocation: 'us-central1',
    lookbackMinutes: 10,
    maxDetourAgeMinutes: 15,
    json: false,
    skipActiveDetourFreshness: false,
    activeCollection: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const rawArg = argv[index];
    const [arg, inlineValue] = rawArg.includes('=')
      ? rawArg.split(/=(.*)/s, 2)
      : [rawArg, null];
    const readValue = () => {
      if (inlineValue != null) return inlineValue;
      const next = argv[index + 1];
      if (!next) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return next;
    };

    if (arg === '--service') args.service = readValue();
    else if (arg === '--region') args.region = readValue();
    else if (arg === '--scheduler-job') args.schedulerJob = readValue();
    else if (arg === '--scheduler-location') args.schedulerLocation = readValue();
    else if (arg === '--lookback-minutes') args.lookbackMinutes = Number(readValue());
    else if (arg === '--max-detour-age-minutes') args.maxDetourAgeMinutes = Number(readValue());
    else if (arg === '--json') args.json = true;
    else if (arg === '--active-collection') args.activeCollection = readValue();
    else if (arg === '--skip-active-detour-freshness') args.skipActiveDetourFreshness = true;
    else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${rawArg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Check detour scheduler health without exposing secrets.

Usage:
  node scripts/check-detour-scheduler-health.js [options]

Options:
  --service <name>                  Cloud Run service name (default: apiproxy)
  --region <region>                 Cloud Run region (default: us-central1)
  --scheduler-job <name>            Cloud Scheduler job (default: bttp-detour-run-once)
  --scheduler-location <location>   Cloud Scheduler location (default: us-central1)
  --lookback-minutes <n>            Log window to inspect (default: 10)
  --max-detour-age-minutes <n>      Max active-detour updatedAt age (default: 15)
  --active-collection <name>        Firestore collection to read. Defaults to EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION or activeDetours.
  --skip-active-detour-freshness    Skip Firestore freshness check
  --json                            Print JSON output
`);
}

function getGcloudCommand() {
  if (process.platform !== 'win32') return 'gcloud';
  return path.join(
    process.env.LOCALAPPDATA || '',
    'Google',
    'CloudSDK',
    'google-cloud-sdk',
    'bin',
    'gcloud.ps1'
  );
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runGcloud(args) {
  if (process.platform === 'win32') {
    const command = `& ${quotePowerShell(getGcloudCommand())} ${args.map(quotePowerShell).join(' ')}`;
    const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
    return execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encodedCommand], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  return execFileSync(getGcloudCommand(), args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function sha256Prefix(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function getCloudRunSchedulerToken({ service, region }) {
  const raw = runGcloud([
    'run',
    'services',
    'describe',
    service,
    `--region=${region}`,
    '--format=json',
  ]);
  const serviceJson = JSON.parse(raw);
  const env = serviceJson?.spec?.template?.spec?.containers?.[0]?.env || [];
  const token = env.find((item) => item.name === 'SCHEDULER_API_TOKEN')?.value || '';
  return {
    isSet: Boolean(token),
    length: token.length,
    hashPrefix: sha256Prefix(token),
    token,
  };
}

function getSchedulerHeaderToken({ schedulerJob, schedulerLocation }) {
  const raw = runGcloud([
    'scheduler',
    'jobs',
    'describe',
    schedulerJob,
    `--location=${schedulerLocation}`,
    '--format=json',
  ]);
  const jobJson = JSON.parse(raw);
  const token = jobJson?.httpTarget?.headers?.['x-scheduler-token'] || '';
  return {
    isSet: Boolean(token),
    length: token.length,
    hashPrefix: sha256Prefix(token),
    token,
  };
}

function getSchedulerLogEntries({ service, lookbackMinutes }) {
  const filter = [
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${service}"`,
  ].join(' AND ');
  const raw = runGcloud([
    'logging',
    'read',
    filter,
    `--freshness=${lookbackMinutes}m`,
    '--limit=200',
    '--format=json',
  ]);
  return JSON.parse(raw || '[]')
    .filter((entry) => String(entry.httpRequest?.requestUrl || '').includes('/api/detour-run-once'))
    .filter((entry) => String(entry.httpRequest?.userAgent || '').includes('Google-Cloud-Scheduler'))
    .map((entry) => ({
      timestamp: entry.timestamp,
      status: entry.httpRequest?.status,
      userAgent: entry.httpRequest?.userAgent,
    }));
}

function formatTime(value) {
  return value ? new Date(value).toISOString() : 'n/a';
}

function printText(result, tokenSummary, activeCollection) {
  const checks = result.checks;
  const lines = [
    `Detour scheduler health: ${result.ok ? 'PASS' : 'FAIL'}`,
    `- Scheduler token match: ${checks.schedulerTokenMatches.ok ? 'PASS' : 'FAIL'} (${checks.schedulerTokenMatches.reason})`,
    `- Recent scheduler 2xx: ${checks.recentSchedulerSuccess.ok ? 'PASS' : 'FAIL'} (${checks.recentSchedulerSuccess.count}; latest ${formatTime(checks.recentSchedulerSuccess.latestAt)})`,
    `- Recent scheduler 401s: ${checks.noRecentScheduler401.ok ? 'PASS' : 'FAIL'} (${checks.noRecentScheduler401.count}; latest ${formatTime(checks.noRecentScheduler401.latestAt)})`,
    `- ${activeCollection} freshness: ${checks.activeDetoursFresh.ok ? 'PASS' : 'FAIL'} (${checks.activeDetoursFresh.reason}; routes ${checks.activeDetoursFresh.activeDetourCount})`,
    `- Token fingerprints: Cloud Run ${tokenSummary.cloudRun.hashPrefix || 'missing'}, Scheduler ${tokenSummary.scheduler.hashPrefix || 'missing'} (prefixes only)`,
  ];
  if (checks.activeDetoursFresh.staleRoutes?.length) {
    lines.push(`- Stale ${activeCollection} routes: ${checks.activeDetoursFresh.staleRoutes.join(', ')}`);
  }
  console.log(lines.join('\n'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const env = {
    ...loadEnvFile('.env'),
    ...loadEnvFile(path.join(process.cwd(), 'api-proxy', '.env')),
    ...loadEnvFile(path.join(process.cwd(), 'api-proxy', '.env.barrie-transit-trip-plan-cc84e')),
  };
  const activeCollection =
    args.activeCollection ||
    env.EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION ||
    env.DETOUR_ACTIVE_COLLECTION ||
    'activeDetours';
  const cloudRunToken = getCloudRunSchedulerToken(args);
  const schedulerToken = getSchedulerHeaderToken(args);
  const tokenMatch = Boolean(cloudRunToken.token && cloudRunToken.token === schedulerToken.token);
  const logEntries = getSchedulerLogEntries(args);
  const activeDetours = args.skipActiveDetourFreshness
    ? {}
    : await fetchLiveActiveDetours({
      apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
      projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      collectionName: activeCollection,
    });

  const result = evaluateDetourSchedulerHealth({
    tokenMatch,
    logEntries,
    activeDetours,
    lookbackMs: args.lookbackMinutes * 60 * 1000,
    maxActiveDetourAgeMs: args.maxDetourAgeMinutes * 60 * 1000,
    enforceActiveDetourFreshness: !args.skipActiveDetourFreshness,
  });

  const tokenSummary = {
    cloudRun: {
      isSet: cloudRunToken.isSet,
      length: cloudRunToken.length,
      hashPrefix: cloudRunToken.hashPrefix,
    },
    scheduler: {
      isSet: schedulerToken.isSet,
      length: schedulerToken.length,
      hashPrefix: schedulerToken.hashPrefix,
    },
  };

  if (args.json) {
    console.log(JSON.stringify({ ...result, activeCollection, tokenSummary }, null, 2));
  } else {
    printText(result, tokenSummary, activeCollection);
  }

  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(`Detour scheduler health check failed: ${error.message}`);
  process.exit(1);
});
