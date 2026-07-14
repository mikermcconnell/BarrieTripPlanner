import { Dimensions, Platform, StatusBar, useWindowDimensions } from 'react-native';

const ANDROID_NAV_BAR_FALLBACK = 24;
const ANDROID_BOTTOM_CHROME_EXTRA_CLEARANCE = 10;

export const estimateAndroidNavigationBarHeight = ({
  screenHeight,
  windowHeight,
  statusBarHeight = 0,
} = {}) => {
  const delta = Math.max(0, (screenHeight || 0) - (windowHeight || 0));
  return Math.max(0, Math.round(delta - (statusBarHeight || 0)));
};

export const getAndroidNavigationBarHeight = (
  windowDimensions = Dimensions.get('window'),
  platformOS = Platform?.OS,
  screenDimensions = null,
  statusBarHeight = StatusBar?.currentHeight || 0
) => {
  if (platformOS !== 'android') return 0;

  const screen = screenDimensions || Dimensions.get('screen');
  return estimateAndroidNavigationBarHeight({
    screenHeight: screen?.height,
    windowHeight: windowDimensions?.height,
    statusBarHeight,
  });
};

export const addSafeBottomPadding = (basePadding = 0, safeBottomInset = 0) => (
  Math.max(0, basePadding || 0) + Math.max(0, safeBottomInset || 0)
);

export const getSafeBottomInset = (
  safeAreaBottom = 0,
  windowDimensions = Dimensions.get('window'),
  platformOS = Platform?.OS,
  screenDimensions = null,
  statusBarHeight = StatusBar?.currentHeight || 0
) => {
  if (platformOS !== 'android') return safeAreaBottom || 0;

  const measuredNavigationBar = getAndroidNavigationBarHeight(
    windowDimensions,
    platformOS,
    screenDimensions,
    statusBarHeight
  );
  const reportedInset = Math.max(0, safeAreaBottom || 0);

  if (reportedInset > 0 || measuredNavigationBar > 0) {
    return Math.max(reportedInset, measuredNavigationBar);
  }

  return ANDROID_NAV_BAR_FALLBACK;
};

export const getAndroidBottomChromeLift = (platformOS = Platform?.OS) => (
  platformOS === 'android' ? ANDROID_BOTTOM_CHROME_EXTRA_CLEARANCE : 0
);

export const useSafeBottomInset = (safeAreaBottom = 0) => {
  const windowDimensions = useWindowDimensions();
  return getSafeBottomInset(safeAreaBottom, windowDimensions);
};

export const useAndroidBottomChromeLift = () => getAndroidBottomChromeLift();

export const useSafeBottomPadding = (basePadding = 0, safeAreaBottom = 0) => (
  addSafeBottomPadding(basePadding, useSafeBottomInset(safeAreaBottom))
);
