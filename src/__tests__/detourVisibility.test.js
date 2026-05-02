import {
  filterRiderVisibleDetours,
  isRiderVisibleDetour,
} from '../utils/detourVisibility';

describe('detourVisibility', () => {
  test('hides low-confidence detours', () => {
    expect(isRiderVisibleDetour({ confidence: 'low', state: 'active' })).toBe(false);
  });

  test('hides medium-confidence detours until at least two vehicles support them', () => {
    expect(isRiderVisibleDetour({ confidence: 'medium', vehicleCount: 1, state: 'active' })).toBe(false);
  });

  test('shows medium-confidence detours with two supporting vehicles', () => {
    expect(isRiderVisibleDetour({ confidence: 'medium', vehicleCount: 2, state: 'active' })).toBe(true);
  });

  test('shows high-confidence detours', () => {
    expect(isRiderVisibleDetour({ confidence: 'high', vehicleCount: 1, state: 'active' })).toBe(true);
  });

  test('filters a detour map to rider-visible detours only', () => {
    expect(filterRiderVisibleDetours({
      low: { confidence: 'low' },
      oneVehicleMedium: { confidence: 'medium', vehicleCount: 1 },
      twoVehicleMedium: { confidence: 'medium', vehicleCount: 2 },
      high: { confidence: 'high' },
    })).toEqual({
      twoVehicleMedium: { confidence: 'medium', vehicleCount: 2 },
      high: { confidence: 'high' },
    });
  });
});
