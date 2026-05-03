jest.mock('../config/runtimeConfig', () => ({
  __esModule: true,
  default: {
    proxy: { apiBaseUrl: 'https://proxy.example.test/' },
  },
}));

const {
  buildPlatformMapImageUrl,
  getPlatformMapSourceUrl,
} = require('../services/platformMapService');

describe('platformMapService', () => {
  test('builds platform map image URL from API proxy base URL', () => {
    expect(buildPlatformMapImageUrl('georgian-college')).toBe(
      'https://proxy.example.test/api/platform-maps/georgian-college'
    );
  });

  test('returns empty URL for missing hub ID or proxy base URL', () => {
    expect(buildPlatformMapImageUrl('')).toBe('');
  });

  test('exposes the source PDF fallback URL', () => {
    expect(getPlatformMapSourceUrl()).toBe('https://www.barrie.ca/Transit-Platform-Maps.pdf');
  });
});
