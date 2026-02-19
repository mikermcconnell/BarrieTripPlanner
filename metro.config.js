const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Register .dat as an asset extension so large data files are bundled as
// raw assets instead of being inlined as JS (which exceeds Hermes limits)
config.resolver.assetExts.push('dat');

module.exports = config;
