jest.mock('../utils/fetchWithCORS', () => ({ fetchWithCORS: jest.fn() }));
const { createArrivalDestinationPatterns, resolveArrivalDestination } = require('../utils/arrivalDestination');
const { getArrivalsForStop } = require('../services/arrivalService');

const pattern = (headsign = 'Park Place', stopIds = ['A', 'B', 'C', 'D']) => ({ headsign, stopIds });
const update = (ids = ['B', 'C', 'D'], extra = {}) => ({
  tripId: 'unmatched-live-trip', routeId: '8A', scheduleRelationship: 'SCHEDULED',
  stopTimeUpdates: ids.map((stopId, i) => ({ stopId, stopSequence: i + 20,
    arrival: { time: Math.floor(Date.now() / 1000) + 300 + i * 60, delay: 152 } })), ...extra,
});
const resolve = (u, patterns = [pattern()]) => resolveArrivalDestination(u, 0, { '8A': patterns });

test('matches a complete remaining sequence, without assuming static sequence numbers match', () => {
  expect(resolve(update())).toBe('Park Place');
});
test('accepts multiple compatible scheduled trips only when their destinations agree', () => {
  expect(resolve(update(), [pattern(), pattern('Park Place', ['X', 'B', 'C', 'D'])])).toBe('Park Place');
});
test.each([
  ['conflicting destination', [pattern(), pattern('Other terminal')]],
  ['blank destination variant', [pattern(), pattern('')]],
  ['truncated feed / possible longer trip', [pattern(), pattern('Other terminal', ['A', 'B', 'C', 'D', 'E'])]],
  ['opposite stop order', [pattern('Park Place', ['D', 'C', 'B'])]],
  ['no matching pattern', [pattern('Park Place', ['X', 'Y', 'Z'])]],
])('does not guess: %s', (_name, patterns) => {
  expect(resolve(update(), patterns)).toBe('');
});
test.each([
  ['one stop', update(['D'])], ['two stops', update(['C', 'D'])],
  ['repeated stops only', update(['B', 'B', 'D'])],
  ['unknown route', update(undefined, { routeId: '8B' })],
  ['added service', update(undefined, { scheduleRelationship: 'ADDED' })],
  ['missing stop ID', update(['B', '', 'D'])],
  ['out-of-order sequence', { ...update(), stopTimeUpdates: update().stopTimeUpdates.reverse() }],
  ['missing sequence', { ...update(), stopTimeUpdates: update().stopTimeUpdates.map(s => ({ ...s, stopSequence: null })) }],
])('rejects insufficient evidence: %s', (_name, u) => expect(resolve(u)).toBe(''));
test('older caches without patterns remain safely unresolved', () => {
  expect(resolveArrivalDestination(update(), 0)).toBe('');
});
test('repeated loop occurrence that could continue is ambiguous', () => {
  expect(resolve(update(), [pattern('Park Place', ['B', 'C', 'D', 'B', 'C', 'D'])])).toBe('');
});
test('builder retains minority and blank destinations rather than choosing the majority', () => {
  const trips = ['a', 'b', 'c', 'd'].map((tripId, i) => ({ tripId, routeId: '8A', headsign: ['Park Place', 'Park Place', 'Other', ''][i] }));
  const stops = trips.flatMap(t => ['D', 'C', 'B'].map((stopId, i) => ({ tripId: t.tripId, stopId, stopSequence: 3 - i })));
  const patterns = createArrivalDestinationPatterns(trips, stops);
  expect(patterns['8A']).toHaveLength(3);
  expect(patterns['8A'][0].stopIds).toEqual(['B', 'C', 'D']);
  expect(resolveArrivalDestination(update(), 0, patterns)).toBe('');
  expect(JSON.parse(JSON.stringify(patterns))).toEqual(patterns);
});
test('service changes only destination metadata, not live timing or trip identity', () => {
  const u = update(); const feed = [{ tripUpdate: u }];
  const before = getArrivalsForStop(feed, 'B', [], {});
  const after = getArrivalsForStop(feed, 'B', [], {}, { '8A': [pattern()] });
  expect(after[0]).toEqual({ ...before[0], headsign: 'Park Place', destinationStatus: 'available', destinationSource: 'stop-pattern' });
  expect(before[0].destinationStatus).toBe('trip-unmatched');
});
test('direct trip destination retains priority over fallback', () => {
  const result = getArrivalsForStop([{ tripUpdate: update() }], 'B', [], {
    'unmatched-live-trip': { headsign: 'Direct label', routeId: '8A' },
  }, { '8A': [pattern()] });
  expect(result[0]).toMatchObject({ headsign: 'Direct label', destinationSource: 'trip-id' });
});
test('stale feed and cancelled trips still produce no arrivals', () => {
  expect(getArrivalsForStop({ status: 'stale', updates: [{ tripUpdate: update() }] }, 'B', [], {}, { '8A': [pattern()] })).toEqual([]);
  expect(getArrivalsForStop([{ tripUpdate: update(undefined, { scheduleRelationship: 'CANCELED' }) }], 'B', [], {}, { '8A': [pattern()] })).toEqual([]);
});

test('replays the exact Sentry trip with every published route 8A variant', () => {
  const fixture = require('./fixtures/arrival-destination-8a-20260920.json');
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(fixture.capturedAt));
  try {
    const feed = [{ tripUpdate: fixture.update }];
    const before = getArrivalsForStop(feed, '2', [], {});
    const after = getArrivalsForStop(feed, '2', [], {}, fixture.patterns);
    expect(before[0].destinationStatus).toBe('trip-unmatched');
    expect(after[0]).toEqual({ ...before[0], headsign: 'RVH/YONGE to Georgian College', destinationStatus: 'available', destinationSource: 'stop-pattern' });
  } finally { Date.now.mockRestore(); }
});
test('unknown reserved route keys fail closed', () => {
  expect(resolveArrivalDestination(update(undefined, { routeId: '__proto__' }), 0, {})).toBe('');
});
