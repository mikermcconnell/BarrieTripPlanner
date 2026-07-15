const mockStorage = new Map();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key) => mockStorage.get(key) || null),
  setItem: jest.fn(async (key, value) => mockStorage.set(key, value)),
  removeItem: jest.fn(async (key) => mockStorage.delete(key)),
  multiRemove: jest.fn(async (keys) => keys.forEach((key) => mockStorage.delete(key))),
  getAllKeys: jest.fn(async () => [...mockStorage.keys()]),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
}));

import { getCachedGTFSData } from '../utils/offlineCache';

const writeCachePart = (key, data, ageMs) => {
  mockStorage.set(key, JSON.stringify({
    data,
    timestamp: Date.now() - ageMs,
  }));
};

describe('GTFS startup cache', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  test('keeps useful static map data for fast starts beyond one day', async () => {
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    writeCachePart('@barrie_transit_routes_cache', [{ id: '8A' }], twoDays);
    writeCachePart('@barrie_transit_stops_cache', [{ id: '100' }], twoDays);
    writeCachePart('@barrie_transit_mappings_cache', { trips: [] }, twoDays);
    writeCachePart('@barrie_transit_shapes_cache', { shape8A: [] }, twoDays);

    await expect(getCachedGTFSData()).resolves.toEqual(expect.objectContaining({
      routes: [{ id: '8A' }],
      stops: [{ id: '100' }],
      shapes: { shape8A: [] },
    }));
  });

  test('rejects static cache older than the seven-day fallback window', async () => {
    const eightDays = 8 * 24 * 60 * 60 * 1000;
    writeCachePart('@barrie_transit_routes_cache', [{ id: '8A' }], eightDays);
    writeCachePart('@barrie_transit_stops_cache', [{ id: '100' }], eightDays);

    await expect(getCachedGTFSData()).resolves.toBeNull();
  });
});
