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

  test('uses the measured navigation bar when it exceeds the reported inset', () => {
    expect(getSafeBottomInset(12, { height: 2296 }, 'android', { height: 2400 }, 24)).toBe(80);
  });

  test('does not force three-button spacing onto gesture navigation', () => {
    expect(getSafeBottomInset(24, { height: 2400 }, 'android', { height: 2400 }, 24)).toBe(24);
  });

  test('uses a conservative fallback only when Android reports no inset', () => {
    expect(getSafeBottomInset(0, { height: 2400 }, 'android', { height: 2400 }, 24)).toBe(24);
  });

  test('adds a small Android-only lift for bottom chrome', () => {
    expect(getAndroidBottomChromeLift('android')).toBe(10);
    expect(getAndroidBottomChromeLift('ios')).toBe(0);
  });
});
