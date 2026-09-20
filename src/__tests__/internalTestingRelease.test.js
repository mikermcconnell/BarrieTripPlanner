const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('internal testing builds a store bundle on a separate update channel', () => {
  const eas = JSON.parse(read('eas.json'));
  expect(eas.build['internal-testing']).toMatchObject({
    extends: 'production', distribution: 'store', environment: 'production',
    channel: 'internal-testing', android: { buildType: 'app-bundle' },
    env: { EXPO_PUBLIC_ENABLE_ANDROID_TRIP_MAP_PREVIEW: 'true' },
  });
  expect(eas.submit['internal-testing'].android).toMatchObject({ track: 'internal', releaseStatus: 'completed' });
  expect(eas.build.production.channel).toBe('production');
  expect(eas.submit.production.android.track).toBe('production');
});

test('internal testing retains production environment and source-control safeguards', () => {
  expect(read('app.config.js')).toContain("['production', 'production-apk', 'internal-testing']");
  expect(read('scripts/preflight-android-production-env.js')).toContain("['production', 'production-apk', 'internal-testing'].includes(profile)");
  const gate = read('scripts/verify-production-readiness.ps1');
  expect(gate).toContain("$branch -notlike 'release/*'");
  expect(gate).toContain('$upstream -ne "origin/$branch"');
  expect(gate).toContain('Release source is not clean.');
  expect(gate).toContain('Release branch is not synchronized');
});
