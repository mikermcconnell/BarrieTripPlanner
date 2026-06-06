const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidStyles, withDangerousMod } = require('@expo/config-plugins');

const TRANSPARENT_SPLASH_XML = `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="@android:color/transparent"/>
</shape>
`;

function replaceSplashLogoReferences(xml) {
  return String(xml || '').replace(
    /@drawable\/splashscreen_logo/g,
    '@drawable/splashscreen_transparent'
  );
}

function setTransparentSplashStyle(styles) {
  return AndroidConfig.Styles.assignStylesValue(styles, {
    add: true,
    parent: {
      name: 'Theme.App.SplashScreen',
      parent: 'Theme.SplashScreen',
    },
    name: 'windowSplashScreenAnimatedIcon',
    value: '@drawable/splashscreen_transparent',
  });
}

function patchValuesXml(resRoot) {
  const valuesDir = path.join(resRoot, 'values');
  if (!fs.existsSync(valuesDir)) return;

  for (const fileName of fs.readdirSync(valuesDir)) {
    if (!fileName.endsWith('.xml')) continue;
    const filePath = path.join(valuesDir, fileName);
    const original = fs.readFileSync(filePath, 'utf8');
    const next = replaceSplashLogoReferences(original);
    if (next !== original) {
      fs.writeFileSync(filePath, next);
    }
  }
}

function writeTransparentSplashDrawable(resRoot) {
  const drawableDir = path.join(resRoot, 'drawable');
  fs.mkdirSync(drawableDir, { recursive: true });
  fs.writeFileSync(path.join(drawableDir, 'splashscreen_transparent.xml'), TRANSPARENT_SPLASH_XML);
}

function applyTransparentAndroidSplash(projectRoot) {
  const resRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
  if (!fs.existsSync(resRoot)) return;

  patchValuesXml(resRoot);
  writeTransparentSplashDrawable(resRoot);
}

const withTransparentAndroidSplash = (config) => {
  config = withAndroidStyles(config, (config) => {
    config.modResults = setTransparentSplashStyle(config.modResults);
    return config;
  });

  return withDangerousMod(config, [
    'android',
    (config) => {
      applyTransparentAndroidSplash(config.modRequest.projectRoot);
      return config;
    },
  ]);
};

module.exports = withTransparentAndroidSplash;
module.exports.TRANSPARENT_SPLASH_XML = TRANSPARENT_SPLASH_XML;
module.exports.applyTransparentAndroidSplash = applyTransparentAndroidSplash;
module.exports.replaceSplashLogoReferences = replaceSplashLogoReferences;
module.exports.setTransparentSplashStyle = setTransparentSplashStyle;
