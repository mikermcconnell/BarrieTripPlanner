const {
  applyAndroidLauncherName,
  applyIosLauncherName,
  getLauncherName,
} = require('../../plugins/withLauncherDisplayName');

describe('launcher display name plugin', () => {
  test('uses MyBarrie as the launcher fallback name', () => {
    expect(getLauncherName()).toBe('MyBarrie');
  });

  test('sets Android launcher app_name without changing the store name', () => {
    const stringsJson = {
      resources: {
        string: [{ $: { name: 'app_name' }, _: 'MyBarrie Transit' }],
      },
    };

    const result = applyAndroidLauncherName(stringsJson, 'MyBarrie');

    expect(result.resources.string).toContainEqual({
      $: { name: 'app_name' },
      _: 'MyBarrie',
    });
  });

  test('sets iOS launcher display name without removing existing plist values', () => {
    const result = applyIosLauncherName({ CFBundleName: 'MyBarrie Transit' }, 'MyBarrie');

    expect(result).toEqual({
      CFBundleName: 'MyBarrie Transit',
      CFBundleDisplayName: 'MyBarrie',
    });
  });
});
