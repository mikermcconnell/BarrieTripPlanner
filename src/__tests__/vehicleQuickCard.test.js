import { formatVehicleFreshness } from '../utils/homeVehiclePresentation';

describe('VehicleQuickCard freshness', () => {
  test('describes fresh and delayed positions in plain language', () => {
    const vehicle = { timestamp: 1_700_000_000 };
    expect(formatVehicleFreshness(vehicle, 1_700_000_003_000, false)).toBe('Updated just now');
    expect(formatVehicleFreshness(vehicle, 1_700_000_030_000, false)).toBe('Updated 30 sec ago');
    expect(formatVehicleFreshness(vehicle, 1_700_000_100_000, false)).toBe('Position delayed · 100 sec old');
  });
});
