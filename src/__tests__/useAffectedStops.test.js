import { deriveAffectedStopDetailsForDetour, deriveAffectedStops } from '../hooks/useAffectedStops';
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

  it('uses the opposite-direction shape sequence instead of the default stop order', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      shapeId: 'shape-1-reverse',
      entryPoint: { latitude: 44.384, longitude: -79.690 },
      exitPoint: { latitude: 44.396, longitude: -79.690 },
      stops,
      routeStopsMapping,
      routeStopSequencesMapping: {
        R1: {
          __default__: ['s1', 's2', 's3', 's4', 's5'],
          'shape-1-reverse': ['s5', 's4', 's3', 's2', 's1'],
        },
      },
    });

    expect(result.routeStops.map(s => s.id)).toEqual(['s5', 's4', 's3', 's2', 's1']);
    expect(result.affectedStops.map(s => s.id)).toEqual(['s4', 's3', 's2']);
    expect(result.skippedStops.map(s => s.id)).toEqual(['s3']);
    expect(result.entryStop.id).toBe('s4');
    expect(result.exitStop.id).toBe('s2');
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

  it('keeps entry and exit boundary stops open when they sit on the closed route section', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.395, longitude: -79.690 },
      exitPoint: { latitude: 44.385, longitude: -79.690 },
      skippedSegmentPolyline: [
        { latitude: 44.395, longitude: -79.690 },
        { latitude: 44.390, longitude: -79.690 },
        { latitude: 44.385, longitude: -79.690 },
      ],
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });

    expect(result.affectedStops.map((stop) => stop.id)).toEqual(['s2', 's3', 's4']);
    expect(result.skippedStops.map((stop) => stop.id)).toEqual(['s3']);
    expect(result.entryStop.id).toBe('s2');
    expect(result.exitStop.id).toBe('s4');
  });

  it('prefers explicit skipped stop ids from backend geometry over boundary heuristics', () => {
    const result = deriveAffectedStopDetailsForDetour({
      routeId: 'R1',
      segments: [
        {
          shapeId: 'shape-1',
          entryPoint: { latitude: 44.395, longitude: -79.690 },
          exitPoint: { latitude: 44.385, longitude: -79.690 },
          skippedSegmentPolyline: [
            { latitude: 44.395, longitude: -79.690 },
            { latitude: 44.390, longitude: -79.690 },
            { latitude: 44.385, longitude: -79.690 },
          ],
          skippedStopIds: ['s2', 's3', 's4'],
          entryStopId: 's2',
          exitStopId: 's4',
        },
      ],
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });

    expect(result.segmentStopDetails[0].skippedStops.map((stop) => stop.id)).toEqual(['s2', 's3', 's4']);
    expect(result.segmentStopDetails[0].affectedStops.map((stop) => stop.id)).toEqual(['s2', 's3', 's4']);
    expect(result.segmentStopDetails[0].entryStop.id).toBe('s2');
    expect(result.segmentStopDetails[0].exitStop.id).toBe('s4');
  });

  it('falls back to deriving stop impacts when backend publishes empty explicit arrays', () => {
    const result = deriveAffectedStopDetailsForDetour({
      routeId: 'R1',
      segments: [
        {
          shapeId: 'shape-1',
          entryPoint: { latitude: 44.396, longitude: -79.690 },
          exitPoint: { latitude: 44.384, longitude: -79.690 },
          skippedSegmentPolyline: [
            { latitude: 44.395, longitude: -79.690 },
            { latitude: 44.390, longitude: -79.690 },
            { latitude: 44.385, longitude: -79.690 },
          ],
          skippedStopIds: [],
          affectedStopIds: [],
          skippedStops: [],
          affectedStops: [],
          entryStopId: 's2',
          exitStopId: 's4',
        },
      ],
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });

    expect(result.segmentStopDetails[0].affectedStops.map((stop) => stop.id)).toEqual(['s2', 's3', 's4']);
    expect(result.segmentStopDetails[0].skippedStops.map((stop) => stop.id)).toEqual(['s3']);
    expect(result.segmentStopDetails[0].entryStop.id).toBe('s2');
    expect(result.segmentStopDetails[0].exitStop.id).toBe('s4');
  });

  it('keeps very short boundary-only sections open unless official data marks the stop closed', () => {
    const result = deriveAffectedStops({
      routeId: 'R1',
      entryPoint: { latitude: 44.3901, longitude: -79.690 },
      exitPoint: { latitude: 44.3899, longitude: -79.690 },
      skippedSegmentPolyline: [
        { latitude: 44.3901, longitude: -79.690 },
        { latitude: 44.3899, longitude: -79.690 },
      ],
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });

    expect(result.affectedStops.map((stop) => stop.id)).toEqual(['s3']);
    expect(result.skippedStops.map((stop) => stop.id)).toEqual([]);
  });

  it('does not mark the stop immediately before the detour entry as skipped', () => {
    const localStops = [
      makeStop('before', 'Before Detour', 44.4000, -79.690),
      makeStop('inside', 'Inside Detour', 44.3980, -79.690),
      makeStop('after', 'After Detour', 44.3960, -79.690),
    ];

    const result = deriveAffectedStops({
      routeId: 'R3',
      entryPoint: { latitude: 44.3999, longitude: -79.690 },
      exitPoint: { latitude: 44.3961, longitude: -79.690 },
      skippedSegmentPolyline: [
        { latitude: 44.3999, longitude: -79.690 },
        { latitude: 44.3980, longitude: -79.690 },
        { latitude: 44.3961, longitude: -79.690 },
      ],
      stops: localStops,
      routeStopsMapping: { R3: ['before', 'inside', 'after'] },
      routeStopSequencesMapping: {
        R3: {
          __default__: ['before', 'inside', 'after'],
          'shape-3': ['before', 'inside', 'after'],
        },
      },
    });

    expect(result.affectedStops.map((stop) => stop.id)).toEqual(['before', 'inside', 'after']);
    expect(result.skippedStops.map((stop) => stop.id)).toEqual(['inside']);
    expect(result.entryStop.id).toBe('before');
  });
});

describe('deriveAffectedStopDetailsForDetour', () => {
  it('deduplicates repeated detour sections with the same affected stops', () => {
    const repeatedSegment = {
      shapeId: 'shape-1',
      entryPoint: { latitude: 44.396, longitude: -79.690 },
      exitPoint: { latitude: 44.384, longitude: -79.690 },
    };

    const result = deriveAffectedStopDetailsForDetour({
      routeId: 'R1',
      segments: [
        repeatedSegment,
        { ...repeatedSegment, evidencePointCount: 8 },
        { ...repeatedSegment, likelyDetourPolyline: [[44.396, -79.690], [44.384, -79.690]] },
      ],
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });

    expect(result.segmentStopDetails).toHaveLength(1);
    expect(result.segmentStopDetails[0].affectedStops.map((stop) => stop.id)).toEqual(['s2', 's3', 's4']);
    expect(result.segmentStopDetails[0].skippedStops.map((stop) => stop.id)).toEqual(['s3']);
  });

  it('keeps genuinely different detour sections', () => {
    const result = deriveAffectedStopDetailsForDetour({
      routeId: 'R1',
      segments: [
        {
          shapeId: 'shape-1',
          entryPoint: { latitude: 44.396, longitude: -79.690 },
          exitPoint: { latitude: 44.384, longitude: -79.690 },
        },
        {
          shapeId: 'shape-1',
          entryPoint: { latitude: 44.390, longitude: -79.690 },
          exitPoint: { latitude: 44.379, longitude: -79.690 },
        },
      ],
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });

    expect(result.segmentStopDetails).toHaveLength(2);
    expect(result.segmentStopDetails[0].affectedStops.map((stop) => stop.id)).toEqual(['s2', 's3', 's4']);
    expect(result.segmentStopDetails[1].affectedStops.map((stop) => stop.id)).toEqual(['s3', 's4', 's5']);
  });

  it('can suppress stop derivation for manually drawn short test closures', () => {
    const result = deriveAffectedStopDetailsForDetour({
      routeId: 'R1',
      segments: [
        {
          shapeId: 'shape-1',
          entryPoint: { latitude: 44.396, longitude: -79.690 },
          exitPoint: { latitude: 44.379, longitude: -79.690 },
          skippedSegmentPolyline: [
            { latitude: 44.390, longitude: -79.690 },
            { latitude: 44.391, longitude: -79.690 },
          ],
          suppressStopDerivation: true,
        },
      ],
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    });

    expect(result.routeStops).toEqual([]);
    expect(result.segmentStopDetails).toHaveLength(1);
    expect(result.segmentStopDetails[0].skippedStops).toEqual([]);
    expect(result.segmentStopDetails[0].skippedSegmentPolyline).toEqual([
      { latitude: 44.390, longitude: -79.690 },
      { latitude: 44.391, longitude: -79.690 },
    ]);
  });
});
