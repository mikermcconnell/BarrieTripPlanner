const {
  evaluateRiderAlertVisibility,
} = require('../detour/alertVisibility');

describe('rider detour alert visibility', () => {
  test('keeps a confirmed active alert public when stale mixed evidence hides its path', () => {
    expect(evaluateRiderAlertVisibility({
      state: 'active',
      confidence: 'high',
      uniqueVehicleCount: 57,
      riderVisible: false,
      riderVisibilityReason: 'stale-mixed-evidence',
      canShowDetourPath: false,
    })).toEqual({
      alertVisible: true,
      reason: 'active-detour-details-unavailable',
    });
  });

  test('does not publish an alert before two vehicles confirm the detour', () => {
    expect(evaluateRiderAlertVisibility({
      state: 'active',
      confidence: 'medium',
      uniqueVehicleCount: 1,
      riderVisible: false,
    }).alertVisible).toBe(false);
  });

  test.each([
    'baseline-update-pending',
    'baseline-diverged',
    'suppressed-invalid-geometry',
    'zero-confirmed-vehicle-count',
  ])('keeps %s records out of rider alerts', (reason) => {
    expect(evaluateRiderAlertVisibility({
      state: 'active',
      confidence: 'high',
      uniqueVehicleCount: 3,
      riderVisible: false,
      riderVisibilityReason: reason,
    })).toEqual({ alertVisible: false, reason });
  });

  test('removes the alert after the event clears', () => {
    expect(evaluateRiderAlertVisibility({
      state: 'cleared',
      confidence: 'high',
      uniqueVehicleCount: 3,
    })).toEqual({ alertVisible: false, reason: 'detour-cleared' });
  });
});
