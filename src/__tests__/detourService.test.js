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
    });
  });
});

describe('mapActiveDetourDoc', () => {
  test('normalizes top-level and segment geometry from mixed field names', () => {
    const mapped = mapActiveDetourDoc('8A', {
      shapeId: 'shape-8a',
      vehicleCount: 2,
      state: 'active',
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
      segments: [
        {
          shapeId: 'shape-8a-a',
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
        },
      ],
    });

    expect(mapped.entryPoint).toEqual({ latitude: 44.38, longitude: -79.69 });
    expect(mapped.exitPoint).toEqual({ latitude: 44.39, longitude: -79.68 });
    expect(mapped.skippedSegmentPolyline).toEqual([
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.39, longitude: -79.68 },
    ]);
    expect(mapped.inferredDetourPolyline).toEqual([
      { latitude: 44.381, longitude: -79.691 },
      { latitude: 44.389, longitude: -79.681 },
    ]);
    expect(mapped.segments).toHaveLength(1);
    expect(mapped.segments[0].entryPoint).toEqual({ latitude: 44.38, longitude: -79.69 });
    expect(mapped.segments[0].exitPoint).toEqual({ latitude: 44.39, longitude: -79.68 });
  });

  test('normalized mixed-format detours still produce overlays', () => {
    const activeDetours = {
      '8A': mapActiveDetourDoc('8A', {
        state: 'active',
        skippedSegmentPolyline: [
          { lat: 44.38, lon: -79.69 },
          { latitude: 44.39, longitude: -79.68 },
        ],
        inferredDetourPolyline: [
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
    expect(overlays[0].inferredDetourPolyline).toEqual([
      { latitude: 44.381, longitude: -79.691 },
      { latitude: 44.389, longitude: -79.681 },
    ]);
  });
});
