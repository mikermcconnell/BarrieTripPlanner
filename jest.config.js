module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  // Transform ES modules using babel
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  // Allow transforming expo and react-native modules
  transformIgnorePatterns: [
    '/node_modules/(?!(expo|@expo|expo-modules-core|react-native|@react-native)/)',
  ],
  // Mock modules that require native/expo runtime
  moduleNameMapper: {
    '^../config/constants$': '<rootDir>/src/__tests__/__mocks__/constants.js',
  },
};
