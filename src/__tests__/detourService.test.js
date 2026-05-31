jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  onSnapshot: jest.fn(),
}));

jest.mock('../config/firebase', () => ({
  db: {},
}));

const {
  normalizeDetourCoordinate,
  normalizeDetourPolyline,
  normalizeRoadNames,
  normalizeDetourSegment,
  mapActiveDetourDoc,
} = require('../services/firebase/detourService');
const { deriveDetourOverlays } = require('../hooks/useDetourOverlays');

describe('detourService normalization helpers', () => {
  test('normalizes single coordinates from either field shape', () => {
    expect(normalizeDetourCoordinate({ latitude: 44.38, longitude: -79.69 })).toEqual({
      latitude: 44.38,
      longitude: -79.69,
    });

    expect(normalizeDetourCoordinate({ lat: 44.39, lon: -79.68 })).toEqual({
      latitude: 44.39,
      longitude: -79.68,
    });

    expect(normalizeDetourCoordinate({ lat: '44.4', lon: '-79.67' })).toEqual({
      latitude: 44.4,
      longitude: -79.67,
    });
  });

  test('returns null for invalid coordinates', () => {
    expect(normalizeDetourCoordinate(null)).toBeNull();
    expect(normalizeDetourCoordinate({ lat: null, lon: -79.68 })).toBeNull();
    expect(normalizeDetourCoordinate({ latitude: 'bad', longitude: -79.68 })).toBeNull();
  });

  test('normalizes polylines and drops invalid points', () => {
    expect(normalizeDetourPolyline(null)).toBeNull();

    expect(
      normalizeDetourPolyline([
        { lat: 44.38, lon: -79.69 },
        { latitude: 44.39, longitude: -79.68 },
        { lat: null, lon: -79.67 },
      ])
    ).toEqual([
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.39, longitude: -79.68 },
    ]);
  });

  test('normalizes road names', () => {
    expect(normalizeRoadNames(['Yonge Street', '', null, ' Big Bay Point Road '])).toEqual([
      'Yonge Street',
      'Big Bay Point Road',
    ]);
  });

  test('normalizes nested detour segments', () => {
    expect(
      normalizeDetourSegment({
        shapeId: 'shape-8a',
        entryPoint: { lat: 44.38, lon: -79.69 },
        exitPoint: { latitude: 44.39, longitude: -79.68 },
        skippedSegmentPolyline: [
          { lat: 44.38, lon: -79.69 },
          { latitude: 44.39, longitude: -79.68 },
        ],
        inferredDetourPolyline: [
          { latitude: 44.381, longitude: -79.691 },
          { lat: 44.389, lon: -79.681 },
        ],
        likelyDetourPolyline: [
          { latitude: 44.382, longitude: -79.692 },
          { lat: 44.388, lon: -79.682 },
        ],
        likelyDetourRoadNames: ['Yonge Street'],
        roadMatchConfidence: 'high',
        detourEventId: 'detour-event-8-yonge',
      })
    ).toEqual({
      shapeId: 'shape-8a',
      entryPoint: { latitude: 44.38, longitude: -79.69 },
      exitPoint: { latitude: 44.39, longitude: -79.68 },
      skippedSegmentPolyline: [
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.68 },
      ],
      inferredDetourPolyline: [
        { latitude: 44.381, longitude: -79.691 },
        { latitude: 44.389, longitude: -79.681 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.382, longitude: -79.692 },
        { latitude: 44.388, longitude: -79.682 },
      ],
      likelyDetourRoadNames: ['Yonge Street'],
      roadMatchConfidence: 'high',
      roadMatchSource: null,
      detourPathLabel: 'Likely detour path',
      detourEventId: 'detour-event-8-yonge',
    });
  });
});

describe('mapActiveDetourDoc', () => {

  test('maps rider visibility fields', () => {
    const mapped = mapActiveDetourDoc('12A', {
      state: 'active',
      confidence: 'high',
      riderVisible: false,
      riderVisibilityReason: 'insufficient-geometry',
      staleForReview: true,
    });

    expect(mapped.riderVisible).toBe(false);
    expect(mapped.riderVisibilityReason).toBe('insufficient-geometry');
    expect(mapped.staleForReview).toBe(true);
  });
  test('normalizes top-level and segment geometry from mixed field names', () => {
    const mapped = mapActiveDetourDoc('8A', {
      shapeId: 'shape-8a',
      vehicleCount: 2,
      uniqueVehicleCount: 2,
      currentVehicleCount: 0,
      state: 'active',
      clearReason: 'normal-route-observed',
      entryPoint: { lat: 44.38, lon: -79.69 },
      exitPoint: { latitude: 44.39, longitude: -79.68 },
      skippedSegmentPolyline: [
        { lat: 44.38, lon: -79.69 },
        { latitude: 44.39, longitude: -79.68 },
      ],
      inferredDetourPolyline: [
        { latitude: 44.381, longitude: -79.691 },
        { lat: 44.389, lon: -79.681 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.382, longitude: -79.692 },
        { lat: 44.388, lon: -79.682 },
      ],
      likelyDetourRoadNames: ['Yonge Street', 'Big Bay Point Road'],
      roadMatchConfidence: 'high',
      detourEventId: 'detour-event-8-yonge',
      skippedStopIds: ['stop-1'],
      skippedStopCodes: ['101'],
      skippedStops: [{ id: 'stop-1', code: '101', name: 'Yonge at Essa' }],
      affectedStopIds: ['stop-1', 'stop-2'],
      affectedStopCodes: ['101', '102'],
      affectedStops: [
        { id: 'stop-1', code: '101', name: 'Yonge at Essa' },
        { id: 'stop-2', code: '102', name: 'Yonge at Big Bay' },
      ],
      entryStopId: 'stop-1',
      exitStopId: 'stop-2',
      segments: [
        {
          shapeId: 'shape-8a-a',
          detourEventId: 'detour-event-8-yonge',
          entryPoint: { lat: 44.38, lon: -79.69 },
          exitPoint: { lat: 44.39, lon: -79.68 },
          skippedSegmentPolyline: [
            { lat: 44.38, lon: -79.69 },
            { lat: 44.39, lon: -79.68 },
          ],
          inferredDetourPolyline: [
            { latitude: 44.381, longitude: -79.691 },
            { latitude: 44.389, longitude: -79.681 },
          ],
          likelyDetourPolyline: [
            { latitude: 44.382, longitude: -79.692 },
            { latitude: 44.388, longitude: -79.682 },
          ],
          likelyDetourRoadNames: ['Yonge Street'],
        },
      ],
    });

    expect(mapped.entryPoint).toEqual({ latitude: 44.38, longitude: -79.69 });
    expect(mapped.vehicleCount).toBe(2);
    expect(mapped.uniqueVehicleCount).toBe(2);
    expect(mapped.currentVehicleCount).toBe(0);
    expect(mapped.clearReason).toBe('normal-route-observed');
    expect(mapped.exitPoint).toEqual({ latitude: 44.39, longitude: -79.68 });
    expect(mapped.skippedSegmentPolyline).toEqual([
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.39, longitude: -79.68 },
    ]);
    expect(mapped.inferredDetourPolyline).toEqual([
      { latitude: 44.381, longitude: -79.691 },
      { latitude: 44.389, longitude: -79.681 },
    ]);
    expect(mapped.likelyDetourPolyline).toEqual([
      { latitude: 44.382, longitude: -79.692 },
      { latitude: 44.388, longitude: -79.682 },
    ]);
    expect(mapped.likelyDetourRoadNames).toEqual(['Yonge Street', 'Big Bay Point Road']);
    expect(mapped.roadMatchConfidence).toBe('high');
    expect(mapped.detourPathLabel).toBe('Likely detour path');
    expect(mapped.detourEventId).toBe('detour-event-8-yonge');
    expect(mapped.skippedStopCodes).toEqual(['101']);
    expect(mapped.skippedStops).toEqual([{ id: 'stop-1', code: '101', name: 'Yonge at Essa' }]);
    expect(mapped.affectedStopCodes).toEqual(['101', '102']);
    expect(mapped.affectedStops).toHaveLength(2);
    expect(mapped.entryStopId).toBe('stop-1');
    expect(mapped.exitStopId).toBe('stop-2');
    expect(mapped.segments).toHaveLength(1);
    expect(mapped.segments[0].detourEventId).toBe('detour-event-8-yonge');
    expect(mapped.segments[0].entryPoint).toEqual({ latitude: 44.38, longitude: -79.69 });
    expect(mapped.segments[0].exitPoint).toEqual({ latitude: 44.39, longitude: -79.68 });
    expect(mapped.segments[0].likelyDetourPolyline).toEqual([
      { latitude: 44.382, longitude: -79.692 },
      { latitude: 44.388, longitude: -79.682 },
    ]);
    expect(mapped.segments[0].likelyDetourRoadNames).toEqual(['Yonge Street']);
  });

  test('normalized mixed-format detours still produce overlays', () => {
    const activeDetours = {
      '8A': mapActiveDetourDoc('8A', {
        state: 'active',
        confidence: 'high',
        vehicleCount: 2,
        skippedSegmentPolyline: [
          { lat: 44.38, lon: -79.69 },
          { latitude: 44.39, longitude: -79.68 },
        ],
        inferredDetourPolyline: [
          { lat: 44.381, lon: -79.691 },
          { latitude: 44.389, longitude: -79.681 },
        ],
        likelyDetourPolyline: [
          { lat: 44.381, lon: -79.691 },
          { latitude: 44.389, longitude: -79.681 },
        ],
        entryPoint: { lat: 44.38, lon: -79.69 },
        exitPoint: { lat: 44.39, lon: -79.68 },
      }),
    };

    const overlays = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['8A']),
      activeDetours,
    });

    expect(overlays).toHaveLength(1);
    expect(overlays[0].entryPoint).toEqual({ latitude: 44.38, longitude: -79.69 });
    expect(overlays[0].exitPoint).toEqual({ latitude: 44.39, longitude: -79.68 });
    expect(overlays[0].skippedSegmentPolyline).toEqual([
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.39, longitude: -79.68 },
    ]);
    expect(overlays[0].likelyDetourPolyline).toEqual([
      { latitude: 44.381, longitude: -79.691 },
      { latitude: 44.389, longitude: -79.681 },
    ]);
  });
});

test('reads detour updates from configured active detours collection', () => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION = 'activeDetoursV2';
  const firestore = require('firebase/firestore');
  firestore.onSnapshot.mockImplementation(() => () => {});

  const { subscribeToActiveDetours } = require('../services/firebase/detourService');
  subscribeToActiveDetours(() => {});

  expect(firestore.collection).toHaveBeenCalledWith({}, 'activeDetoursV2');
});
