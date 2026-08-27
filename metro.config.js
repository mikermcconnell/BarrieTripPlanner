const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Register .dat as an asset extension so large data files are bundled as
// raw assets instead of being inlined as JS (which exceeds Hermes limits)
config.resolver.assetExts.push('dat');

module.exports = config;
