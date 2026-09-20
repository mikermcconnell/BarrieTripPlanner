const { spawnSync } = require('node:child_process');
const SentryCli = require('@sentry/cli');

const dsn = String(process.env.EXPO_PUBLIC_SENTRY_DSN || '').trim();

if (!dsn) {
  console.error('Missing EXPO_PUBLIC_SENTRY_DSN. Run this through the EAS production environment.');
  process.exit(1);
}

const result = spawnSync(
  SentryCli.getPath(),
  [
    'send-event',
    '--message',
    'BTTP production monitoring verification',
    '--level',
    'info',
    '--platform',
    'javascript',
    '--env',
    'production-verification',
    '--release',
    'barrie-transit-planner@1.0.9',
    '--tag',
    'verification:sentry-setup',
    '--no-environ',
  ],
  {
    env: {
      ...process.env,
      SENTRY_DSN: dsn,
    },
    encoding: 'utf8',
  }
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error) {
  console.error(`Could not run Sentry CLI: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
