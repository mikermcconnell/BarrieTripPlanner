const fs = require('fs');
const path = require('path');

const readSource = () => fs.readFileSync(path.join(__dirname, '..', 'screens/HomeScreen.js'), 'utf8');

describe('HomeScreen detour overlay render guard', () => {
  test('does not reference an out-of-scope shouldRenderDetourMapOverlays variable in HomeMapView', () => {
    const source = readSource();

    expect(source).not.toContain('!isTripPreviewMode && shouldRenderDetourMapOverlays && detourOverlays.map');
    expect(source).toContain('!isTripPreviewMode && shouldShowDetourGeometryOverlay({ isDetourView, hasDetourFocus }) && detourOverlays.map');
  });
});
