import { buildVehicleSelectionLabel } from '../utils/homeVehiclePresentation';

describe('TransitStatusTray', () => {
  test('uses rider-friendly route and bus summary copy', () => {
    expect(buildVehicleSelectionLabel(['400'], 2)).toBe('400 · 2 buses');
    expect(buildVehicleSelectionLabel(['400'], 1)).toBe('400 · 1 bus');
    expect(buildVehicleSelectionLabel(['10', '11'], 5)).toBe('2 routes · 5 buses');
    expect(buildVehicleSelectionLabel([], 32)).toBeNull();
  });
});
