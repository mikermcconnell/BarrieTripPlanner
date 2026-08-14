const {
  extractDetourNoticeRoutes,
  getActiveDetourNotices,
  getUpcomingDetourNotices,
  normalizeDetourNotice,
} = require('../utils/upcomingDetourNotices');

describe('upcomingDetourNotices', () => {
  const now = Date.parse('2026-05-15T10:00:00-04:00');

  test('finds successfully parsed upcoming detours from MyRide-style notices', () => {
    const notices = [
      {
        id: '1646',
        title: 'Downtown Paving Detour - Routes 8A-NB, 8B-SB, 10, 11, 100 & 101',
        body: 'This detour is in effect from May 19 to June 12 due to paving in the downtown area.',
        publishedAt: now,
      },
      {
        id: '1648',
        title: 'Lakeshore Fun Run Detour - Route 8A-NB',
        body: 'Route 8A-NB will be on detour for the full day on May 27 along Lakeshore Drive.',
        publishedAt: now,
      },
      {
        id: '1642',
        title: "Farmer's Market Detour - Route 10",
        body: 'Beginning May 2, Route 10 is on detour downtown.',
        publishedAt: now,
      },
      {
        id: 'stop-closure',
        title: 'Stop 509 Closure - Route 12B',
        body: 'Stop 509 will be closed beginning May 20.',
        publishedAt: now,
      },
    ];

    const upcoming = getUpcomingDetourNotices(notices, now);

    expect(upcoming.map((item) => item.id)).toEqual(['1646', '1648']);
    expect(upcoming[0].routes).toEqual(['8A', '8B', '10', '11', '100', '101']);
    expect(upcoming[1]).toMatchObject({
      id: '1648',
      status: 'upcoming',
      routes: ['8A'],
      locationText: 'Route 8A-NB will be on detour for the full day on May 27 along Lakeshore Drive.',
    });
  });

  test('normalizes one-day "on May 27" notices as upcoming before that day', () => {
    const notice = normalizeDetourNotice({
      id: 'one-day',
      title: 'Lakeshore Fun Run Detour - Route 8A-NB',
      body: 'Route 8A-NB will be on detour for the full day on May 27.',
      publishedAt: now,
    }, now);

    expect(notice.status).toBe('upcoming');
    expect(new Date(notice.window.startsAt).getMonth()).toBe(4);
    expect(new Date(notice.window.startsAt).getDate()).toBe(27);
    expect(new Date(notice.window.endsAt).getDate()).toBe(27);
  });

  test('extracts route lists from direction-suffixed titles', () => {
    expect(extractDetourNoticeRoutes({
      title: 'Downtown Paving Detour - Routes 8A-NB, 8B-SB, 10, 11, 100 & 101',
    })).toEqual(['8A', '8B', '10', '11', '100', '101']);
  });

  test('keeps an active official Route 8B detour visible during an hourly holiday schedule', () => {
    const holidayNow = Date.parse('2026-08-03T10:00:00-04:00');
    const notices = [
      {
        id: '1679',
        title: 'Shanty Bay Detour - Route 8B-SB',
        body: 'Route 8B-SB is on detour from July 6 to September 4 due to a road closure on Shanty Bay.',
        url: 'https://www.myridebarrie.ca/News/1679/shanty-bay-detour-route-8b-sb/',
        publishedAt: Date.parse('2026-07-03T12:00:00-04:00'),
      },
      {
        id: '1673',
        title: 'Blake Detour - Routes 8A-NB, 8B-SB, 100, & 101',
        body: 'This detour is in effect on July 2 due to construction on Blake Street.',
        publishedAt: Date.parse('2026-07-01T12:00:00-04:00'),
        archivedAt: Date.parse('2026-07-03T08:00:00-04:00'),
      },
    ];

    expect(getActiveDetourNotices(notices, holidayNow)).toEqual([
      expect.objectContaining({
        id: 'official-route-detour-1679',
        type: 'official_route_detour',
        status: 'active',
        routes: ['8B'],
        sourceLabel: 'Active official detour',
        sourceUrl: notices[0].url,
        isOfficial: true,
      }),
    ]);
  });

  test('does not turn an active official notice into live GPS geometry', () => {
    const [notice] = getActiveDetourNotices([{
      id: '1679',
      title: 'Shanty Bay Detour - Route 8B-SB',
      body: 'Route 8B-SB is on detour from July 6 to September 4.',
      publishedAt: Date.parse('2026-07-03T12:00:00-04:00'),
    }], Date.parse('2026-08-03T10:00:00-04:00'));

    expect(notice).not.toHaveProperty('entryPoint');
    expect(notice).not.toHaveProperty('exitPoint');
    expect(notice).not.toHaveProperty('inferredDetourPolyline');
  });
});
