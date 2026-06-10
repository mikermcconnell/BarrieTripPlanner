const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const {
  dismissOfficialImpact,
  filterDismissedOfficialImpacts,
  loadDismissedOfficialImpactIds,
} = require('../utils/officialImpactDismissals');

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

describe('officialImpactDismissals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('filters dismissed planned detour notices by id', () => {
    const impacts = [
      { id: 'baseline-detour-12b-1652', title: 'Mapleview Detour and Shuttle' },
      { id: 'other', title: 'Other notice' },
    ];

    expect(filterDismissedOfficialImpacts(impacts, ['baseline-detour-12b-1652']).map((impact) => impact.id))
      .toEqual(['other']);
  });

  test('persists dismissed planned detour notice ids', async () => {
    AsyncStorage.getItem.mockResolvedValue(JSON.stringify(['old']));

    const ids = await dismissOfficialImpact('baseline-detour-12b-1652');

    expect(ids).toEqual(['old', 'baseline-detour-12b-1652']);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@barrie_transit_dismissed_official_impacts',
      JSON.stringify(['old', 'baseline-detour-12b-1652'])
    );
  });

  test('loads an empty list when nothing has been dismissed', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);

    await expect(loadDismissedOfficialImpactIds()).resolves.toEqual([]);
  });
});
