const fs = require('fs');
const path = require('path');

describe('HomeScreen map performance', () => {
  test('Android home-fleet bus markers do not run per-frame JS animation', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );

    const componentStart = source.indexOf('const AndroidLiveBusMarker = React.memo');
    const componentEnd = source.indexOf('const HomeMapVehiclesLayer = React.memo');
    const componentSource = source.slice(componentStart, componentEnd);

    expect(componentStart).toBeGreaterThanOrEqual(0);
    expect(componentEnd).toBeGreaterThan(componentStart);
    expect(componentSource).not.toContain('useAnimatedBusPosition');
  });

  test('Android home-fleet bus markers do not resolve route snap paths for every vehicle', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'HomeScreen.js'),
      'utf8'
    );

    const androidBranchStart = source.indexOf("if (Platform.OS === 'android')", source.indexOf('const HomeMapVehiclesLayer = React.memo'));
    const androidBranchMatch = source.slice(androidBranchStart).match(
      /if \(Platform\.OS === 'android'\) \{[\s\S]*?\n\s{2}\}\r?\n\r?\n\s{2}return displayedVehicles\.map\(\(vehicle\) => \{/
    );
    const androidBranchEnd = androidBranchMatch
      ? androidBranchStart + androidBranchMatch[0].length
      : -1;
    const androidBranchSource = source.slice(androidBranchStart, androidBranchEnd);

    expect(androidBranchStart).toBeGreaterThanOrEqual(0);
    expect(androidBranchEnd).toBeGreaterThan(androidBranchStart);
    expect(androidBranchSource).not.toContain('getVehicleSnapPath');
  });
});
