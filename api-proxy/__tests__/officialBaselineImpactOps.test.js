const { createOfficialBaselineImpactOps } = require('../services/officialBaselineImpactOps');

const stop = (id, name) => ({ id, code: id, name, latitude: 44, longitude: -79 });

const previousSnapshot = {
  routeStopSequencesMapping: { '12B': { __default__: ['100', '725'] } },
  stopsById: {
    '100': stop('100', 'Big Bay Point at Ashford'),
    '725': stop('725', 'Barrie South GO'),
  },
};

const currentStaticData = {
  routeStopSequencesMapping: { '12B': { __default__: ['100', '5960'] } },
  stopsById: new Map([
    ['100', stop('100', 'Big Bay Point at Ashford')],
    ['5960', stop('5960', 'Prince William at Mapleview')],
  ]),
  lastRefresh: 1770000000000,
};

describe('officialBaselineImpactOps', () => {
  test('seeds the initial GTFS snapshot without publishing candidates', async () => {
    const saveLatestSnapshot = jest.fn().mockResolvedValue({ ok: true });
    const publishCandidates = jest.fn();
    const ops = createOfficialBaselineImpactOps({
      getStaticData: jest.fn().mockResolvedValue(currentStaticData),
      fetchNewsItems: jest.fn().mockResolvedValue([]),
      getLatestSnapshot: jest.fn().mockResolvedValue(null),
      saveLatestSnapshot,
      publishCandidates,
      now: () => 1770000001234,
    });

    const result = await ops.runOnce({ publishCandidates: true });

    expect(result.status).toBe('needs_initial_snapshot');
    expect(result.ok).toBe(true);
    expect(result.candidateCount).toBe(0);
    expect(saveLatestSnapshot).toHaveBeenCalledWith(expect.objectContaining({ routeCount: 1 }), { now: 1770000001234 });
    expect(publishCandidates).not.toHaveBeenCalled();
  });

  test('publishes matched candidates when enabled and stores the new snapshot', async () => {
    const publishCandidates = jest.fn().mockResolvedValue({ ok: true, publishedCount: 1, skipped: false });
    const saveLatestSnapshot = jest.fn().mockResolvedValue({ ok: true });
    const ops = createOfficialBaselineImpactOps({
      getStaticData: jest.fn().mockResolvedValue(currentStaticData),
      fetchNewsItems: jest.fn().mockResolvedValue([{
        id: '1652',
        title: 'Mapleview Detour and Shuttle',
        body: 'Route 12 will be on detour. Route 12 will not service Barrie South GO Station. Route 15 shuttle will operate.',
        affectedRoutes: ['12A', '12B'],
        url: 'https://myridebarrie.ca/News/1652/mapleview-detour-and-shuttle/',
      }]),
      getLatestSnapshot: jest.fn().mockResolvedValue(previousSnapshot),
      saveLatestSnapshot,
      publishCandidates,
      now: () => 1770000001234,
    });

    const result = await ops.runOnce({ publishCandidates: true });

    expect(result).toMatchObject({
      ok: true,
      status: 'evaluated',
      significantChangeCount: 1,
      candidateCount: 1,
      publishedCount: 1,
    });
    expect(publishCandidates).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'baseline-detour-12b-1652', routeId: '12B' }),
    ], { now: 1770000001234 });
    expect(saveLatestSnapshot).toHaveBeenCalledTimes(1);
  });
});
