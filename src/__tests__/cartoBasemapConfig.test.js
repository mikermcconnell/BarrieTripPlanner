const path = require('node:path');

const constantsPath = path.resolve(__dirname, '../config/constants.js');

const loadMapStyle = (apiKey) => {
  jest.resetModules();
  if (apiKey === undefined) {
    delete process.env.EXPO_PUBLIC_CARTO_BASEMAP_KEY;
  } else {
    process.env.EXPO_PUBLIC_CARTO_BASEMAP_KEY = apiKey;
  }
  return require(constantsPath).OSM_MAP_STYLE;
};

describe('CARTO basemap configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('adds the encoded production key to every CARTO tile URL', () => {
    const style = loadMapStyle('key with/+reserved');
    const tiles = style.sources['carto-light'].tiles;

    expect(tiles).toHaveLength(3);
    for (const tileUrl of tiles) {
      expect(tileUrl).toContain('?key=key%20with%2F%2Breserved');
      expect(tileUrl).not.toContain('key with/+reserved');
    }
  });

  test('does not add an empty key query parameter', () => {
    const style = loadMapStyle(undefined);

    for (const tileUrl of style.sources['carto-light'].tiles) {
      expect(tileUrl).not.toContain('?key=');
    }
  });
});
