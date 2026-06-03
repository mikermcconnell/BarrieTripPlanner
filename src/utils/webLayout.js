const WEB_DESKTOP_MIN_WIDTH = 900;
const WEB_SIDEBAR_WIDTH = 232;
const WEB_CONTENT_MAX_WIDTH = 1120;
const WEB_MAP_SIDE_PANEL_WIDTH = 280;

const isWideWebViewport = ({ platform, width }) => (
  platform === 'web' && Number(width) >= WEB_DESKTOP_MIN_WIDTH
);

const getDesktopTabBarStyle = ({ isWideWeb }) => {
  if (!isWideWeb) return null;

  return {
    width: WEB_SIDEBAR_WIDTH,
    height: '100%',
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderRightColor: 'rgba(223, 225, 230, 0.8)',
    boxShadow: '2px 0 18px rgba(23, 43, 77, 0.05)',
  };
};

const getDesktopContentFrameStyle = ({ isWideWeb }) => {
  if (!isWideWeb) return null;

  return {
    width: '100%',
    maxWidth: WEB_CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  };
};

const getRouteFilterPanelStyle = ({ isWideWeb }) => {
  if (!isWideWeb) return null;

  return {
    position: 'absolute',
    top: 72,
    left: 16,
    width: WEB_MAP_SIDE_PANEL_WIDTH,
    maxHeight: 520,
  };
};

const getMapChromeOffsets = ({ isWideWeb, hasDetours }) => {
  if (!isWideWeb) {
    return {
      routeFilterTop: 72,
      detourTop: hasDetours ? 122 : 72,
      mapViewTop: hasDetours ? 174 : 116,
      leftPanelWidth: 0,
    };
  }

  return {
    routeFilterTop: 72,
    detourTop: 72,
    mapViewTop: hasDetours ? 124 : 72,
    leftPanelWidth: WEB_MAP_SIDE_PANEL_WIDTH,
  };
};

module.exports = {
  WEB_DESKTOP_MIN_WIDTH,
  WEB_SIDEBAR_WIDTH,
  WEB_CONTENT_MAX_WIDTH,
  WEB_MAP_SIDE_PANEL_WIDTH,
  isWideWebViewport,
  getDesktopTabBarStyle,
  getDesktopContentFrameStyle,
  getRouteFilterPanelStyle,
  getMapChromeOffsets,
};
