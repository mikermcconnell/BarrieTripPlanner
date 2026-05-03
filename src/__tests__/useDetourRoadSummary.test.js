import {
  extractRoadName,
  getDetourLookupPoints,
  buildDetourRoadSummary,
  getPrecomputedDetourRoadNames,
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

  test('getDetourLookupPoints prefers the likely detour path when available', () => {
    const likelyPath = [
      { latitude: 44.3800, longitude: -79.6900 },
      { latitude: 44.3810, longitude: -79.6890 },
      { latitude: 44.3820, longitude: -79.6880 },
    ];
    const result = getDetourLookupPoints({
      entryPoint: { latitude: 44.3800, longitude: -79.6900 },
      exitPoint: { latitude: 44.3820, longitude: -79.6880 },
      likelyDetourPolyline: likelyPath,
      inferredDetourPolyline: [
        { latitude: 45, longitude: -80 },
        { latitude: 45.1, longitude: -80.1 },
      ],
    });

    expect(result).toContainEqual({ latitude: 44.3810, longitude: -79.6890 });
    expect(result).not.toContainEqual({ latitude: 45.1, longitude: -80.1 });
  });

  test('getPrecomputedDetourRoadNames dedupes top-level and segment road names', () => {
    expect(getPrecomputedDetourRoadNames({
      likelyDetourRoadNames: ['Yonge Street', 'Mapleview Drive East'],
      segments: [
        { likelyDetourRoadNames: ['yonge street', 'Big Bay Point Road'] },
      ],
    })).toEqual([
      'Yonge Street',
      'Mapleview Drive East',
      'Big Bay Point Road',
    ]);
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
