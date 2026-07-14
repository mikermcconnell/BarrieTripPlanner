const fs = require('fs');
const path = require('path');

const readSource = () => fs.readFileSync(path.join(__dirname, '..', 'screens/HomeScreen.js'), 'utf8');

describe('native detour chrome spacing', () => {
  test('places detour status directly under search without a large top backdrop', () => {
    const source = readSource();

    expect(source).toContain('const HOME_MAP_CHROME_OFFSETS = Object.freeze({');
    expect(source).toContain('detourStatusTop: 84,');
    expect(source).toContain('detourStatusStack:');
    expect(source).toContain('top: HOME_MAP_CHROME_OFFSETS.detourStatusTop + STATUS_BAR_OFFSET');
    expect(source).not.toContain('topChromeBackdropWithDetours:');
    expect(source).not.toContain('styles.topChromeBackdrop');
  });

  test('anchors bottom map utilities closer to the tab bar with a named offset', () => {
    const source = readSource();

    expect(source).toContain('mapUtilityBottom: 16,');
    expect(source).toContain('bottom: HOME_MAP_CHROME_OFFSETS.mapUtilityBottom + floatingBottomOffset');
  });

  test('shows upcoming detours on the main map outside detour mode', () => {
    const source = readSource();

    expect(source).toContain('{showPrimaryUpcomingNotice && (');
    expect(source).toContain('notices={visibleUpcomingDetourNotices}');
    expect(source).not.toContain('{isDetourView && visibleUpcomingDetourNotices.length > 0 && (');
  });

  test('shows official service impacts on the main map without treating them as auto detours', () => {
    const source = readSource();

    expect(source).toContain('OfficialImpactStrip');
    expect(source).toContain('officialServiceImpacts');
    expect(source).toContain('visibleOfficialServiceImpacts.length > 0');
    expect(source).not.toContain('activeDetours={officialServiceImpacts');
  });

  test('provides a regular map exit that clears detour focus and fits all routes once', () => {
    const source = readSource();

    expect(source).toContain('returnToRegularMapView');
    expect(source).toContain('accessibilityLabel="Back to Regular Route View"');
    expect(source).toContain('Back to Regular Route View');
    expect(source).toContain("handleMapViewModeChange('regular')");
    expect(source).toContain('fitMapToAllRoutesOnce');
    expect(source).toContain('allRouteViewportCoordinates');
    expect(source).toContain('getViewportBoundsCoordinates(allRouteViewportCoordinates)');
    expect(source).toContain('compatMapRef.current.fitToCoordinates(fitCoordinates');
  });
});
