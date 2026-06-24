#!/usr/bin/env node
'use strict';

const { loadProxyEnvFiles } = require('../config/env');

const { runDetourEmailMonitor } = require('../services/detourEmailMonitor');

loadProxyEnvFiles();

async function main() {
  const result = await runDetourEmailMonitor();
  console.log('[detour-email-monitor]', JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[detour-email-monitor] Failed:', error.message || error);
  process.exit(1);
});
