const {
  getOneWayRouteArrowVisibility,
  isOneWayRoute,
} = require('../utils/oneWayRoutes');

describe('oneWayRoutes', () => {
  test('identifies known one-way routes', () => {
    ['8A', '8B', '10', '11', '100', '101'].forEach((routeId) => {
      expect(isOneWayRoute(routeId)).toBe(true);
    });

    expect(isOneWayRoute('1')).toBe(false);
  });

  test('shows arrows for selected one-way routes at close zoom', () => {
    expect(getOneWayRouteArrowVisibility({
      routeId: '10',
      currentZoom: 14,
      isSelected: true,
      hasSelection: true,
    })).toBe(true);
  });

  test('shows arrows for unselected one-way routes only at very close zoom', () => {
    expect(getOneWayRouteArrowVisibility({
      routeId: '10',
      currentZoom: 15,
      isSelected: false,
      hasSelection: false,
    })).toBe(true);

    expect(getOneWayRouteArrowVisibility({
      routeId: '10',
      currentZoom: 14.5,
      isSelected: false,
      hasSelection: false,
    })).toBe(false);
  });

  test('does not show arrows for two-way routes', () => {
    expect(getOneWayRouteArrowVisibility({
      routeId: '1',
      currentZoom: 15,
      isSelected: true,
      hasSelection: true,
    })).toBe(false);
  });
});
