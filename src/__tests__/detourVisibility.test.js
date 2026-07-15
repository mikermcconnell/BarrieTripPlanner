import {
  filterRiderVisibleDetours,
  getCurrentOngoingDetourCount,
  hasRiderDetourMapGeometry,
  isRiderVisibleDetour,
} from '../utils/detourVisibility';

describe('detourVisibility', () => {
  test('hides detours explicitly suppressed by the backend', () => {
    expect(isRiderVisibleDetour({
      confidence: 'high',
      state: 'active',
      riderVisible: false,
      riderVisibilityReason: 'insufficient-geometry',
    })).toBe(false);
  });

  test('shows a confirmed active alert when only its unsafe geometry is suppressed', () => {
    expect(isRiderVisibleDetour({
      confidence: 'high',
      state: 'active',
      uniqueVehicleCount: 57,
      riderVisible: false,
      riderVisibilityReason: 'stale-mixed-evidence',
      alertVisible: true,
      alertVisibilityReason: 'active-detour-details-unavailable',
      canShowDetourPath: false,
    })).toBe(true);
  });

  test('distinguishes alert-only detours from detours with safe map geometry', () => {
    expect(hasRiderDetourMapGeometry({
      alertVisible: true,
      canShowDetourPath: false,
      segments: [{ canShowDetourPath: false }],
    })).toBe(false);

    expect(hasRiderDetourMapGeometry({
      alertVisible: true,
      canShowDetourPath: false,
      skippedSegmentPolyline: [
        { latitude: 44.348, longitude: -79.614 },
        { latitude: 44.349, longitude: -79.610 },
      ],
    })).toBe(true);
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

  test('hides medium-confidence detours until two vehicles confirm them', () => {
    expect(isRiderVisibleDetour({ confidence: 'medium', vehicleCount: 1, state: 'active' })).toBe(false);
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

  test('does not hide backend-visible detours just because there are old review fields', () => {
    expect(isRiderVisibleDetour({
      confidence: 'high',
      state: 'active',
      riderVisible: true,
      currentVehicleCount: 0,
    })).toBe(true);
  });

  test('hides zero-confirmed backend detours even if stale fields are rider-visible', () => {
    expect(isRiderVisibleDetour({
      confidence: 'high',
      state: 'active',
      riderVisible: true,
      riderVisibilityReason: 'zero-confirmed-vehicle-count',
      vehicleCount: 0,
      uniqueVehicleCount: 0,
      currentVehicleCount: 0,
    })).toBe(false);
  });

  test('hides explicit zero-confirmed count fields even if backend visibility is true', () => {
    expect(isRiderVisibleDetour({
      confidence: 'high',
      state: 'active',
      riderVisible: true,
      vehicleCount: 0,
      uniqueVehicleCount: 0,
      currentVehicleCount: 0,
    })).toBe(false);
  });

  test('hides zero-confirmed Hooper-style detours even between vehicle observations', () => {
    expect(isRiderVisibleDetour({
      confidence: 'high',
      state: 'active',
      riderVisible: true,
      riderVisibilityReason: 'gps-clear-required',
      vehicleCount: 0,
      uniqueVehicleCount: 0,
      currentVehicleCount: 0,
      likelyDetourRoadNames: ['Hooper Road'],
    })).toBe(false);
  });

  test('shows high-confidence detours', () => {
    expect(isRiderVisibleDetour({ confidence: 'high', vehicleCount: 2, state: 'active' })).toBe(true);
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

  test('filter excludes low-confidence active detours when validation visibility is requested', () => {
    expect(filterRiderVisibleDetours({
      lowActive: { confidence: 'low', state: 'active' },
      lowCleared: { confidence: 'low', state: 'cleared' },
      mediumOneVehicle: { confidence: 'medium', vehicleCount: 1, state: 'active' },
      mediumTwoVehicles: { confidence: 'medium', vehicleCount: 2, state: 'active' },
    }, { showLowConfidence: true })).toEqual({
      mediumTwoVehicles: { confidence: 'medium', vehicleCount: 2, state: 'active' },
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
