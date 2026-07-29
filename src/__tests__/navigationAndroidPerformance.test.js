const fs = require('fs');
const path = require('path');

describe('Navigation Android map performance', () => {
  test('passive navigation marker views allow map gestures through', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'NavigationScreen.js'),
      'utf8'
    );

    const markerViewCount = (source.match(/<MapLibreGL\.MarkerView/g) || []).length;
    const passThroughCount = (source.match(/pointerEvents="none"/g) || []).length;

    expect(markerViewCount).toBeGreaterThan(0);
    expect(passThroughCount).toBeGreaterThanOrEqual(markerViewCount);
  });

  test('navigation uses the shared bus marker in Walk View', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'NavigationScreen.js'),
      'utf8'
    );

    const componentStart = source.indexOf('const NavigationBusMapMarker =');
    const componentEnd = source.indexOf('const NavigationScreen =', componentStart);
    const busMarkerSource = source.slice(componentStart, componentEnd);

    expect(componentStart).toBeGreaterThanOrEqual(0);
    expect(componentEnd).toBeGreaterThan(componentStart);
    expect(busMarkerSource).toContain('<BusMarker');
    expect(busMarkerSource).not.toContain("Platform.OS === 'android'");
  });

  test('web Walk View does not reset the map from live location updates', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'NavigationScreen.web.js'),
      'utf8'
    );

    const initialRegionStart = source.indexOf('const initialRegion = useMemo');
    const renderStart = source.indexOf('return (', initialRegionStart);
    const initialRegionSource = source.slice(initialRegionStart, renderStart);

    expect(initialRegionStart).toBeGreaterThanOrEqual(0);
    expect(initialRegionSource).toContain('tripStart');
    expect(initialRegionSource).not.toContain('userLocation');
  });
});
