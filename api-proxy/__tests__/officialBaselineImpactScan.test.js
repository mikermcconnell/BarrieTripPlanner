const { buildOfficialBaselineImpactScan } = require('../officialBaselineImpactScan');

const stop = (id, name) => ({ id, code: id, name, latitude: 44, longitude: -79 });

const previousSnapshot = {
  routeStopSequencesMapping: {
    '12B': { __default__: ['100', '725'] },
  },
  stopsById: {
    '100': stop('100', 'Big Bay Point at Ashford'),
    '725': stop('725', 'Barrie South GO'),
  },
};

const currentSnapshot = {
  routeStopSequencesMapping: {
    '12B': { __default__: ['100', '5960'] },
  },
  stopsById: {
    '100': stop('100', 'Big Bay Point at Ashford'),
    '5960': stop('5960', 'Prince William at Mapleview'),
  },
};

describe('officialBaselineImpactScan', () => {
  test('returns official baseline impact candidates from a previous/current GTFS snapshot diff', () => {
    const scan = buildOfficialBaselineImpactScan({
      previousSnapshot,
      currentSnapshot,
      newsItems: [{
        id: '1652',
        title: 'Mapleview Detour and Shuttle',
        body: 'Route 12 will be on detour. Route 12 will not service Barrie South GO Station. Route 15 shuttle will operate.',
        affectedRoutes: ['12A', '12B'],
        url: 'https://myridebarrie.ca/News/1652/mapleview-detour-and-shuttle/',
      }],
    });

    expect(scan).toMatchObject({
      status: 'evaluated',
      significantChangeCount: 1,
      candidateCount: 1,
    });
    expect(scan.candidates[0]).toMatchObject({
      id: 'baseline-detour-12b-1652',
      routeId: '12B',
      confidence: 'high',
    });
  });

  test('does not evaluate rider-facing candidates when no previous GTFS snapshot exists', () => {
    const scan = buildOfficialBaselineImpactScan({
      previousSnapshot: null,
      currentSnapshot,
      newsItems: [],
    });

    expect(scan).toEqual({
      status: 'needs_initial_snapshot',
      changes: [],
      significantChanges: [],
      candidates: [],
      changeCount: 0,
      significantChangeCount: 0,
      candidateCount: 0,
    });
  });
});
