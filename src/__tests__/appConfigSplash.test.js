const appBase = require('../../app.base.json');
const fs = require('fs');
const path = require('path');
const {
  replaceSplashLogoReferences,
  setTransparentSplashStyle,
  TRANSPARENT_SPLASH_XML,
} = require('../../plugins/withTransparentAndroidSplash');

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

  test('EAS prebuild patches Android splash logo references to transparent drawable', () => {
    expect(appBase.expo.plugins).toContain('./plugins/withTransparentAndroidSplash');
    expect(replaceSplashLogoReferences('@drawable/splashscreen_logo')).toBe(
      '@drawable/splashscreen_transparent'
    );
    const styles = setTransparentSplashStyle({
      resources: {
        style: [{
          $: { name: 'Theme.App.SplashScreen', parent: 'Theme.SplashScreen' },
          item: [{ $: { name: 'windowSplashScreenAnimatedIcon' }, _: '@drawable/splashscreen_logo' }],
        }],
      },
    });
    const splashStyle = styles.resources.style.find(
      (style) => style.$.name === 'Theme.App.SplashScreen'
    );
    expect(splashStyle.item.find(
      (item) => item.$.name === 'windowSplashScreenAnimatedIcon'
    )._).toBe('@drawable/splashscreen_transparent');
    expect(TRANSPARENT_SPLASH_XML).toContain('@android:color/transparent');
  });
});
