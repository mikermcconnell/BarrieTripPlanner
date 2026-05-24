const fs = require('fs');
const path = require('path');

const readSource = (...parts) => fs.readFileSync(
  path.join(__dirname, '..', ...parts),
  'utf8'
);

describe('native map touch targets', () => {
  test('saved place markers use native map annotations instead of React Native touchables inside MarkerView', () => {
    const source = readSource('screens', 'HomeScreen.js');
    const start = source.indexOf('{!isTripPreviewMode && savedPlaceMapMarkers.map');
    const end = source.indexOf('{showUserLocation && centeredUserLocation', start);
    const savedPlaceSection = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(savedPlaceSection).toContain('<MapLibreGL.PointAnnotation');
    expect(savedPlaceSection).toContain('onSelected={() => handleSelectSavedPlace?.(marker.rawPlace)}');
    expect(savedPlaceSection).not.toContain('<TouchableOpacity');
  });

  test('bus marker views do not rely on React Native touch events inside MapLibre MarkerView', () => {
    const source = readSource('components', 'BusMarker.js');

    expect(source).toContain('<MapLibreGL.MarkerView');
    expect(source).not.toContain('onTouchEnd');
  });
});
