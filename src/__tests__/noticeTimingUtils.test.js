const {
  findRouteDetourNotice,
  formatNoticeDate,
  getNoticeEndText,
  noticeWindowStatus,
  parseNoticeDateWindow,
  toNoticeTimestamp,
} = require('../utils/noticeTimingUtils');

describe('noticeTimingUtils', () => {
  test('formats parsed MyRide end dates for rider notices', () => {
    const endsAt = Date.parse('2026-05-20T23:59:59-04:00');

    expect(formatNoticeDate(endsAt)).toBe('May 20, 2026');
    expect(getNoticeEndText({ endsAt })).toBe('Expected end date: May 20, 2026');
  });

  test('supports Firestore timestamp-like values', () => {
    expect(toNoticeTimestamp({ seconds: 1779321599, nanoseconds: 0 })).toBe(1779321599000);
  });

  test('finds a route detour notice and parses its end date', () => {
    const notice = findRouteDetourNotice('12', [{
      id: 'route-12-detour',
      title: 'Route 12 detour',
      body: 'Route 12 will be on detour from May 10 to May 20, 2026.',
      affectedRoutes: ['12'],
      url: 'https://www.myridebarrie.ca/News/route-12-detour/',
      publishedAt: Date.parse('2026-05-01T12:00:00Z'),
    }], Date.parse('2026-05-14T12:00:00-04:00'));

    expect(notice.title).toBe('Route 12 detour');
    expect(getNoticeEndText({ endsAt: notice.window.endsAt })).toBe('Expected end date: May 20, 2026');
  });

  test('parses open-ended notices as no known end date', () => {
    const window = parseNoticeDateWindow({
      title: 'Route 8 detour',
      body: 'Route 8 is on detour beginning May 10 until construction is complete.',
      publishedAt: Date.parse('2026-05-01T12:00:00Z'),
    });

    expect(formatNoticeDate(window.startsAt)).toBe('May 10, 2026');
    expect(window.endsAt).toBeNull();
    expect(getNoticeEndText(window)).toBe('End date not listed');
  });

  test('parses beginning/until wording from MyRide notices', () => {
    const window = parseNoticeDateWindow({
      title: 'Route 8 detour',
      body: 'Route 8 is on detour beginning May 10 until May 20, 2026.',
      publishedAt: Date.parse('2026-05-01T12:00:00Z'),
    });

    expect(formatNoticeDate(window.startsAt)).toBe('May 10, 2026');
    expect(getNoticeEndText(window)).toBe('Expected end date: May 20, 2026');
  });

  test('parses one-day "on May 27" service notices as an upcoming full-day window', () => {
    const window = parseNoticeDateWindow({
      title: 'Lakeshore Fun Run Detour - Route 8A-NB',
      body: 'Route 8A-NB will be on detour for the full day on May 27 due to a northbound road closure.',
      publishedAt: Date.parse('2026-05-15T15:04:43Z'),
    });

    expect(formatNoticeDate(window.startsAt)).toBe('May 27, 2026');
    expect(formatNoticeDate(window.endsAt)).toBe('May 27, 2026');
    expect(noticeWindowStatus(window, Date.parse('2026-05-15T12:00:00-04:00'))).toBe('upcoming');
  });
});
