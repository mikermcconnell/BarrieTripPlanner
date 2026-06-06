jest.mock('../lib/ai/runJsonTask', () => ({
  runJsonTask: jest.fn(() => Promise.resolve({ ok: false, skipped: true })),
}));

const {
  buildNoticeStopImpactsFromText,
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
    expect(extractStopCodesFromText('Stops 88 (Bayfield at Dunlop) and 89 (Bayfield at Chase McEachern) will be out of service.')).toEqual(['88', '89']);
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

  test('parseDateWindow handles beginning/until wording', () => {
    const window = parseDateWindow({
      title: 'Stop 509 Closure',
      body: 'Stop 509 is out of service beginning May 10 until May 20, 2026.',
      publishedAt: Date.parse('2026-05-01T12:00:00Z'),
    }, new Date('2026-05-14T12:00:00-04:00'));

    expect(new Date(window.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric' })).toBe('May 10, 2026');
    expect(new Date(window.endsAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric' })).toBe('May 20, 2026');
  });

  test('parseDateWindow handles one-day "on May 27" detour wording', () => {
    const window = parseDateWindow({
      title: 'Lakeshore Fun Run Detour - Route 8A-NB',
      body: 'Route 8A-NB will be on detour for the full day on May 27 due to a northbound road closure.',
      publishedAt: Date.parse('2026-05-15T15:04:43Z'),
    }, new Date('2026-05-15T12:00:00-04:00'));

    expect(new Date(window.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric' })).toBe('May 27, 2026');
    expect(new Date(window.endsAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric' })).toBe('May 27, 2026');
    expect(statusForDateWindow(window, new Date('2026-05-15T12:00:00-04:00'))).toBe('upcoming');
  });

  test('parseDateWindow handles weekday-qualified single-day notices with time ranges', async () => {
    const impacts = await extractStopClosureImpacts([
      {
        id: '1659',
        title: 'Stops 88 & 89 Closure Notice',
        body: 'Stops 88 (Bayfield at Dunlop) and 89 (Bayfield at Chase McEachern) will be out of service from 7:30 AM to 9:30 AM on Sunday, June 7, due to a road closure on Bayfield Street.',
        affectedRoutes: ['10', '11', '100', '101'],
        publishedAt: Date.parse('2026-06-04T13:11:53Z'),
      },
    ], {
      stopsByCode: new Map([
        ['88', { id: '88', code: '88', name: 'Bayfield at Dunlop', latitude: 44.4, longitude: -79.7 }],
        ['89', { id: '89', code: '89', name: 'Bayfield at Chase McEachern', latitude: 44.41, longitude: -79.71 }],
      ]),
      stopsById: new Map(),
    }, { now: '2026-06-05T16:00:00-04:00' });

    expect(impacts.map((impact) => impact.stopCode)).toEqual(['88', '89']);
    expect(impacts.map((impact) => impact.status)).toEqual(['upcoming', 'upcoming']);
    expect(impacts[0].startsAt).toBe(Date.parse('2026-06-07T07:30:00-04:00'));
    expect(impacts[0].endsAt).toBe(Date.parse('2026-06-07T09:30:00-04:00'));
    expect(new Date(impacts[0].startsAt).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })).toBe('Jun 7, 7:30 a.m.');
    expect(new Date(impacts[0].endsAt).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })).toBe('Jun 7, 9:30 a.m.');
  });

  test('buildNoticeStopImpactsFromText captures Saunders/Welham official PDF stop impacts', () => {
    const pdfText = [
      'Detour Notice',
      'Route 12',
      'Stop 931',
      'Welham at Hooper',
      'Stop 932',
      'Welham at Hooper',
      'Temp Stop 6170',
      'Saunders at Hooper',
      'Stop 933',
      'Saunders at Welham',
      'Stop 618',
      'Saunders at Welham',
      'Stop 756',
      'Saunders at Hooper',
      'Stop 617',
      'Saunders at Hooper',
      'Temp Stop 7560',
      'Saunders at Hooper',
      'Temp Stop 9310',
      'Hooper at Welham',
    ].join('\n');

    const impacts = buildNoticeStopImpactsFromText(pdfText);

    expect(impacts.stopClosureCandidates.map((stop) => stop.stopCode).sort()).toEqual([
      '617',
      '618',
      '756',
      '931',
      '932',
      '933',
    ]);
    expect(impacts.temporaryStops.map((stop) => stop.stopCode).sort()).toEqual([
      '6170',
      '7560',
      '9310',
    ]);
  });

  test('buildNoticeStopImpactsFromText ignores active stops and map labels outside the out-of-service section', () => {
    const downtownPdfText = [
      'DETOUR NOTICE',
      'Routes 7, 8A-NB, 8B-SB, 10, 11, 12, 100, & 101',
      'Detour',
      'Routing',
      'Out-of-Service',
      'Stops',
      'Active',
      'Stops',
      'Stop 189',
      'Stop 192',
      'Stop 191',
      'Stop 187',
      'Stop 88',
      'Stop 89',
      'Temporary',
      'Stops',
      'Temp Stop',
      'Simcoe at Meridian',
      'Stop 1',
      'Stop 2',
    ].join('\n');

    const impacts = buildNoticeStopImpactsFromText(downtownPdfText);

    expect(impacts.stopClosureCandidates).toEqual([]);
    expect(impacts.temporaryStops).toEqual([]);
  });
});
