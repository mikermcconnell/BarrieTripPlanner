jest.mock('../lib/ai/runJsonTask', () => ({
  runJsonTask: jest.fn(() => Promise.resolve({ ok: false, skipped: true })),
}));

const {
  buildRuleStopClosures,
  extractStopClosureImpacts,
  extractStopCodesFromText,
  parseDateWindow,
  statusForDateWindow,
} = require('../newsImpactParser');

describe('newsImpactParser', () => {
  const stopIndex = {
    stopsByCode: new Map([
      ['509', { id: '509', code: '509', name: 'Mapleview at Lily', latitude: 44.1, longitude: -79.1 }],
      ['981', { id: '981', code: '981', name: 'Saunders stop', latitude: 44.2, longitude: -79.2 }],
      ['153', { id: '153', code: '153', name: 'Welham stop', latitude: 44.3, longitude: -79.3 }],
    ]),
    stopsById: new Map(),
  };

  test('extractStopCodesFromText handles single and multiple stop references', () => {
    expect(extractStopCodesFromText('Stop 509 Closure')).toEqual(['509']);
    expect(extractStopCodesFromText('stops 981 and 153 will also be placed out-of-service')).toEqual(['981', '153']);
  });

  test('buildRuleStopClosures only matches stop closure language', () => {
    expect(buildRuleStopClosures({ title: 'Stop 509 Closure', body: '' })).toMatchObject([
      { stopCode: '509', confidence: 'high', parser: 'rules' },
    ]);
    expect(buildRuleStopClosures({ title: 'Route 2 detour', body: 'Route 2 is on detour.' })).toEqual([]);
  });

  test('extractStopClosureImpacts validates stops against GTFS stop index', async () => {
    const impacts = await extractStopClosureImpacts([
      {
        id: '1638',
        title: 'Stop 509 Closure - Route 12B',
        body: 'Stop 509 (Mapleview at Lily), serviced by Route 12B, will be placed out of service.',
        affectedRoutes: ['12B'],
        url: 'https://example.test/news',
        source: 'myridebarrie',
        publishedAt: 1770000000000,
      },
    ], stopIndex, { now: '2026-04-29T12:00:00-04:00' });

    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({
      id: 'stopClosure_1638_509',
      type: 'stop_closure',
      stopId: '509',
      stopCode: '509',
      stopName: 'Mapleview at Lily',
      affectedRoutes: ['12B'],
      sourceNewsId: '1638',
      status: 'active',
    });
  });

  test('extractStopClosureImpacts keeps unmatched stop closures as non-mappable notices', async () => {
    const impacts = await extractStopClosureImpacts([
      {
        id: 'tod',
        title: 'TOD-F Stop Closures',
        body: 'Transit ON Demand Zone F stops 981 and 153 will also be placed out-of-service.',
        affectedRoutes: ['TOD-F'],
        url: 'https://example.test/news',
        source: 'myridebarrie',
      },
    ], { stopsByCode: new Map(), stopsById: new Map() }, { now: '2026-04-29T12:00:00-04:00' });

    expect(impacts).toHaveLength(2);
    expect(impacts[0]).toMatchObject({
      id: 'stopClosure_tod_unmatched_981',
      type: 'stop_closure',
      stopId: null,
      stopCode: '981',
      stopName: '',
      latitude: null,
      longitude: null,
      mappable: false,
    });
  });

  test('date windows mark future and expired closures correctly', async () => {
    const futureImpacts = await extractStopClosureImpacts([
      {
        id: 'future',
        title: 'Stop 509 Closure',
        body: 'Stop 509 will be placed out of service from May 10, 2026 until construction is complete.',
        publishedAt: Date.parse('2026-04-29T12:00:00Z'),
      },
    ], stopIndex, { now: '2026-04-29T12:00:00-04:00' });

    const expiredImpacts = await extractStopClosureImpacts([
      {
        id: 'expired',
        title: 'Stop 509 Closure',
        body: 'Stop 509 will be placed out of service from April 10 to April 20, 2026.',
        publishedAt: Date.parse('2026-04-09T12:00:00Z'),
      },
    ], stopIndex, { now: '2026-04-29T12:00:00-04:00' });

    expect(futureImpacts[0].status).toBe('upcoming');
    expect(expiredImpacts[0].status).toBe('expired');
  });

  test('parseDateWindow uses the published year when the text omits a year', () => {
    const window = parseDateWindow({
      title: 'Stop 966 Closure',
      body: 'Stop 966 is out of service beginning November 4 until the work is completed.',
      publishedAt: Date.parse('2025-11-04T16:23:27Z'),
    }, new Date('2026-04-29T12:00:00-04:00'));

    expect(new Date(window.startsAt).getFullYear()).toBe(2025);
    expect(statusForDateWindow(window, new Date('2026-04-29T12:00:00-04:00'))).toBe('active');
  });
});
