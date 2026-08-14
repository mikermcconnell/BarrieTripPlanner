const { deriveSegmentStopImpacts } = require('../detour/stopImpacts');

const TERMINAL_STOP = {
  id: 'allandale-platform-5',
  code: '9005',
  name: 'Barrie Allandale Transit Terminal Platform 5',
  latitude: 44.3747,
  longitude: -79.690,
  parentStation: 'allandale-terminal',
};

function deriveAllandaleTerminalImpact(serviceEvidencePoints) {
  return deriveSegmentStopImpacts({
    routeId: '8A',
    shapeId: 'route-8-lakeshore',
    polyline: [
      { latitude: 44.374, longitude: -79.705 },
      { latitude: 44.374, longitude: -79.675 },
    ],
    segment: {
      entryPoint: { latitude: 44.374, longitude: -79.703 },
      exitPoint: { latitude: 44.374, longitude: -79.677 },
      skippedSegmentPolyline: [
        { latitude: 44.374, longitude: -79.703 },
        { latitude: 44.374, longitude: -79.677 },
      ],
    },
    serviceEvidencePoints,
    stopImpactData: {
      routeStopSequencesMapping: {
        '8A': { 'route-8-lakeshore': [TERMINAL_STOP.id] },
      },
      stopsById: new Map([[TERMINAL_STOP.id, TERMINAL_STOP]]),
    },
  });
}

describe('deriveSegmentStopImpacts', () => {
  test('does not mark a stop before the detour entry as skipped', () => {
    const result = deriveSegmentStopImpacts({
      routeId: '11',
      shapeId: 'shape-11',
      polyline: [
        { latitude: 44.39, longitude: -79.700 },
        { latitude: 44.39, longitude: -79.670 },
      ],
      segment: {
        entryPoint: { latitude: 44.39, longitude: -79.695 },
        exitPoint: { latitude: 44.39, longitude: -79.685 },
        skippedSegmentPolyline: [
          { latitude: 44.39, longitude: -79.695 },
          { latitude: 44.39, longitude: -79.685 },
        ],
      },
      stopImpactData: {
        routeStopSequencesMapping: {
          '11': {
            'shape-11': ['stop-557', 'stop-191', 'stop-after'],
          },
        },
        stopsById: new Map([
          ['stop-557', {
            id: 'stop-557',
            code: '557',
            name: 'Mulcaster at Collier',
            latitude: 44.39,
            longitude: -79.69518,
          }],
          ['stop-191', {
            id: 'stop-191',
            code: '191',
            name: 'Owen Street',
            latitude: 44.39,
            longitude: -79.690,
          }],
          ['stop-after', {
            id: 'stop-after',
            code: '999',
            name: 'After detour',
            latitude: 44.39,
            longitude: -79.685,
          }],
        ]),
      },
    });

    expect(result.affectedStopCodes).toEqual(['557', '191', '999']);
    expect(result.skippedStopCodes).toEqual(['191']);
    expect(result.lastServedBeforeDetourStopCode).toBe('557');
    expect(result.firstSkippedStopCode).toBe('191');
    expect(result.firstServedAfterDetourStopCode).toBe('999');
  });

  test('uses GPS service evidence to keep a served stop out of skipped stops', () => {
    const result = deriveSegmentStopImpacts({
      routeId: '11',
      shapeId: 'shape-11',
      polyline: [
        { latitude: 44.39, longitude: -79.700 },
        { latitude: 44.39, longitude: -79.670 },
      ],
      segment: {
        entryPoint: { latitude: 44.39, longitude: -79.696 },
        exitPoint: { latitude: 44.39, longitude: -79.685 },
        skippedSegmentPolyline: [
          { latitude: 44.39, longitude: -79.696 },
          { latitude: 44.39, longitude: -79.685 },
        ],
      },
      serviceEvidencePoints: [{
        latitude: 44.39,
        longitude: -79.6952,
        timestampMs: 1000,
        vehicleId: 'bus-1',
      }],
      stopImpactData: {
        routeStopSequencesMapping: {
          '11': {
            'shape-11': ['stop-557', 'stop-191', 'stop-after'],
          },
        },
        stopsById: new Map([
          ['stop-557', {
            id: 'stop-557',
            code: '557',
            name: 'Mulcaster at Collier',
            latitude: 44.39,
            longitude: -79.6952,
          }],
          ['stop-191', {
            id: 'stop-191',
            code: '191',
            name: 'Owen Street',
            latitude: 44.39,
            longitude: -79.690,
          }],
          ['stop-after', {
            id: 'stop-after',
            code: '999',
            name: 'After detour',
            latitude: 44.39,
            longitude: -79.685,
          }],
        ]),
      },
    });

    expect(result.affectedStopCodes).toEqual(['557', '191', '999']);
    expect(result.gpsServedStopCodes).toEqual(['557']);
    expect(result.skippedStopCodes).toEqual(['191']);
    expect(result.skippedStopCodes).not.toContain('557');
    expect(result.firstSkippedStopCode).toBe('191');
  });

  test('uses final detour path service evidence to keep passed stops out of skipped stops', () => {
    const result = deriveSegmentStopImpacts({
      routeId: '11',
      shapeId: 'shape-11',
      polyline: [
        { latitude: 44.390, longitude: -79.700 },
        { latitude: 44.392, longitude: -79.700 },
        { latitude: 44.394, longitude: -79.700 },
      ],
      segment: {
        entryPoint: { latitude: 44.390, longitude: -79.700 },
        exitPoint: { latitude: 44.394, longitude: -79.700 },
        skippedSegmentPolyline: [
          { latitude: 44.390, longitude: -79.700 },
          { latitude: 44.392, longitude: -79.700 },
          { latitude: 44.394, longitude: -79.700 },
        ],
        likelyDetourPolyline: [
          { latitude: 44.390, longitude: -79.698 },
          { latitude: 44.392, longitude: -79.698 },
          { latitude: 44.394, longitude: -79.698 },
        ],
      },
      stopImpactData: {
        routeStopSequencesMapping: {
          '11': {
            'shape-11': ['stop-696', 'stop-700'],
          },
        },
        stopsById: new Map([
          ['stop-696', {
            id: 'stop-696',
            code: '696',
            name: 'Served on detour',
            latitude: 44.392,
            longitude: -79.698,
          }],
          ['stop-700', {
            id: 'stop-700',
            code: '700',
            name: 'Still bypassed',
            latitude: 44.393,
            longitude: -79.700,
          }],
        ]),
      },
    });

    expect(result.skippedStopCodes).toEqual(['700']);
    expect(result.skippedStopCodes).not.toContain('696');
    expect(result.firstSkippedStopCode).toBe('700');
  });

  test('marks in-service boundary and detour-served stops as non-notifying roles', () => {
    const result = deriveSegmentStopImpacts({
      routeId: '12B',
      shapeId: 'shape-12b',
      polyline: [
        { latitude: 44.392146, longitude: -79.692739 },
        { latitude: 44.390741, longitude: -79.692893 },
        { latitude: 44.39018841, longitude: -79.69253335 },
      ],
      segment: {
        entryPoint: { latitude: 44.391986, longitude: -79.692597 },
        exitPoint: { latitude: 44.39018841, longitude: -79.69253335 },
        skippedSegmentPolyline: [
          { latitude: 44.391986, longitude: -79.692597 },
          { latitude: 44.390741, longitude: -79.692893 },
          { latitude: 44.39018841, longitude: -79.69253335 },
        ],
        inferredDetourPolyline: [
          { latitude: 44.391917, longitude: -79.69275 },
          { latitude: 44.390833, longitude: -79.693028 },
          { latitude: 44.39018841, longitude: -79.69253335 },
        ],
        canShowDetourPath: true,
      },
      stopImpactData: {
        routeStopSequencesMapping: {
          '12B': {
            'shape-12b': ['75', '486'],
          },
        },
        stopsById: new Map([
          ['75', {
            id: '75',
            code: '75',
            name: 'Bayfield at Sophia',
            latitude: 44.392146,
            longitude: -79.692739,
          }],
          ['486', {
            id: '486',
            code: '486',
            name: 'Maple at Ross',
            latitude: 44.39018841,
            longitude: -79.69253335,
          }],
        ]),
      },
    });

    expect(result.skippedStopCodes).toEqual([]);
    expect(result.boundaryStopCodes).toContain('75');
    expect(result.boundaryStopCodes).toContain('486');
    expect(result.affectedStops.find((stop) => stop.code === '75')).toEqual(
      expect.objectContaining({ detourStopRole: 'boundary' })
    );
    expect(result.affectedStops.find((stop) => stop.code === '486')).toEqual(
      expect.objectContaining({ detourStopRole: 'boundary' })
    );
  });

  test('keeps an Allandale terminal platform uncertain while confirmed interior stops remain skipped', () => {
    const result = deriveSegmentStopImpacts({
      routeId: '8A',
      shapeId: 'route-8-lakeshore',
      polyline: [
        { latitude: 44.374, longitude: -79.705 },
        { latitude: 44.374, longitude: -79.675 },
      ],
      segment: {
        entryPoint: { latitude: 44.374, longitude: -79.703 },
        exitPoint: { latitude: 44.374, longitude: -79.677 },
        skippedSegmentPolyline: [
          { latitude: 44.374, longitude: -79.703 },
          { latitude: 44.374, longitude: -79.677 },
        ],
      },
      stopImpactData: {
        routeStopSequencesMapping: {
          '8A': {
            'route-8-lakeshore': ['9005', '154', '156', '158'],
          },
        },
        stopsById: new Map([
          ['9005', {
            id: '9005',
            code: '9005',
            name: 'Barrie Allandale Transit Terminal Platform 5',
            latitude: 44.374,
            longitude: -79.697,
            parentStation: 'allandale-terminal',
          }],
          ['154', { id: '154', code: '154', name: 'Lakeshore stop 154', latitude: 44.374, longitude: -79.692 }],
          ['156', { id: '156', code: '156', name: 'Lakeshore stop 156', latitude: 44.374, longitude: -79.688 }],
          ['158', { id: '158', code: '158', name: 'Lakeshore stop 158', latitude: 44.374, longitude: -79.683 }],
        ]),
      },
    });

    expect(result.skippedStopCodes).toEqual(['154', '156', '158']);
    expect(result.skippedStopCodes).not.toContain('9005');
    expect(result.uncertainStopCodes).toEqual(['9005']);
    expect(result.affectedStops.find((stop) => stop.code === '9005')).toEqual(
      expect.objectContaining({ detourStopRole: 'uncertain' })
    );
  });

  test('does not call a terminal skipped when buses physically serve its off-shape platform', () => {
    const serviceEvidencePoints = [];
    for (const [signature, startTime] of [['trip-a', 1_000], ['trip-b', 10_000]]) {
      serviceEvidencePoints.push(
        { latitude: 44.374, longitude: -79.699, signature, onRoute: true, timestampMs: startTime },
        {
          latitude: TERMINAL_STOP.latitude,
          longitude: TERMINAL_STOP.longitude,
          signature,
          onRoute: false,
          kind: 'off-route',
          timestampMs: startTime + 1_000,
        },
        { latitude: 44.374, longitude: -79.681, signature, onRoute: true, timestampMs: startTime + 2_000 }
      );
    }

    const result = deriveAllandaleTerminalImpact(serviceEvidencePoints);
    expect(result.skippedStopCodes).toEqual([]);
    expect(result.uncertainStopCodes).toEqual(['9005']);
  });

  test('accepts two ordered terminal bypass traces that stay physically away from the platform', () => {
    const serviceEvidencePoints = [];
    for (const [signature, startTime] of [['trip-a', 1_000], ['trip-b', 10_000]]) {
      serviceEvidencePoints.push(
        { latitude: 44.374, longitude: -79.699, signature, onRoute: true, timestampMs: startTime },
        {
          latitude: 44.3757,
          longitude: TERMINAL_STOP.longitude,
          signature,
          onRoute: false,
          kind: 'off-route',
          timestampMs: startTime + 1_000,
        },
        { latitude: 44.374, longitude: -79.681, signature, onRoute: true, timestampMs: startTime + 2_000 }
      );
    }

    const result = deriveAllandaleTerminalImpact(serviceEvidencePoints);
    expect(result.skippedStopCodes).toEqual(['9005']);
    expect(result.uncertainStopCodes).toEqual([]);
  });

  test('accepts two ordered terminal bypass traces in the reverse travel direction', () => {
    const serviceEvidencePoints = [];
    for (const [signature, startTime] of [['trip-a', 1_000], ['trip-b', 10_000]]) {
      serviceEvidencePoints.push(
        { latitude: 44.374, longitude: -79.681, signature, onRoute: true, timestampMs: startTime },
        {
          latitude: 44.3757,
          longitude: TERMINAL_STOP.longitude,
          signature,
          onRoute: false,
          kind: 'off-route',
          timestampMs: startTime + 1_000,
        },
        { latitude: 44.374, longitude: -79.699, signature, onRoute: true, timestampMs: startTime + 2_000 }
      );
    }

    const result = deriveAllandaleTerminalImpact(serviceEvidencePoints);
    expect(result.skippedStopCodes).toEqual(['9005']);
    expect(result.uncertainStopCodes).toEqual([]);
  });

  test('rejects terminal bypass samples that are not bracketed in time by approach and rejoin', () => {
    const serviceEvidencePoints = [];
    for (const [signature, startTime] of [['trip-a', 1_000], ['trip-b', 10_000]]) {
      serviceEvidencePoints.push(
        { latitude: 44.374, longitude: -79.699, signature, onRoute: true, timestampMs: startTime },
        {
          latitude: 44.3757,
          longitude: TERMINAL_STOP.longitude,
          signature,
          onRoute: false,
          kind: 'off-route',
          timestampMs: startTime + 2_000,
        },
        { latitude: 44.374, longitude: -79.681, signature, onRoute: true, timestampMs: startTime + 1_000 }
      );
    }

    const result = deriveAllandaleTerminalImpact(serviceEvidencePoints);
    expect(result.skippedStopCodes).toEqual([]);
    expect(result.uncertainStopCodes).toEqual(['9005']);
  });
});
