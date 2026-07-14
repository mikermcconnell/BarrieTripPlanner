import {
  HOME_MAP_THEME,
  getAllRoutesOpacity,
  shouldClusterHomeVehicles,
} from '../config/homeMapTheme';

describe('home map theme', () => {
  test('calms all-route geometry by zoom tier', () => {
    expect(getAllRoutesOpacity(12.5)).toBe(HOME_MAP_THEME.routeOpacityContext);
    expect(getAllRoutesOpacity(13.5)).toBe(HOME_MAP_THEME.routeOpacityCorridor);
    expect(getAllRoutesOpacity(14.5)).toBe(HOME_MAP_THEME.routeOpacityDetail);
  });

  test('keeps near-overlap clustering available through detail zoom', () => {
    expect(HOME_MAP_THEME.vehicleClusterRadius).toBeLessThanOrEqual(HOME_MAP_THEME.busMarkerDiameter / 4);
    expect(shouldClusterHomeVehicles({ zoom: 12.8, hasSelection: false })).toBe(true);
    expect(shouldClusterHomeVehicles({ zoom: 15, hasSelection: true })).toBe(true);
    expect(shouldClusterHomeVehicles({ zoom: 17, hasSelection: false })).toBe(false);
  });

  test('uses accessible control sizes', () => {
    expect(HOME_MAP_THEME.routeChipHeight).toBeGreaterThanOrEqual(44);
    expect(HOME_MAP_THEME.locationButtonSize).toBeGreaterThanOrEqual(44);
    expect(HOME_MAP_THEME.busMarkerHitTarget).toBeGreaterThanOrEqual(44);
  });
});
