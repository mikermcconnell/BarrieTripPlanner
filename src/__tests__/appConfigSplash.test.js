const appBase = require('../../app.base.json');
const fs = require('fs');
const path = require('path');

describe('Expo splash configuration', () => {
  test('does not show the legacy bus image on app startup', () => {
    expect(appBase.expo.splash).toEqual({
      backgroundColor: '#ffffff',
    });
  });

  test('native Android splash does not reference the legacy bus logo', () => {
    const stylesXml = fs.readFileSync(
      path.join(__dirname, '../../android/app/src/main/res/values/styles.xml'),
      'utf8'
    );
    const launcherBackgroundXml = fs.readFileSync(
      path.join(__dirname, '../../android/app/src/main/res/drawable/ic_launcher_background.xml'),
      'utf8'
    );

    expect(stylesXml).toContain('@drawable/splashscreen_transparent');
    expect(stylesXml).not.toContain('@drawable/splashscreen_logo');
    expect(launcherBackgroundXml).not.toContain('@drawable/splashscreen_logo');
  });
});
