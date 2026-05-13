const fs = require('fs');
const path = require('path');

describe('detour legend visibility wiring', () => {
  test('native and web show the legend whenever detour view is active', () => {
    const nativeSource = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.js'), 'utf8');
    const webSource = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.web.js'), 'utf8');
    const expected = 'visible={!isTripPlanningMode && !detourSheetRouteId && isDetourView && detourOverlays.length > 0}';

    expect(nativeSource).toContain(expected);
    expect(webSource).toContain(expected);
  });
});
