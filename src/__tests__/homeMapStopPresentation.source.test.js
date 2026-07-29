import fs from 'fs';
import path from 'path';
import { MAP_MARKER_THEME } from '../config/mapMarkerTheme';

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('home map stop presentation', () => {
  test('uses a non-blue stop and hub palette with a close-range label threshold', () => {
    expect(MAP_MARKER_THEME.stopFill).toBe('#FFFFFF');
    expect(MAP_MARKER_THEME.stopOutline).toBe('#505F79');
    expect(MAP_MARKER_THEME.stopSelected).toBe('#6F42C1');
    expect(MAP_MARKER_THEME.hubFill).toBe('#004E80');
    expect(MAP_MARKER_THEME.closedStop).toBe('#FF991F');
    expect(MAP_MARKER_THEME.stopCodeMinZoom).toBe(16);
  });

  test('native stop source includes stop codes and a zoom-gated label layer', () => {
    const source = read('screens/HomeScreen.js');

    expect(source).toContain("stopCode: String(stop.code ?? stop.stopCode ?? stop.id ?? '')");
    expect(source).toContain('id="home-stops-code-labels"');
    expect(source).toContain('minZoomLevel={MAP_MARKER_THEME.stopCodeMinZoom}');
    expect(source).toContain("textField: ['get', 'stopCode']");
    expect(source).toContain('textAllowOverlap: true');
    expect(source).toContain('id="home-stops-center"');
  });

  test.each(['screens/HomeScreen.js', 'screens/HomeScreen.web.impl.js'])(
    '%s defaults regular-map stops on and restores them after detour mode',
    (fileName) => {
      const source = read(fileName);
      const regularModeStart = source.indexOf("if (nextMode === 'regular')");
      const detourModeStart = source.indexOf("if (nextMode === 'detour')", regularModeStart);
      const regularModeHandler = source.slice(regularModeStart, detourModeStart);

      expect(source).toContain('const [showStops, setShowStops] = useState(true);');
      expect(regularModeHandler).toContain('setShowStops(true);');
    }
  );

  test('closed-stop markers are fully opaque in every main-map path', () => {
    const nativeSource = read('screens/HomeScreen.js');
    const webSource = read('screens/HomeScreen.web.impl.js');
    const detourSource = read('components/DetourOverlay.js');

    expect(nativeSource).toContain('const closedStopMarkerOpacity = 1;');
    expect(webSource).toContain('const closedStopMarkerOpacity = 1;');
    expect(detourSource).toContain('opacity={1}');
  });
});
