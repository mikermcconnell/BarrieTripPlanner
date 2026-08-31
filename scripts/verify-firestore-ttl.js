#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectId = 'barrie-transit-trip-plan-cc84e';
const firebaseCache = path.join(os.tmpdir(), 'bttp-firebase-cli-cache');
const firebaseArgs = ['--yes', 'firebase-tools@15.28.2', 'projects:list', '--json'];
const command = process.platform === 'win32' ? process.env.ComSpec : 'npx';
const commandArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npx.cmd', ...firebaseArgs]
  : firebaseArgs;
const authCheck = spawnSync(command, commandArgs, {
  cwd: path.resolve(__dirname, '..'),
  encoding: 'utf8',
  env: { ...process.env, npm_config_cache: firebaseCache },
  shell: false,
});

if (authCheck.error || authCheck.status !== 0) {
  process.stderr.write(authCheck.stderr || 'Firebase authentication check failed.\n');
  process.exit(1);
}

const projects = JSON.parse(authCheck.stdout.slice(authCheck.stdout.indexOf('{')));
if (!projects.result?.some((project) => project.projectId === projectId)) {
  throw new Error(`The authenticated Firebase account cannot access ${projectId}.`);
}

const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const accessToken = firebaseConfig.tokens?.access_token;
if (!accessToken) throw new Error('Firebase CLI did not provide an OAuth access token.');

async function verifyTtl(collectionGroup) {
  const fieldName = `projects/${projectId}/databases/(default)/collectionGroups/${collectionGroup}/fields/expiresAt`;
  const response = await fetch(`https://firestore.googleapis.com/v1/${fieldName}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Could not inspect Firestore TTL for ${collectionGroup}: HTTP ${response.status}`);
  }
  const field = await response.json();
  if (field.ttlConfig?.state !== 'ACTIVE') {
    throw new Error(`Firestore TTL is not active for ${collectionGroup}.expiresAt`);
  }
  console.log(`- ${collectionGroup}.expiresAt: ACTIVE`);
}

(async () => {
  await verifyTtl('appFeedback');
  await verifyTtl('appFeedbackRateLimits');
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
