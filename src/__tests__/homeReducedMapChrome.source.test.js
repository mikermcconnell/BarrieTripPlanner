const fs = require('fs');
const path = require('path');

const readSource = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('home reduced map chrome', () => {
  test('native home screen uses family route chips and no map options button', () => {
    const source = readSource('screens/HomeScreen.js');

    expect(source).toContain('RouteChipRail');
    expect(source).toContain('showMainMapFloatingControls && !isDetourView');
    expect(source).toContain('onRouteFamilySelect={handleRouteFamilySelect}');
    expect(source).toContain('styles.mapUtilityControls');
    expect(source).toContain('styles.routeChipRail');
    expect(source).toContain('accessibilityLabel="Center on my location"');
    expect(source).toContain('right: SPACING.sm');
    expect(source).toContain('right: 64');
    expect(source).not.toContain('MapOptionsControl');
    expect(source).not.toContain('<MapOptionsControl');
    expect(source).not.toContain('anchored={false}');
    expect(source).not.toContain('<HomeScreenControls');
    expect(source).not.toContain('<MapViewModeToggle');
    expect(source).not.toContain('left: SPACING.sm + 58');
    expect(source).not.toContain('onOpenRouteFilter={openRouteFilterSheet}');
  });

  test('web home screen uses one map options entry instead of separate view and stops chrome', () => {
    const source = readSource('screens/HomeScreen.web.impl.js');

    expect(source).toContain('MapOptionsControl');
    expect(source).not.toContain('<MapViewModeToggle');
    expect(source).not.toContain(`accessibilityLabel={showStops ? 'Hide stops' : 'Show stops'}`);
  });
});
