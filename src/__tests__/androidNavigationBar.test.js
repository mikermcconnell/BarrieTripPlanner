import {
  addSafeBottomPadding,
  estimateAndroidNavigationBarHeight,
  getAndroidBottomChromeLift,
  getSafeBottomInset,
} from '../utils/androidNavigationBar';

describe('androidNavigationBar', () => {
  test('estimates nav bar height from screen/window delta minus status bar', () => {
    expect(estimateAndroidNavigationBarHeight({
      screenHeight: 2400,
      windowHeight: 2296,
      statusBarHeight: 24,
    })).toBe(80);
  });

  test('never returns negative values', () => {
    expect(estimateAndroidNavigationBarHeight({
      screenHeight: 2200,
      windowHeight: 2296,
      statusBarHeight: 24,
    })).toBe(0);
  });

  test('combines existing screen padding with the safe bottom inset', () => {
    expect(addSafeBottomPadding(24, 56)).toBe(80);
  });

  test('keeps the larger Android bottom protection when safe area is smaller', () => {
    expect(getSafeBottomInset(12, { height: 2296 }, 'android', { height: 2400 }, 24)).toBeGreaterThanOrEqual(56);
  });

  test('adds a small Android-only lift for bottom chrome', () => {
    expect(getAndroidBottomChromeLift('android')).toBe(10);
    expect(getAndroidBottomChromeLift('ios')).toBe(0);
  });
});
