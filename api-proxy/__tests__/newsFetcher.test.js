const {
  NEWS_API_URL,
  NEWS_PAGE_URL,
  extractAffectedRoutes,
  fetchNewsItems,
  normalizeMyRideNewsItem,
} = require('../newsFetcher');

describe('newsFetcher', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('extractAffectedRoutes finds route references in text', () => {
    expect(extractAffectedRoutes('Route 8 and route 12B are delayed.')).toEqual(['8', '12B']);
  });

  test('normalizeMyRideNewsItem maps MyRide JSON to app news shape', () => {
    expect(
      normalizeMyRideNewsItem({
        newsId: 1642,
        title: "Farmer's Market Detour - Route 10 and 11 (Saturdays Only)",
        friendlyUrl: 'farmers-market-detour-route-10-and-11-saturdays-only',
        summary: 'Route 10 & 11 will be on detour on Saturdays.',
        routes: ['10', '11'],
        affectsAllRoutes: false,
        publishDateUtc: '2026-04-29T14:17:31.7213937+00:00',
      })
    ).toEqual({
      id: '1642',
      title: "Farmer's Market Detour - Route 10 and 11 (Saturdays Only)",
      body: 'Route 10 & 11 will be on detour on Saturdays.',
      date: '2026-04-29T14:17:31.7213937+00:00',
      affectedRoutes: ['10', '11'],
      affectsAllRoutes: false,
      url: `${NEWS_PAGE_URL}/1642/farmers-market-detour-route-10-and-11-saturdays-only/`,
      publishedAt: Date.parse('2026-04-29T14:17:31.7213937+00:00'),
      source: 'myridebarrie',
      sourceUrl: NEWS_API_URL,
    });
  });

  test('normalizeMyRideNewsItem combines explicit route data with route references in title and summary', () => {
    expect(
      normalizeMyRideNewsItem({
        newsId: 1637,
        title: 'Saunders/Welham Detour - Route 12 & TOD-F',
        summary: 'Transit ON Demand Zone F stops 981 and 153 will also be placed out-of-service.',
        routes: ['TOD-F'],
        affectsAllRoutes: false,
      }).affectedRoutes
    ).toEqual(['TOD-F', '12']);
  });

  test('fetchNewsItems loads and normalizes the public MyRide JSON endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          newsId: 1641,
          title: 'Dunlop Detour - Route 2',
          friendlyUrl: 'dunlop-detour-route-2',
          summary: 'Route 2 will be on detour.',
          routes: ['2A', '2B'],
          affectsAllRoutes: false,
          publishDateUtc: '2026-04-28T12:14:12.2013132+00:00',
        },
      ],
    });

    const items = await fetchNewsItems();

    expect(global.fetch).toHaveBeenCalledWith(
      NEWS_API_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      })
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: '1641',
      title: 'Dunlop Detour - Route 2',
      body: 'Route 2 will be on detour.',
      affectedRoutes: ['2A', '2B'],
    });
  });

  test('fetchNewsItems returns empty array when MyRide returns an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(fetchNewsItems()).resolves.toEqual([]);
  });
});
