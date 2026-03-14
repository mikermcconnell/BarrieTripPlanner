import { deriveAffectedStops } from '../hooks/useAffectedStops';
import { createRouteStopSequencesMapping } from '../utils/gtfsStopSequences';
import {
  barrieBranchStops,
  barrieStopTimes,
  barrieTrips,
  BARRIE_8A_BRANCH_SHAPE_ID,
  BARRIE_8A_BRANCH_STOP_IDS,
} from './fixtures/barrieGtfsFixtures';

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
const routeStopSequencesMapping = {
  'R1': {
    __default__: ['s1', 's2', 's3', 's4', 's5'],
    'shape-1': ['s1', 's2', 's3', 's4', 's5'],
  },
  'R2': {
    __default__: ['a1', 'shared', 'a3'],
    'shape-a': ['a1', 'shared', 'a3'],
    'shape-b': ['b1', 'shared', 'b3'],
  },
};

describe('deriveAffectedStops', () => {
  it('returns stops between entry and exit points', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: { latitude: 44.384, longitude: -79.690 },
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });
    expect(result.routeStops.map(s => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(result.affectedStops.map(s => s.id)).toEqual(['s2', 's3', 's4']);
    expect(result.skippedStops.map(s => s.id)).toEqual(['s3']);
    expect(result.unaffectedStops.map(s => s.id)).toEqual(['s1', 's5']);
    expect(result.entryStop.id).toBe('s2');
    expect(result.exitStop.id).toBe('s4');
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
      routeStopSequencesMapping,
    });
    expect(result.routeStops).toEqual([]);
    expect(result.affectedStops).toEqual([]);
    expect(result.skippedStops).toEqual([]);
    expect(result.unaffectedStops).toEqual([]);
    expect(result.entryStop).toBeNull();
    expect(result.exitStop).toBeNull();
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
      routeStopSequencesMapping,
    });
    expect(result.affectedStops).toEqual([]);
    expect(result.skippedStops).toEqual([]);
    expect(result.unaffectedStops).toEqual([]);
  });

  it('returns empty array for unknown route', () => {
    const result = deriveAffectedStops({
      routeId: 'UNKNOWN',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: { latitude: 44.384, longitude: -79.690 },
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });
    expect(result.affectedStops).toEqual([]);
    expect(result.routeStops).toEqual([]);
    expect(result.unaffectedStops).toEqual([]);
  });

  it('handles entry and exit at same stop', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.390, longitude: -79.690 },
      exitPoint: { latitude: 44.390, longitude: -79.690 },
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s3']);
    expect(result.skippedStops.map(s => s.id)).toEqual([]);
    expect(result.unaffectedStops.map(s => s.id)).toEqual(['s1', 's2', 's4', 's5']);
    expect(result.entryStop.id).toBe('s3');
    expect(result.exitStop.id).toBe('s3');
  });

  it('swaps entry/exit when exit comes before entry in stop order', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.384, longitude: -79.690 },
      exitPoint: { latitude: 44.396, longitude: -79.690 },
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s2', 's3', 's4']);
    expect(result.unaffectedStops.map(s => s.id)).toEqual(['s1', 's5']);
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
      routeStopSequencesMapping,
    });
    expect(result.affectedStops.map(s => s.id)).toEqual(['s2', 's3', 's4']);
  });

  it('uses the shape-specific stop sequence when available', () => {
    const branchStops = [
      makeStop('a1', 'Alpha 1', 44.400, -79.690),
      makeStop('shared', 'Shared', 44.395, -79.690),
      makeStop('a3', 'Alpha 3', 44.390, -79.690),
      makeStop('b1', 'Beta 1', 44.400, -79.700),
      makeStop('b3', 'Beta 3', 44.390, -79.700),
    ];

    const result = deriveAffectedStops({
      routeId: 'R2',
      shapeId: 'shape-b',
      entryPoint: { latitude: 44.401, longitude: -79.700 },
      exitPoint: { latitude: 44.389, longitude: -79.700 },
      stops: branchStops,
      routeStopsMapping: { R2: ['a1', 'shared', 'a3', 'b1', 'b3'] },
      routeStopSequencesMapping,
    });

    expect(result.affectedStops.map((stop) => stop.id)).toEqual(['b1', 'shared', 'b3']);
    expect(result.skippedStops.map((stop) => stop.id)).toEqual(['shared']);
    expect(result.unaffectedStops.map((stop) => stop.id)).toEqual([]);
    expect(result.entryStopName).toBe('Beta 1');
    expect(result.exitStopName).toBe('Beta 3');
  });

  it('uses the Barrie 8A branch sequence instead of a route-level union list', () => {
    const result = deriveAffectedStops({
      routeId: '8A',
      shapeId: BARRIE_8A_BRANCH_SHAPE_ID,
      entryPoint: { latitude: 44.3739, longitude: -79.6898 },
      exitPoint: { latitude: 44.3904, longitude: -79.6833 },
      stops: barrieBranchStops,
      routeStopsMapping: {
        '8A': [
          '9005', '725', '953', '955', '154', '156', '158', '2', '485', '188', '192', '189', '194',
        ],
      },
      routeStopSequencesMapping: createRouteStopSequencesMapping(barrieTrips, barrieStopTimes),
    });

    expect(result.affectedStops.map((stop) => stop.id)).toEqual([
      '9005', '154', '156', '158', '2', '485', '188', '192', '189', '194',
    ]);
    expect(result.skippedStops.map((stop) => stop.id)).toEqual([
      '154', '156', '158', '2', '485', '188', '192', '189',
    ]);
    expect(result.unaffectedStops.map((stop) => stop.id)).toEqual([]);
    expect(result.affectedStops.map((stop) => stop.id)).toEqual(BARRIE_8A_BRANCH_STOP_IDS.slice(0, 10));
    expect(result.entryStopName).toBe('Barrie Allandale Transit Terminal Platform 5');
    expect(result.exitStopName).toBe('Poyntz Street');
  });
});
