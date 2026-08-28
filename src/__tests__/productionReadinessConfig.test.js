const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('production release safeguards', () => {
  test('production enables auto-detours only with explicit rollout approval', () => {
    const eas = JSON.parse(read('eas.json'));
    expect(eas.build.production.env.EXPO_PUBLIC_ENABLE_AUTO_DETOURS).toBe('true');
    expect(eas.build.production.env.EXPO_PUBLIC_AUTO_DETOURS_APPROVED).toBe('true');
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
