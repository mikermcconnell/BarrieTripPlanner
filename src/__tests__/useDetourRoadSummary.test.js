import {
  extractRoadName,
  getDetourLookupPoints,
  buildDetourRoadSummary,
} from '../utils/detourRoadSummary';

describe('useDetourRoadSummary helpers', () => {
  test('extractRoadName prefers address road fields', () => {
    expect(extractRoadName({
      address: { road: 'Mapleview Drive East' },
      shortName: '12 Mapleview Drive East, Barrie',
    })).toBe('Mapleview Drive East');
  });

  test('extractRoadName falls back to shortName without house number', () => {
    expect(extractRoadName({
      shortName: '25 Prince William Way, Barrie',
    })).toBe('Prince William Way');
  });

  test('buildDetourRoadSummary dedupes names case-insensitively and limits the list', () => {
    expect(buildDetourRoadSummary([
      'Mapleview Drive East',
      'Prince William Way',
      'mapleview drive east',
      'Yonge Street',
      'Big Bay Point Road',
      'Huronia Road',
    ])).toEqual([
      'Mapleview Drive East',
      'Prince William Way',
      'Yonge Street',
      'Big Bay Point Road',
    ]);
  });

  test('getDetourLookupPoints keeps entry and exit points while sampling the detour interior', () => {
    const detour = {
      entryPoint: { latitude: 44.3800, longitude: -79.6900 },
      exitPoint: { latitude: 44.3900, longitude: -79.6800 },
      inferredDetourPolyline: [
        { latitude: 44.3800, longitude: -79.6900 },
        { latitude: 44.3820, longitude: -79.6880 },
        { latitude: 44.3840, longitude: -79.6860 },
        { latitude: 44.3860, longitude: -79.6840 },
        { latitude: 44.3880, longitude: -79.6820 },
        { latitude: 44.3900, longitude: -79.6800 },
      ],
    };

    const result = getDetourLookupPoints(detour);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ latitude: 44.3800, longitude: -79.6900 });
    expect(result[result.length - 1]).toEqual({ latitude: 44.3900, longitude: -79.6800 });
  });

  test('getDetourLookupPoints merges multi-segment detours without duplicate coordinates', () => {
    const result = getDetourLookupPoints({
      segments: [
        {
          entryPoint: { latitude: 44.3800, longitude: -79.6900 },
          exitPoint: { latitude: 44.3850, longitude: -79.6850 },
          inferredDetourPolyline: [
            { latitude: 44.3800, longitude: -79.6900 },
            { latitude: 44.3825, longitude: -79.6875 },
            { latitude: 44.3850, longitude: -79.6850 },
          ],
        },
        {
          entryPoint: { latitude: 44.3850, longitude: -79.6850 },
          exitPoint: { latitude: 44.3900, longitude: -79.6800 },
          inferredDetourPolyline: [
            { latitude: 44.3850, longitude: -79.6850 },
            { latitude: 44.3875, longitude: -79.6825 },
            { latitude: 44.3900, longitude: -79.6800 },
          ],
        },
      ],
    });

    expect(result.length).toBeLessThanOrEqual(5);
    expect(result[0]).toEqual({ latitude: 44.3800, longitude: -79.6900 });
    expect(result[result.length - 1]).toEqual({ latitude: 44.3900, longitude: -79.6800 });
  });
});
