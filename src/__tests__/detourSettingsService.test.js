describe('detourSettingsService kill switch', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadService({ enabledByDefault, storedValue = null }) {
    const getItem = jest.fn().mockResolvedValue(storedValue);
    const setItem = jest.fn().mockResolvedValue(undefined);
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: { getItem, setItem },
    }));
    jest.doMock('../config/runtimeConfig', () => ({
      __esModule: true,
      default: {
        detours: { enabledByDefault },
      },
    }));
    jest.doMock('../utils/logger', () => ({
      __esModule: true,
      default: {
        error: jest.fn(),
      },
    }));

    const service = require('../services/detourSettingsService');
    return { service, getItem, setItem };
  }

  test('does not allow stored preferences to enable detours when the build flag is off', async () => {
    const { service } = loadService({ enabledByDefault: false, storedValue: 'true' });

    await expect(service.getDetoursEnabled()).resolves.toBe(false);
  });

  test('rejects attempts to enable detours when the build flag is off', async () => {
    const { service, setItem } = loadService({ enabledByDefault: false });

    const result = await service.saveDetoursEnabled(true);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/disabled for this build/i);
    expect(setItem).not.toHaveBeenCalledWith(expect.any(String), 'true');
  });
});
