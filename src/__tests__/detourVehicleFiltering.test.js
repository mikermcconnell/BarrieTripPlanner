const {
  getDisplayedVehiclesForDetourView,
  isRouteInSameDetourFamily,
} = require('../utils/detourVehicleFiltering');

const vehicles = [
  { id: 'bus-12a', routeId: '12A' },
  { id: 'bus-12b', routeId: '12B' },
  { id: 'bus-12-base', routeId: '12' },
  { id: 'bus-8', routeId: '8' },
];

const activeDetours = {
  '12A': { state: 'active' },
  '12B': { state: 'active' },
  '8': { state: 'cleared' },
};

describe('detour vehicle filtering', () => {
  test('shows both route-family bus markers when base route is selected in detour view', () => {
    const result = getDisplayedVehiclesForDetourView({
      displayedVehicles: [],
      vehicles,
      selectedRouteIds: new Set(['12']),
      activeDetours,
      focusedDetourRouteId: null,
      isDetourView: true,
    });

    expect(result.map((vehicle) => vehicle.id)).toEqual(['bus-12a', 'bus-12b', 'bus-12-base']);
  });

  test('shows both active branch bus markers when one branch is focused', () => {
    const result = getDisplayedVehiclesForDetourView({
      displayedVehicles: [vehicles[0]],
      vehicles,
      selectedRouteIds: new Set(['12A']),
      activeDetours,
      focusedDetourRouteId: '12A',
      isDetourView: true,
    });

    expect(result.map((vehicle) => vehicle.id)).toEqual(['bus-12a', 'bus-12b', 'bus-12-base']);
  });

  test('does not change regular map vehicle filtering', () => {
    const displayedVehicles = [vehicles[0]];
    const result = getDisplayedVehiclesForDetourView({
      displayedVehicles,
      vehicles,
      selectedRouteIds: new Set(['12']),
      activeDetours,
      focusedDetourRouteId: null,
      isDetourView: false,
    });

    expect(result).toBe(displayedVehicles);
  });

  test('treats active branch routes as the same focused detour family', () => {
    expect(isRouteInSameDetourFamily('12A', '12B')).toBe(true);
    expect(isRouteInSameDetourFamily('12A', '8')).toBe(false);
  });
});
