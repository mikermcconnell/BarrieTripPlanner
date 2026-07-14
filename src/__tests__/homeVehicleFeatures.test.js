import {
  buildHomeVehicleFeatureCollection,
  findVehicleById,
  getVehicleTimestampMs,
  isHomeVehicleStale,
} from '../utils/homeVehicleFeatures';

const vehicle = {
  id: 'bus-1',
  routeId: '400',
  headsign: 'RVH',
  bearing: 370,
  timestamp: 1_700_000_000,
  coordinate: { latitude: 44.39, longitude: -79.69 },
};

describe('home vehicle features', () => {
  test('normalizes second and millisecond timestamps', () => {
    expect(getVehicleTimestampMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(getVehicleTimestampMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  test('marks positions stale using vehicle or feed freshness', () => {
    expect(isHomeVehicleStale(vehicle, 1_700_000_030_000, false)).toBe(false);
    expect(isHomeVehicleStale(vehicle, 1_700_000_100_000, false)).toBe(true);
    expect(isHomeVehicleStale(vehicle, 1_700_000_010_000, true)).toBe(true);
  });

  test('builds deterministic selected map features', () => {
    const collection = buildHomeVehicleFeatureCollection({
      vehicles: [vehicle],
      getRouteColor: () => '#00BCD4',
      getRouteLabel: () => '400',
      selectedVehicleId: 'bus-1',
      now: 1_700_000_010_000,
    });
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]).toEqual(expect.objectContaining({ id: 'bus-1' }));
    expect(collection.features[0].properties).toEqual(expect.objectContaining({
      routeLabel: '400',
      routeColor: '#00BCD4',
      bearing: 10,
      isSelected: 1,
      isStale: 0,
    }));
  });

  test('does not invent a northbound direction when bearing is absent', () => {
    const collection = buildHomeVehicleFeatureCollection({
      vehicles: [{ ...vehicle, bearing: null }],
      getRouteLabel: () => '400',
    });

    expect(collection.features[0].properties.hasBearing).toBe(0);
  });

  test('keeps a focused detour bus fully opaque even when its feed is stale', () => {
    const collection = buildHomeVehicleFeatureCollection({
      vehicles: [vehicle],
      feedIsStale: true,
      isVehicleFullyOpaque: () => true,
    });

    expect(collection.features[0].properties).toEqual(expect.objectContaining({
      isStale: 1,
      opacity: 1,
      sortKey: 3,
    }));
  });

  test('keeps stale and background bus icons fully opaque', () => {
    const collection = buildHomeVehicleFeatureCollection({
      vehicles: [vehicle],
      feedIsStale: true,
      isVehicleDimmed: () => true,
    });

    expect(collection.features[0].properties.isStale).toBe(1);
    expect(collection.features[0].properties.opacity).toBe(1);
  });

  test('finds the latest vehicle by stable id', () => {
    expect(findVehicleById([vehicle], 'bus-1')).toBe(vehicle);
    expect(findVehicleById([vehicle], 'missing')).toBeNull();
  });
});
