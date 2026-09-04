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

    const initialRegionStart = source.indexOf('if (!initialRegionRef.current)');
    const initialRegionEnd = source.indexOf('const initialRegion = initialRegionRef.current', initialRegionStart);
    const initialRegionSource = source.slice(initialRegionStart, initialRegionEnd);

    expect(initialRegionStart).toBeGreaterThanOrEqual(0);
    expect(initialRegionEnd).toBeGreaterThan(initialRegionStart);
    expect(initialRegionSource).toContain('tripStart');
    expect(initialRegionSource).not.toContain('userLocation');
  });

  test('navigation gestures synchronously release follow and heading camera control', () => {
    for (const fileName of ['NavigationScreen.js', 'NavigationScreen.web.js']) {
      const source = fs.readFileSync(
        path.join(__dirname, '..', 'screens', fileName),
        'utf8'
      );
      const disableStart = source.indexOf('const disableFollowMode = useCallback');
      const disableEnd = source.indexOf('}, []);', disableStart);
      const disableSource = source.slice(disableStart, disableEnd);

      expect(disableStart).toBeGreaterThanOrEqual(0);
      expect(disableSource).toContain('isFollowModeRef.current = false');
      expect(disableSource).toContain('setIsFollowMode(false)');
    }

    const webSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'NavigationScreen.web.js'),
      'utf8'
    );
    const bearingStart = webSource.indexOf('// Keep north-up / heading-up behavior');
    const bearingEnd = webSource.indexOf('if (!initialRegionRef.current)', bearingStart);
    const bearingSource = webSource.slice(bearingStart, bearingEnd);

    expect(bearingSource).toContain('!isFollowModeRef.current');
  });

  test('web one-shot navigation camera controls consume each request before live data can repeat it', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'NavigationScreen.web.js'),
      'utf8'
    );

    const jumpStart = source.indexOf('// Jump to current location when requested.');
    const overviewStart = source.indexOf('// Restore the full trip overview when requested.');
    const bearingStart = source.indexOf('// Keep north-up / heading-up behavior');
    const jumpSource = source.slice(jumpStart, overviewStart);
    const overviewSource = source.slice(overviewStart, bearingStart);

    expect(jumpSource).toContain(
      'handledJumpToLocationTriggerRef.current === jumpToLocationTrigger'
    );
    expect(jumpSource).toContain(
      'handledJumpToLocationTriggerRef.current = jumpToLocationTrigger'
    );
    expect(overviewSource).toContain(
      'handledShowOverviewTriggerRef.current === showOverviewTrigger'
    );
    expect(overviewSource).toContain(
      'handledShowOverviewTriggerRef.current = showOverviewTrigger'
    );
  });
});
