import { diffDetourRouteIds } from '../utils/detourNotificationUtils';

describe('diffDetourRouteIds', () => {
  test('suppresses notifications for the initial snapshot', () => {
    const result = diffDetourRouteIds({
      detourMap: { '1': {}, '8A': {} },
      prevIds: new Set(),
      hasSeenInitialSnapshot: false,
    });

    expect(result.nextIds).toEqual(['1', '8A']);
    expect(result.newRouteIds).toEqual([]);
  });

  test('returns only route ids that were not previously active', () => {
    const result = diffDetourRouteIds({
      detourMap: { '1': {}, '8A': {}, '3': {} },
      prevIds: new Set(['1', '3']),
      hasSeenInitialSnapshot: true,
    });

    expect(result.nextIds.slice().sort()).toEqual(['1', '3', '8A']);
    expect(result.newRouteIds).toEqual(['8A']);
  });
});
