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

  test('Android navigation bus markers avoid per-frame JS animation', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'NavigationScreen.js'),
      'utf8'
    );

    const componentStart = source.indexOf('const NavigationBusMapMarker =');
    const componentEnd = source.indexOf('const NavigationScreen =', componentStart);
    const busMarkerSource = source.slice(componentStart, componentEnd);

    expect(componentStart).toBeGreaterThanOrEqual(0);
    expect(componentEnd).toBeGreaterThan(componentStart);
    expect(busMarkerSource).toContain("Platform.OS === 'android'");

    const androidBranch = busMarkerSource.slice(
      busMarkerSource.indexOf("if (Platform.OS === 'android')"),
      busMarkerSource.indexOf('return (', busMarkerSource.indexOf("if (Platform.OS === 'android')") + 1)
    );
    expect(androidBranch).not.toContain('<BusMarker');
  });
});
