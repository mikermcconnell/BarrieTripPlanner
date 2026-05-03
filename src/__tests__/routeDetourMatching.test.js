import {
  getMatchingDetourRouteIds,
  getRouteDetourFromMap,
  routeIsDetouring,
  routeMatchesDetourRoute,
} from '../utils/routeDetourMatching';

describe('route detour matching', () => {
  const activeDetours = {
    '8A': { routeId: '8A', state: 'active' },
    '8B': { routeId: '8B', state: 'active' },
    '10': { routeId: '10', state: 'active' },
    '11': { routeId: '11', state: 'cleared' },
  };

  test('matches exact detour route ids', () => {
    expect(routeMatchesDetourRoute('8A', '8A')).toBe(true);
    expect(routeMatchesDetourRoute('10', '10')).toBe(true);
  });

  test('matches base route ids to active lettered detour variants', () => {
    expect(routeMatchesDetourRoute('8', '8A')).toBe(true);
    expect(routeMatchesDetourRoute('8', '8B')).toBe(true);
    expect(routeIsDetouring('8', new Set(['8A', '8B']))).toBe(true);
  });

  test('keeps selected lettered variants exact', () => {
    expect(routeMatchesDetourRoute('8A', '8B')).toBe(false);
    expect(getMatchingDetourRouteIds('8A', activeDetours)).toEqual(['8A']);
  });

  test('expands base route to all active detour variants', () => {
    expect(getMatchingDetourRouteIds('8', activeDetours)).toEqual(['8A', '8B']);
  });

  test('ignores cleared detours when matching a base route', () => {
    expect(getMatchingDetourRouteIds('11', activeDetours)).toEqual([]);
  });

  test('returns exact detour first, then family match fallback', () => {
    expect(getRouteDetourFromMap('8A', activeDetours)?.routeId).toBe('8A');
    expect(getRouteDetourFromMap('8', activeDetours)?.routeId).toBe('8A');
    expect(getRouteDetourFromMap('7', activeDetours)).toBeNull();
  });
});
