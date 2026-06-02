const { spawn } = require('child_process');
const path = require('path');

const env = {
  ...process.env,
  EXPO_PUBLIC_API_PROXY_URL: 'http://localhost:3001',
  EXPO_PUBLIC_CORS_PROXY_URL: 'http://127.0.0.1:3001/proxy?url=',
  EXPO_PUBLIC_ENABLE_AUTO_DETOURS: 'true',
  EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION: 'activeDetoursV2',
};

const expoCli = path.join(__dirname, '..', 'node_modules', 'expo', 'bin', 'cli');
const child = spawn(process.execPath, [expoCli, 'start', '--web'], {
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`[web:dev] Failed to start Expo web: ${error.message}`);
  process.exit(1);
});
