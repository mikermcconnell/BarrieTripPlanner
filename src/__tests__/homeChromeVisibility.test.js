const { shouldShowMainMapFloatingControls } = require('../utils/homeChromeVisibility');

describe('home chrome visibility', () => {
  test('hides main map floating controls while route selector is open', () => {
    expect(shouldShowMainMapFloatingControls({
      isTripPlanningMode: false,
      isRouteFilterSheetOpen: true,
      startupVariant: null,
    })).toBe(false);
  });

  test('shows main map floating controls on the normal map', () => {
    expect(shouldShowMainMapFloatingControls({
      isTripPlanningMode: false,
      isRouteFilterSheetOpen: false,
      startupVariant: null,
    })).toBe(true);
  });

  test('keeps controls hidden during trip planning and full startup', () => {
    expect(shouldShowMainMapFloatingControls({
      isTripPlanningMode: true,
      isRouteFilterSheetOpen: false,
      startupVariant: null,
    })).toBe(false);

    expect(shouldShowMainMapFloatingControls({
      isTripPlanningMode: false,
      isRouteFilterSheetOpen: false,
      startupVariant: 'full',
    })).toBe(false);
  });
});
