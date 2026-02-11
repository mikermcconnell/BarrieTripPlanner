const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure .web.js extensions are resolved for web platform
config.resolver.sourceExts = ['web.js', 'web.ts', 'web.tsx', ...config.resolver.sourceExts];

module.exports = config;
