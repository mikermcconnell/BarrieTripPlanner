const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const sourcePath = (relativePath) => path.join(__dirname, '..', relativePath);
const countMatches = (source, pattern) => (source.match(pattern) || []).length;

const getHandler = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const expectCameraNeutral = (source) => {
  expect(source).not.toContain('fitToCoordinates');
  expect(source).not.toContain('animateToRegion');
  expect(source).not.toContain('setCamera');
  expect(source).not.toContain('focusMapToDetour');
  expect(source).not.toContain('zoomToRoutes');
};

describe('home map automatic camera policy', () => {
  test.each(['screens/HomeScreen.js', 'screens/HomeScreen.web.impl.js'])(
    '%s keeps detour and official-impact selections camera neutral',
    (relativePath) => {
      const source = read(relativePath);
      expectCameraNeutral(getHandler(
        source,
        'const showDetourEventOnMap = useCallback',
        'const showDetourRouteOnMap'
      ));
      expectCameraNeutral(getHandler(
        source,
        'const handleOfficialImpactPress = useCallback',
        'const trip = useTripPlanner'
      ));
    }
  );

  test.each(['screens/HomeScreen.js', 'screens/HomeScreen.web.impl.js'])(
    '%s has no trip-preview auto-fit path',
    (relativePath) => {
      const source = read(relativePath);
      expect(source).not.toContain('useTripPreviewViewport');
      expect(source).not.toContain('shouldAutoFitTripPreview');
      expect(source).not.toContain('home.trip-preview-auto-fit');
    }
  );

  test('navigation selections never move the camera', () => {
    expectCameraNeutral(read('hooks/useMapNavigation.js'));
    expectCameraNeutral(read('hooks/useRouteSelection.js'));
  });

  test('vehicle-cluster selections never expand the camera', () => {
    const source = read('components/home-map/HomeMapVehicleLayer.js');
    expect(source).not.toContain('getClusterExpansionZoom');
    expect(source).not.toContain('setCamera');
    expect(source).not.toContain('cameraRef');
  });

  test('native Home camera commands are limited to explicit controls and follow cancellation', () => {
    const source = read('screens/HomeScreen.js');

    expect(countMatches(source, /\.setCamera\s*\(/g)).toBe(4);
    expect(source).toContain("source: 'home.dev-pan'");
    expect(source).toContain("source: 'home.dev-zoom'");
    expect(source).toContain("source: 'home.stop-following-user-location'");
    expect(source).toContain("source: 'home.current-location'");
    expect(source).not.toContain('fitToCoordinates');
    expect(source).not.toContain('animateToRegion');

    const stopFollowingHandler = getHandler(
      source,
      'const stopFollowingUserLocation = useCallback',
      'const cancelPendingLocationCenter'
    );
    expect(stopFollowingHandler).not.toContain('centerCoordinate');
    expect(stopFollowingHandler).not.toContain('zoomLevel');
  });

  test('web Home has only the explicit current-location camera action', () => {
    const source = read('screens/HomeScreen.web.impl.js');
    const currentLocationHandler = getHandler(
      source,
      'const centerOnUserLocationOnce = useCallback',
      'const routeLineLabelMarkers'
    );

    expect(countMatches(source, /\.animateToRegion\s*\(/g)).toBe(1);
    expect(currentLocationHandler).toContain('animateToRegion');
    expect(source).not.toContain('fitToCoordinates');
    expect(source).not.toContain('setCamera');
  });

  test('obsolete automatic framing modules are removed', () => {
    expect(fs.existsSync(sourcePath('hooks/useTripPreviewViewport.js'))).toBe(false);
    expect(fs.existsSync(sourcePath('utils/tripPreviewAutoFit.js'))).toBe(false);
    expect(fs.existsSync(sourcePath('utils/detourViewport.js'))).toBe(false);
  });

  test('explicit current-location controls remain available', () => {
    expect(read('screens/HomeScreen.js')).toContain("source: 'home.current-location'");
    expect(read('screens/HomeScreen.web.impl.js')).toContain('const centerOnUserLocationOnce = useCallback');
  });
});
