const {
  PLATFORM_MAP_SOURCE_URL,
  PLATFORM_MAPS,
  getPlatformMapForStop,
  getPlatformMapByHubId,
} = require('../config/platformMaps');

describe('platformMaps config', () => {
  test('defines the City of Barrie source PDF and five hub pages', () => {
    expect(PLATFORM_MAP_SOURCE_URL).toBe('https://www.barrie.ca/Transit-Platform-Maps.pdf');
    expect(PLATFORM_MAPS.map((map) => [map.id, map.pageNumber])).toEqual([
      ['allandale-terminal', 1],
      ['downtown-hub', 2],
      ['park-place-terminal', 3],
      ['barrie-south-go', 4],
      ['georgian-college', 5],
    ]);
  });

  test('matches Georgian College by stop code and id', () => {
    expect(getPlatformMapForStop({ id: '335', code: '335', name: 'Georgian College' })).toEqual(
      expect.objectContaining({ id: 'georgian-college', pageNumber: 5 })
    );
    expect(getPlatformMapForStop({ id: 329, code: 329, name: 'Georgian at Govenors' })).toEqual(
      expect.objectContaining({ id: 'georgian-college', pageNumber: 5 })
    );
  });

  test('matches Allandale platform stops to page 1', () => {
    expect(getPlatformMapForStop({ id: '9003', code: '9003' })).toEqual(
      expect.objectContaining({ id: 'allandale-terminal', pageNumber: 1 })
    );
    expect(getPlatformMapForStop({ id: '9013', code: '9013' })).toEqual(
      expect.objectContaining({ id: 'allandale-terminal', pageNumber: 1 })
    );
  });

  test('matches Downtown, Park Place, and Barrie South GO', () => {
    expect(getPlatformMapForStop({ id: '1', code: '1' })).toEqual(
      expect.objectContaining({ id: 'downtown-hub', pageNumber: 2 })
    );
    expect(getPlatformMapForStop({ id: '777', code: '777' })).toEqual(
      expect.objectContaining({ id: 'park-place-terminal', pageNumber: 3 })
    );
    expect(getPlatformMapForStop({ id: '725', code: '725' })).toEqual(
      expect.objectContaining({ id: 'barrie-south-go', pageNumber: 4 })
    );
  });

  test('returns null for unsupported stops and unknown hub IDs', () => {
    expect(getPlatformMapForStop({ id: '440', code: '440', name: 'Georgian Mall' })).toBeNull();
    expect(getPlatformMapForStop(null)).toBeNull();
    expect(getPlatformMapByHubId('unknown')).toBeNull();
  });
});
