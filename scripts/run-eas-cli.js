#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const easCache = path.join(os.tmpdir(), 'bttp-eas-cli-cache');
const easArgs = ['--yes', 'eas-cli@23.1.0', ...process.argv.slice(2)];
const command = process.platform === 'win32' ? process.env.ComSpec : 'npx';
const commandArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npx.cmd', ...easArgs]
  : easArgs;
const result = spawnSync(
  command,
  commandArgs,
  {
    env: { ...process.env, npm_config_cache: easCache },
    stdio: 'inherit',
    shell: false,
  }
);

if (result.error) {
  console.error(`Could not start the pinned EAS CLI: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
