import {
  diffDetourRouteIds,
  filterHighConfidenceDetourRouteIds,
  filterRelevantDetourRouteIds,
} from '../utils/detourNotificationUtils';

describe('diffDetourRouteIds', () => {
  test('suppresses notifications for the initial snapshot', () => {
    const result = diffDetourRouteIds({
      detourMap: { '1': { confidence: 'high' }, '8A': { confidence: 'medium', vehicleCount: 2 } },
      prevIds: new Set(),
      hasSeenInitialSnapshot: false,
    });

    expect(result.nextIds).toEqual(['1', '8A']);
    expect(result.newRouteIds).toEqual([]);
  });

  test('returns only route ids that were not previously active', () => {
    const result = diffDetourRouteIds({
      detourMap: { '1': { confidence: 'high' }, '8A': { confidence: 'medium', vehicleCount: 2 }, '3': { confidence: 'high' } },
      prevIds: new Set(['1', '3']),
      hasSeenInitialSnapshot: true,
    });

    expect(result.nextIds.slice().sort()).toEqual(['1', '3', '8A']);
    expect(result.newRouteIds).toEqual(['8A']);
  });

  test('ignores low-confidence detours for rider notifications', () => {
    const result = diffDetourRouteIds({
      detourMap: {
        '8A': { confidence: 'low' },
        '8B': { confidence: 'medium', vehicleCount: 2 },
        '1': { confidence: 'high' },
      },
      prevIds: new Set(),
      hasSeenInitialSnapshot: true,
    });

    expect(result.nextIds.sort()).toEqual(['1', '8B']);
    expect(result.newRouteIds.sort()).toEqual(['1', '8B']);
  });
});

describe('filterHighConfidenceDetourRouteIds', () => {
  test('keeps only high-confidence route ids for push notifications', () => {
    const result = filterHighConfidenceDetourRouteIds({
      routeIds: ['8A', '8B', '1'],
      detourMap: {
        '8A': { confidence: 'medium', vehicleCount: 2 },
        '8B': { confidence: 'high' },
        '1': { confidence: 'low' },
      },
    });

    expect(result).toEqual(['8B']);
  });
});

describe('filterRelevantDetourRouteIds', () => {
  test('only keeps detour route ids that match favorite routes', () => {
    const result = filterRelevantDetourRouteIds({
      routeIds: ['1', '8A', '12'],
      favoriteRoutes: [
        { id: '8A', shortName: '8A' },
        { id: 'route-12', shortName: '12' },
      ],
    });

    expect(result).toEqual(['8A', '12']);
  });

  test('returns no routes when the user has not saved route interests', () => {
    const result = filterRelevantDetourRouteIds({
      routeIds: ['1', '8A'],
      favoriteRoutes: [],
    });

    expect(result).toEqual([]);
  });
});
