// Keep date-sensitive app tests stable across local machines and GitHub's UTC runners.
process.env.TZ = 'America/Toronto';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/\\.claude/',
    '/\\.expo/',
    '/\\.worktrees/',
    '/dist/',
    '/\\.expo-export-debug/',
    '/\\.expo-export-debug-android/',
    '[/\\\\]api-proxy[/\\\\]',
  ],
  modulePathIgnorePatterns: ['<rootDir>/\\.claude/', '<rootDir>/\\.worktrees/'],
  setupFiles: ['<rootDir>/src/__tests__/setup.js'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setupAfterEnv.js'],
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
    '\\.(png|jpg|jpeg|gif|webp)$': '<rootDir>/src/__tests__/__mocks__/assetMock.js',
  },
};
