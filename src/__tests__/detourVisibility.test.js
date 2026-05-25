import {
  filterRiderVisibleDetours,
  getCurrentOngoingDetourCount,
  isRiderVisibleDetour,
} from '../utils/detourVisibility';

describe('detourVisibility', () => {
  test('hides detours explicitly suppressed by the backend', () => {
    expect(isRiderVisibleDetour({
      confidence: 'high',
      state: 'active',
      riderVisible: false,
      riderVisibilityReason: 'stale-evidence-gps-clear-required',
    })).toBe(false);
  });

  test('hides low-confidence detours', () => {
    expect(isRiderVisibleDetour({ confidence: 'low', state: 'active' })).toBe(false);
  });

  test('keeps low-confidence detours hidden even when validation visibility is requested', () => {
    expect(isRiderVisibleDetour(
      { confidence: 'low', state: 'active' },
      { showLowConfidence: true }
    )).toBe(false);
  });

  test('shows medium-confidence detours to riders', () => {
    expect(isRiderVisibleDetour({ confidence: 'medium', vehicleCount: 1, state: 'active' })).toBe(true);
  });

  test('shows medium-confidence detours with two supporting vehicles', () => {
    expect(isRiderVisibleDetour({ confidence: 'medium', vehicleCount: 2, state: 'active' })).toBe(true);
  });

  test('uses explicit unique vehicle count when current count is zero', () => {
    expect(isRiderVisibleDetour({
      confidence: 'medium',
      vehicleCount: 0,
      uniqueVehicleCount: 2,
      currentVehicleCount: 0,
      state: 'active',
    })).toBe(true);
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
      oneVehicleMedium: { confidence: 'medium', vehicleCount: 1 },
      twoVehicleMedium: { confidence: 'medium', vehicleCount: 2 },
      high: { confidence: 'high' },
    });
  });

  test('filter excludes low-confidence active detours when validation visibility is requested', () => {
    expect(filterRiderVisibleDetours({
      lowActive: { confidence: 'low', state: 'active' },
      lowCleared: { confidence: 'low', state: 'cleared' },
      mediumOneVehicle: { confidence: 'medium', vehicleCount: 1, state: 'active' },
    }, { showLowConfidence: true })).toEqual({
      mediumOneVehicle: { confidence: 'medium', vehicleCount: 1, state: 'active' },
    });
  });

  test('counts only current ongoing detours for the Detours tab badge', () => {
    expect(getCurrentOngoingDetourCount({
      '12A': { confidence: 'high', state: 'active' },
      '12B': { confidence: 'medium', state: 'clear-pending' },
      futureRoute: { confidence: 'high', state: 'upcoming' },
      archivedRoute: { confidence: 'high', state: 'archived' },
      clearedRoute: { confidence: 'high', state: 'cleared' },
    })).toBe(2);
  });
});
