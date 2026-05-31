const {
  formatDetourMapLabel,
  formatDetourRoutesMetaLabel,
  shortenRoadNameForDetourLabel,
} = require('../utils/detourLabeling');

describe('detourLabeling', () => {
  test('builds compact map labels from routes and road names', () => {
    expect(formatDetourMapLabel({
      routeLineLabel: '10/11/101',
      roadNames: ['Mulcaster Street', 'Simcoe Street', 'Bayfield Street'],
    })).toBe('10/11/101 · Mulcaster St/Simcoe St');
  });

  test('falls back to route detour when no location is available', () => {
    expect(formatDetourMapLabel({ routeId: '10' })).toBe('10 detour');
  });

  test('formats route meta labels for detour cards', () => {
    expect(formatDetourRoutesMetaLabel(['10', '11', '101'])).toBe('Routes 10, 11, 101');
    expect(formatDetourRoutesMetaLabel(['12A'])).toBe('Route 12A');
  });

  test('shortens common road suffixes', () => {
    expect(shortenRoadNameForDetourLabel('Dunlop Street East')).toBe('Dunlop St E');
  });
});
