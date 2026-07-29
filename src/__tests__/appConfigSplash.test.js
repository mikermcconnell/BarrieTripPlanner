const appBase = require('../../app.base.json');
const fs = require('fs');
const path = require('path');

describe('Expo splash configuration', () => {
  test('shows the bundled app icon on the startup background', () => {
    expect(appBase.expo.splash).toEqual({
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#F7FBFF',
    });

    expect(appBase.expo.plugins).toContainEqual([
      'expo-splash-screen',
      expect.objectContaining({
        image: './assets/splash-icon.png',
        backgroundColor: '#F7FBFF',
      }),
    ]);
  });

  test('native Android splash uses the generated startup icon when native files exist', () => {
    const stylesPath = path.join(__dirname, '../../android/app/src/main/res/values/styles.xml');

    if (!fs.existsSync(stylesPath)) {
      return;
    }

    const stylesXml = fs.readFileSync(stylesPath, 'utf8');
    expect(stylesXml).toContain('@drawable/splashscreen_logo');
    expect(stylesXml).not.toContain('@drawable/splashscreen_transparent');
  });
});
