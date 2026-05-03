describe('secureStorage', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('uses SecureStore-safe native keys', async () => {
    jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));

    const setItemAsync = jest.fn().mockResolvedValue(undefined);
    const getItemAsync = jest.fn().mockResolvedValue('cached');
    const deleteItemAsync = jest.fn().mockResolvedValue(undefined);
    jest.doMock('expo-secure-store', () => ({
      setItemAsync,
      getItemAsync,
      deleteItemAsync,
    }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      setItem: jest.fn(),
      getItem: jest.fn(),
      removeItem: jest.fn(),
    }));

    const { secureSet, secureGet, secureDelete, __TEST_ONLY__ } = require('../utils/secureStorage');

    expect(__TEST_ONLY__.toSecureStoreKey('@barrie_transit_user')).toBe('_barrie_transit_user');

    await secureSet('@barrie_transit_user', 'value');
    await secureGet('@barrie_transit_user');
    await secureDelete('@barrie_transit_user');

    expect(setItemAsync).toHaveBeenCalledWith('_barrie_transit_user', 'value');
    expect(getItemAsync).toHaveBeenCalledWith('_barrie_transit_user');
    expect(deleteItemAsync).toHaveBeenCalledWith('_barrie_transit_user');
  });
});
