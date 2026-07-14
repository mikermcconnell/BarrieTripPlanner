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
});
