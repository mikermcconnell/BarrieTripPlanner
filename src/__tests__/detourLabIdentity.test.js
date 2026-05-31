const appBase = require('../../app.base.json');

const scripts = require('../../package.json').scripts;

describe('detour lab app identity', () => {
  test('uses a separate native app identity from production', () => {
    expect(appBase.expo.name).toBe('My Barrie Transit Lab');
    expect(appBase.expo.slug).toBe('barrie-transit-planner-detour-lab');
    expect(appBase.expo.scheme).toBe('barrie-transit-lab');
    expect(appBase.expo.android.package).toBe('com.barrietransit.planner.detourlab');
    expect(appBase.expo.ios.bundleIdentifier).toBe('com.barrietransit.planner.detourlab');
    expect(appBase.expo.updates.enabled).toBe(false);
  });

  test('Android helper scripts launch the lab package', () => {
    expect(scripts['android:dev']).toContain('com.barrietransit.planner.detourlab');
    expect(scripts['android:dev:launch']).toContain('com.barrietransit.planner.detourlab');
    expect(scripts['android:stable']).toContain('com.barrietransit.planner.detourlab');
  });
});
