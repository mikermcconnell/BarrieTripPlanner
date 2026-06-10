const { buildOfficialBaselineImpactCandidates } = require('../officialBaselineImpactMatcher');

const route12Change = {
  routeId: '12B',
  changeType: 'route_stop_sequence_changed',
  significant: true,
  reasons: ['major_stop_removed', 'terminal_changed'],
  removedStops: [
    { id: '725', code: '725', name: 'Barrie South GO', isMajor: true },
  ],
  addedStops: [
    { id: '5960', code: '5960', name: 'Prince William at Mapleview' },
  ],
};

describe('officialBaselineImpactMatcher', () => {
  test('creates a high-confidence official impact when a GTFS route change matches a MyRide detour notice', () => {
    const newsItems = [{
      id: '1652',
      title: 'Mapleview Detour and Shuttle',
      body: 'Route 12 will be on detour due to a full closure of Mapleview Drive. Route 12 will not service Barrie South GO Station. A free shuttle service will operate with Route 15.',
      affectedRoutes: ['12A', '12B'],
      url: 'https://myridebarrie.ca/News/1652/mapleview-detour-and-shuttle/',
      publishedAt: Date.parse('2026-05-25T10:58:59-04:00'),
    }];

    const candidates = buildOfficialBaselineImpactCandidates({
      changes: [route12Change],
      newsItems,
      now: Date.parse('2026-06-09T12:00:00-04:00'),
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: 'baseline-detour-12b-1652',
      type: 'baseline_detour',
      status: 'active',
      sourceType: 'official_gtfs_change',
      confidence: 'high',
      routeId: '12B',
      routes: ['12B'],
      replacementRoutes: ['15'],
      sourceNewsId: '1652',
      sourceUrl: 'https://myridebarrie.ca/News/1652/mapleview-detour-and-shuttle/',
    });
    expect(candidates[0].summary).toContain('Barrie South GO');
    expect(candidates[0].matchReasons).toEqual(expect.arrayContaining([
      'route_match',
      'detour_notice',
      'removed_stop_name_match',
      'shuttle_notice',
    ]));
  });

  test('does not create a rider-facing candidate when no official notice matches the GTFS change', () => {
    const candidates = buildOfficialBaselineImpactCandidates({
      changes: [route12Change],
      newsItems: [{
        id: '999',
        title: 'Farmers Market Detour - Route 10 and 11',
        body: 'Routes 10 and 11 will be on detour downtown.',
        affectedRoutes: ['10', '11'],
      }],
    });

    expect(candidates).toEqual([]);
  });
});
