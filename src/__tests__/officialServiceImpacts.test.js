const {
  buildOfficialStopNotice,
  findOfficialImpactsForRoute,
  findOfficialImpactsForStop,
  getOfficialImpactRouteIds,
  getActiveOfficialServiceImpacts,
  normalizeOfficialServiceImpact,
} = require('../utils/officialServiceImpacts');

describe('officialServiceImpacts', () => {
  test('normalizes baseline detours as official rider notices', () => {
    const impact = normalizeOfficialServiceImpact('baseline-detour-12b-1652', {
      type: 'baseline_detour',
      status: 'active',
      routeId: '12B',
      routes: ['12B'],
      replacementRoutes: ['15'],
      title: 'Mapleview Detour and Shuttle',
      message: 'Route 12B no longer directly serves Barrie South GO. Use Route 15 shuttle.',
      sourceUrl: 'https://myridebarrie.ca/News/1652/mapleview-detour-and-shuttle/',
      sourceType: 'official_gtfs_change',
    });

    expect(impact).toMatchObject({
      id: 'baseline-detour-12b-1652',
      type: 'baseline_detour',
      status: 'active',
      routeId: '12B',
      affectedRoutes: ['12B'],
      replacementRoutes: ['15'],
      title: 'Mapleview Detour and Shuttle',
      message: 'Route 12B no longer directly serves Barrie South GO. Use Route 15 shuttle.',
      sourceLabel: 'Planned detour notice',
      isOfficial: true,
    });
  });

  test('returns active non-archived official impacts only', () => {
    const impacts = getActiveOfficialServiceImpacts([
      { id: 'active', type: 'baseline_detour', status: 'active', affectedRoutes: ['12B'] },
      { id: 'archived', type: 'baseline_detour', status: 'active', archivedAt: 1770000000000 },
      { id: 'candidate', type: 'baseline_detour', status: 'candidate' },
    ]);

    expect(impacts.map((impact) => impact.id)).toEqual(['active']);
  });

  test('matches branch and base route ids without using active detours', () => {
    const impacts = [
      { id: 'mapleview', type: 'baseline_detour', status: 'active', affectedRoutes: ['12B'] },
      { id: 'other', type: 'baseline_detour', status: 'active', affectedRoutes: ['8'] },
    ];

    expect(findOfficialImpactsForRoute('12', impacts).map((impact) => impact.id)).toEqual(['mapleview']);
    expect(findOfficialImpactsForRoute('12A', impacts).map((impact) => impact.id)).toEqual(['mapleview']);
  });

  test('matches stops removed by an official baseline detour', () => {
    const impacts = [{
      id: 'mapleview',
      type: 'baseline_detour',
      status: 'active',
      affectedRoutes: ['12B'],
      removedStops: [{ id: 'bsgo', code: '833', name: 'Barrie South GO' }],
    }];

    expect(findOfficialImpactsForStop({ id: 'bsgo', code: '833', name: 'Barrie South GO' }, impacts, '12').map((impact) => impact.id))
      .toEqual(['mapleview']);
  });

  test('builds official stop warning copy distinct from GPS detours', () => {
    const notice = buildOfficialStopNotice({
      stop: { id: 'bsgo', code: '833', name: 'Barrie South GO' },
      routeId: '12B',
      impact: {
        id: 'mapleview',
        title: 'Mapleview Detour and Shuttle',
        message: 'Route 12B no longer directly serves Barrie South GO.',
        affectedRoutes: ['12B'],
        replacementRoutes: ['15'],
        sourceUrl: 'https://myridebarrie.ca/News/1652/mapleview-detour-and-shuttle/',
      },
    });

    expect(notice).toMatchObject({
      type: 'official_baseline_stop',
      title: 'Planned detour notice: Barrie South GO is not served by Route 12B',
      sourceLabel: 'Planned detour notice',
      isOfficial: true,
      sourceUrl: 'https://myridebarrie.ca/News/1652/mapleview-detour-and-shuttle/',
    });
    expect(notice.message).toContain('Use Route 15 shuttle');
  });

  test('exposes affected and replacement routes for map focus', () => {
    expect(getOfficialImpactRouteIds({
      affectedRoutes: ['12B'],
      replacementRoutes: ['15'],
    })).toEqual(['12B', '15']);
  });
});
