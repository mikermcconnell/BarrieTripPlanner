const { getVehicleRouteLabel } = require('../utils/routeLabel');

describe('getVehicleRouteLabel', () => {
  const routes = [
    { id: '2', shortName: '2' },
    { id: '2A', shortName: '2A' },
    { id: '2B', shortName: '2B' },
    { id: '7A', shortName: '7A' },
    { id: '7B', shortName: '7B' },
    { id: '12A', shortName: '12A' },
  ];

  test('uses exact route id match first', () => {
    const vehicle = { routeId: '12A', tripId: 'trip-1' };
    const result = getVehicleRouteLabel(vehicle, routes, {});
    expect(result).toBe('12A');
  });

  test('uses trip mapping when feed route id is branchless', () => {
    const vehicle = { routeId: '7', tripId: 'trip-7a' };
    const tripMapping = { 'trip-7a': { routeId: '7A' } };
    const result = getVehicleRouteLabel(vehicle, routes, tripMapping);
    expect(result).toBe('7A');
  });

  test('prefers trip-mapped branch when raw route id is a base route', () => {
    const vehicle = { routeId: '2', tripId: 'trip-2b' };
    const tripMapping = { 'trip-2b': { routeId: '2B' } };
    const result = getVehicleRouteLabel(vehicle, routes, tripMapping);
    expect(result).toBe('2B');
  });

  test('falls back to A branch when only base route id is available', () => {
    const vehicle = { routeId: '2', tripId: null };
    const noBaseRoute = routes.filter((r) => r.id !== '2');
    const result = getVehicleRouteLabel(vehicle, noBaseRoute, {});
    expect(result).toBe('2A');
  });

  test('falls back to A branch even when base route exists in GTFS', () => {
    const vehicle = { routeId: '2', tripId: null };
    const result = getVehicleRouteLabel(vehicle, routes, {});
    expect(result).toBe('2A');
  });

  test('falls back to A branch for route 7 when base route exists', () => {
    const routesWithBase7 = [...routes, { id: '7', shortName: '7' }];
    const vehicle = { routeId: '7', tripId: null };
    const result = getVehicleRouteLabel(vehicle, routesWithBase7, {});
    expect(result).toBe('7A');
  });

  test('uses exact match for route without branches', () => {
    const routesWithSolo = [...routes, { id: '5', shortName: '5' }];
    const vehicle = { routeId: '5', tripId: null };
    const result = getVehicleRouteLabel(vehicle, routesWithSolo, {});
    expect(result).toBe('5');
  });

  test('prefers branch route id when shortName omits the branch suffix', () => {
    const vehicle = { routeId: '2A', tripId: null };
    const branchlessShortNameRoutes = [{ id: '2A', shortName: '2' }];
    const result = getVehicleRouteLabel(vehicle, branchlessShortNameRoutes, {});
    expect(result).toBe('2A');
  });

  test('returns raw route id when no static candidates exist', () => {
    const vehicle = { routeId: '999', tripId: null };
    const result = getVehicleRouteLabel(vehicle, routes, {});
    expect(result).toBe('999');
  });
});
