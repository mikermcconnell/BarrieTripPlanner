const {
  isWideWebViewport,
  getDesktopTabBarStyle,
  getDesktopContentFrameStyle,
  getRouteFilterPanelStyle,
  getMapChromeOffsets,
} = require('../utils/webLayout');

describe('web layout helpers', () => {
  test('uses desktop treatment only for wide web viewports', () => {
    expect(isWideWebViewport({ platform: 'web', width: 1200 })).toBe(true);
    expect(isWideWebViewport({ platform: 'web', width: 700 })).toBe(false);
    expect(isWideWebViewport({ platform: 'ios', width: 1200 })).toBe(false);
  });

  test('desktop tab bar becomes a left rail instead of a bottom bar', () => {
    expect(getDesktopTabBarStyle({ isWideWeb: true })).toEqual(expect.objectContaining({
      width: 232,
      height: '100%',
      borderRightWidth: 1,
      paddingHorizontal: 16,
    }));
  });

  test('desktop content does not stretch full browser width', () => {
    expect(getDesktopContentFrameStyle({ isWideWeb: true })).toEqual(expect.objectContaining({
      width: '100%',
      maxWidth: 1120,
      alignSelf: 'center',
    }));
    expect(getDesktopContentFrameStyle({ isWideWeb: false })).toBeNull();
  });

  test('route filter panel is a desktop side panel when wide', () => {
    expect(getRouteFilterPanelStyle({ isWideWeb: true })).toEqual(expect.objectContaining({
      position: 'absolute',
      top: 72,
      left: 16,
      width: 280,
      maxHeight: 520,
    }));
  });

  test('map chrome offsets avoid top overlay collisions', () => {
    expect(getMapChromeOffsets({ isWideWeb: true, hasDetours: true })).toEqual(expect.objectContaining({
      routeFilterTop: 72,
      detourTop: 72,
      mapViewTop: 124,
    }));
  });
});
