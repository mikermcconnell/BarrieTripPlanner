import fs from 'fs';
import path from 'path';

const readScreen = (fileName) => fs.readFileSync(
  path.join(__dirname, `../screens/${fileName}`),
  'utf8'
);

const getOverlayPressHandler = (source) => {
  const start = source.indexOf('const handleDetourOverlayPress = useCallback');
  const end = source.indexOf('const handleDetourStopPress', start);
  return source.slice(start, end);
};

const getRegularViewHandler = (source) => {
  const start = source.indexOf('const returnToRegularMapView = useCallback');
  const end = source.indexOf('const handleMapViewModeControlChange', start);
  return source.slice(start, end);
};

const getMapViewModeHandler = (source) => {
  const start = source.indexOf('const handleMapViewModeChange = useCallback');
  const end = source.indexOf('useEffect(() => {', start);
  return source.slice(start, end);
};

const getDetourSelectionHandlers = (source) => {
  const start = source.indexOf('const showDetourEventOnMap = useCallback');
  const end = source.indexOf('const showAllDetoursOnMap', start);
  return source.slice(start, end);
};

describe('detour viewport freedom', () => {
  test.each(['HomeScreen.js', 'HomeScreen.web.impl.js'])(
    '%s does not refocus the camera when detour geometry is pressed',
    (fileName) => {
      const source = readScreen(fileName);
      const handler = getOverlayPressHandler(source);

      expect(handler).toContain("handleMapViewModeChange('detour')");
      expect(handler).not.toContain('focusMapOnDetour(');
    }
  );

  test.each(['HomeScreen.js', 'HomeScreen.web.impl.js'])(
    '%s preserves the viewport when a detour notification is selected',
    (fileName) => {
      const handlers = getDetourSelectionHandlers(readScreen(fileName));

      expect(handlers).toContain("handleMapViewModeChange('detour')");
      expect(handlers).not.toContain('focusMapOnDetour(');
      expect(handlers).not.toContain('focusMapToDetour(');
      expect(handlers).not.toContain('fitToCoordinates');
      expect(handlers).not.toContain('setCamera');
    }
  );

  test('native regular-view reset preserves the rider viewport', () => {
    const source = readScreen('HomeScreen.js');
    const handler = getRegularViewHandler(source);

    expect(handler).toContain("handleMapViewModeChange('regular')");
    expect(handler).not.toContain('fitToCoordinates');
    expect(handler).not.toContain('setCamera');
    expect(handler).not.toContain('setTimeout');
    expect(handler).not.toContain('requestAnimationFrame');
  });

  test.each(['HomeScreen.js', 'HomeScreen.web.impl.js'])(
    '%s does not reset or refit the map when leaving detour view',
    (fileName) => {
      const handler = getMapViewModeHandler(readScreen(fileName));

      expect(handler).toContain('clearDetourMapSelection()');
      expect(handler).not.toContain('selectRoute(null)');
      expect(handler).not.toContain('fitToCoordinates');
      expect(handler).not.toContain('setCamera');
      expect(handler).not.toContain('focusMapToDetour');
    }
  );
});
