import fs from 'fs';
import path from 'path';

const readScreen = (fileName) => fs.readFileSync(
  path.join(__dirname, `../screens/${fileName}`),
  'utf8'
);

const getDetourStopHandler = (source) => {
  const start = source.indexOf('const handleDetourStopPress = useCallback');
  const candidateEnds = [
    source.indexOf('const selectedDetour =', start),
    source.indexOf('// Handle "Trip from here"', start),
  ].filter((index) => index > start);
  const end = Math.min(...candidateEnds);
  return source.slice(start, end);
};

describe('closed stop access from the main map', () => {
  test('native keeps closed stops visible and clickable when regular stops are hidden', () => {
    const source = readScreen('HomeScreen.js');
    const handler = getDetourStopHandler(source);

    expect(source).toContain('visible={isDetourView || hasDetourFocus || hasClosedStopsForDisplay}');
    expect(source).toContain('onStopPress={handleDetourStopPress}');
    expect(handler).toContain('setSelectedStop(buildDetourStopNotice({');
    expect(handler).not.toContain('setShowStops(true)');
  });

  test('web opens closed-stop details without changing the regular stop toggle', () => {
    const source = readScreen('HomeScreen.web.impl.js');
    const handler = getDetourStopHandler(source);

    expect(source).toContain('closureStops: detourMapClosureStops');
    expect(source).toContain('onStopPress={handleDetourStopPress}');
    expect(handler).toContain('setSelectedStop(buildDetourStopNotice({');
    expect(handler).not.toContain('setShowStops(true)');
  });
});
