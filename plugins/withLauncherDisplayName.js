const { AndroidConfig, withInfoPlist, withStringsXml } = require('@expo/config-plugins');

const DEFAULT_LAUNCHER_NAME = 'MyBarrie';

function getLauncherName(options = {}) {
  return String(options.name || options.launcherName || DEFAULT_LAUNCHER_NAME).trim() || DEFAULT_LAUNCHER_NAME;
}

function applyAndroidLauncherName(stringsJson, launcherName) {
  return AndroidConfig.Strings.setStringItem(
    [
      AndroidConfig.Resources.buildResourceItem({
        name: 'app_name',
        value: launcherName,
      }),
    ],
    stringsJson
  );
}

function applyIosLauncherName(infoPlist, launcherName) {
  return {
    ...infoPlist,
    CFBundleDisplayName: launcherName,
  };
}

const withLauncherDisplayName = (config, options = {}) => {
  const launcherName = getLauncherName(options);

  config = withStringsXml(config, (config) => {
    config.modResults = applyAndroidLauncherName(config.modResults, launcherName);
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults = applyIosLauncherName(config.modResults, launcherName);
    return config;
  });

  return config;
};

module.exports = withLauncherDisplayName;
module.exports.applyAndroidLauncherName = applyAndroidLauncherName;
module.exports.applyIosLauncherName = applyIosLauncherName;
module.exports.getLauncherName = getLauncherName;
