module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/\\.claude/',
    '/\\.expo/',
    '/dist/',
    '/\\.expo-export-debug/',
    '/\\.expo-export-debug-android/',
  ],
  modulePathIgnorePatterns: ['<rootDir>/\\.claude/'],
  setupFiles: ['<rootDir>/src/__tests__/setup.js'],
  moduleFileExtensions: ['js', 'ts', 'tsx', 'json'],
  // Transform ES modules using babel
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  // Allow transforming expo and react-native modules
  transformIgnorePatterns: [
    '/node_modules/(?!(expo|expo-asset|expo-file-system|@expo|expo-modules-core|react-native|@react-native|@react-native-google-signin|@sentry)/)',
  ],
  // Mock modules that require native/expo runtime
  moduleNameMapper: {
    '^../config/constants$': '<rootDir>/src/__tests__/__mocks__/constants.js',
  },
};
