import { deriveAffectedStops } from '../hooks/useAffectedStops';

const makeStop = (id, name, lat, lon) => ({
  id, name, code: id, latitude: lat, longitude: lon,
});

// Simulated stops along a north-south route
const stops = [
  makeStop('s1', 'First St', 44.400, -79.690),
  makeStop('s2', 'Second St', 44.395, -79.690),
  makeStop('s3', 'Third St', 44.390, -79.690),
  makeStop('s4', 'Fourth St', 44.385, -79.690),
  makeStop('s5', 'Fifth St', 44.380, -79.690),
];

const routeStopsMapping = { 'R1': ['s1', 's2', 's3', 's4', 's5'] };

describe('deriveAffectedStops', () => {
  it('returns stops between entry and exit points', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: { latitude: 44.384, longitude: -79.690 },
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s2', 's3', 's4']);
    expect(result.entryStopName).toBe('Second St');
    expect(result.exitStopName).toBe('Fourth St');
  });

  it('returns empty array when entryPoint is null', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: null,
      exitPoint: { latitude: 44.384, longitude: -79.690 },
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops).toEqual([]);
    expect(result.entryStopName).toBeNull();
    expect(result.exitStopName).toBeNull();
  });

  it('returns empty array when exitPoint is null', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: null,
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops).toEqual([]);
  });

  it('returns empty array for unknown route', () => {
    const result = deriveAffectedStops({
      routeId: 'UNKNOWN',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: { latitude: 44.384, longitude: -79.690 },
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops).toEqual([]);
  });

  it('handles entry and exit at same stop', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.390, longitude: -79.690 },
      exitPoint: { latitude: 44.390, longitude: -79.690 },
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s3']);
  });

  it('swaps entry/exit when exit comes before entry in stop order', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.384, longitude: -79.690 },
      exitPoint: { latitude: 44.396, longitude: -79.690 },
      stops,
      routeStopsMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s2', 's3', 's4']);
  });

  it('resolves stop objects even when stops array has extra stops', () => {
    const allStops = [
      ...stops,
      makeStop('s99', 'Other Route Stop', 44.500, -79.700),
    ];
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: { latitude: 44.384, longitude: -79.690 },
      stops: allStops,
      routeStopsMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s2', 's3', 's4']);
  });
});
