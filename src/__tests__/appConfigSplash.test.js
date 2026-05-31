const appBase = require('../../app.base.json');
const fs = require('fs');
const path = require('path');

describe('Expo splash configuration', () => {
  test('does not show the legacy bus image on app startup', () => {
    expect(appBase.expo.splash).toEqual({
      backgroundColor: '#ffffff',
    });
  });

  test('native Android splash does not reference the legacy bus logo when native files exist', () => {
    const stylesPath = path.join(__dirname, '../../android/app/src/main/res/values/styles.xml');
    const launcherBackgroundPath = path.join(
      __dirname,
      '../../android/app/src/main/res/drawable/ic_launcher_background.xml'
    );

    if (!fs.existsSync(stylesPath) || !fs.existsSync(launcherBackgroundPath)) {
      return;
    }

    const stylesXml = fs.readFileSync(stylesPath, 'utf8');
    const launcherBackgroundXml = fs.readFileSync(launcherBackgroundPath, 'utf8');

    expect(stylesXml).toContain('@drawable/splashscreen_transparent');
    expect(stylesXml).not.toContain('@drawable/splashscreen_logo');
    expect(launcherBackgroundXml).not.toContain('@drawable/splashscreen_logo');
  });
});
