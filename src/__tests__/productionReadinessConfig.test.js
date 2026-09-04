const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('production release safeguards', () => {
  test('production audit exceptions are limited to Metro image parsing advisories', () => {
    const allowlist = require('../../release-audit-allowlist.json');
    expect(Object.keys(allowlist.advisories).sort()).toEqual(['1138808', '1138809']);
    expect(new Set(Object.values(allowlist.advisories).map((entry) => entry.package))).toEqual(new Set(['image-size']));
  });

  test('production enables auto-detours with explicit rollout approval', () => {
    const eas = JSON.parse(read('eas.json'));
    expect(eas.build.production.env.EXPO_PUBLIC_ENABLE_AUTO_DETOURS).toBe('true');
    expect(eas.build.production.env.EXPO_PUBLIC_AUTO_DETOURS_APPROVED).toBe('true');
  });

  test('keeps one monotonic production release identity', () => {
    const packageJson = JSON.parse(read('package.json'));
    const app = JSON.parse(read('app.base.json')).expo;
    const eas = JSON.parse(read('eas.json'));
    const release = JSON.parse(read('release.json'));

    expect(packageJson.version).toBe(release.current.version);
    expect(app.version).toBe(release.current.version);
    expect(app.android.versionCode).toBe(release.current.androidVersionCode);
    expect(release.current.androidVersionCode).toBeGreaterThan(release.previousProduction.androidVersionCode);
    expect(eas.cli.appVersionSource).toBe('local');
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(eas.submit.production.android.track).toBe('production');
  });

  test('rejects a mismatched app-version override', () => {
    const { getReleaseIdentityErrors } = require('../../scripts/verify-release-identity');
    expect(getReleaseIdentityErrors({ env: { EXPO_PUBLIC_APP_VERSION: '1.0.8' } })).toEqual(
      expect.arrayContaining([expect.stringContaining('disagrees with release version')])
    );
  });

  test('runs EAS through the pinned isolated-cache wrapper', () => {
    const packageJson = JSON.parse(read('package.json'));
    expect(packageJson.scripts['prebuild:android:eas']).toContain('scripts/run-eas-cli.js');
    expect(read('scripts/build-release.ps1')).toContain('node scripts/run-eas-cli.js build');
    expect(read('scripts/run-eas-cli.js')).toContain("'eas-cli@23.1.0'");
    expect(read('scripts/run-eas-cli.js')).toContain("'bttp-eas-cli-cache'");
  });

  test('verifies Firestore TTL through pinned Firebase tooling', () => {
    const script = read('scripts/verify-firestore-ttl.js');
    expect(script).toContain('firebase-tools@15.28.2');
    expect(script).toContain("await verifyTtl('appFeedback')");
    expect(script).toContain("await verifyTtl('appFeedbackRateLimits')");
  });

  test('blocks Android permissions that are not needed by the app', () => {
    const app = JSON.parse(read('app.base.json')).expo;
    expect(app.android.blockedPermissions).toEqual(expect.arrayContaining([
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ]));

    const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
    if (fs.existsSync(manifestPath)) {
      const manifest = fs.readFileSync(manifestPath, 'utf8');
      for (const permission of app.android.blockedPermissions) {
        expect(manifest).toContain(`android:name="${permission}"`);
      }
      expect(manifest.match(/tools:node="remove"/g)).toHaveLength(3);
    }
  });

  test('declares Android visibility for secure web and email links', () => {
    const app = JSON.parse(read('app.base.json')).expo;
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(app.plugins).toContain('./plugins/withExternalLinkQueries');
    expect(manifest).toContain('android:scheme="https"');
    expect(manifest).toContain('android:scheme="mailto"');
  });

  test('ships the required legal pages from the dedicated hosting directory', () => {
    const firebase = JSON.parse(read('firebase.json'));
    expect(firebase.hosting.public).toBe('legal-public');
    for (const page of ['privacy-policy.html', 'terms-of-service.html', 'account-deletion.html']) {
      expect(fs.existsSync(path.join(root, 'legal-public', page))).toBe(true);
    }
  });

  test('links account deletion information from settings and about', () => {
    expect(read('src/screens/SettingsScreen.js')).toContain('APP_CONFIG.ACCOUNT_DELETION_URL');
    expect(read('src/screens/AboutScreen.js')).toContain('APP_CONFIG.ACCOUNT_DELETION_URL');
  });

  test('labels Service Barrie as the transit contact rather than app support', () => {
    const constants = read('src/config/constants.js');
    expect(constants).toContain("APP_CONTACT_EMAIL: 'mybarrietransit@outlook.com'");
    expect(constants).toContain("TRANSIT_CONTACT_EMAIL: 'ServiceBarrie@barrie.ca'");
    expect(constants).not.toContain('SUPPORT_EMAIL');
    expect(read('src/screens/HelpSupportScreen.js')).toContain('Contact Barrie Transit');
  });

  test('uses the approved independent publisher and public app name', () => {
    const expo = JSON.parse(read('app.base.json')).expo;
    expect(expo.name).toBe('MyBarrie Transit');
    expect(expo.android.package).toBe('com.barrietransit.planner');
    expect(expo.ios.bundleIdentifier).toBe('com.barrietransit.planner');
    const buildGradlePath = path.join(root, 'android/app/build.gradle');
    if (fs.existsSync(buildGradlePath)) {
      expect(fs.readFileSync(buildGradlePath, 'utf8')).toContain("applicationId 'com.barrietransit.planner'");
    }
    expect(read('legal/privacy-policy.md')).toContain('independently operated by Mike McMike');
    expect(read('legal/GOOGLE-PLAY-CONSOLE.md')).toContain('| **Developer name** | Mike McMike |');
  });
});
