const {
  buildBusApproachLine,
  buildCurrentStepBusPreviewLine,
} = require('../utils/navigationBusPreview');

describe('navigationBusPreview', () => {
  test('builds a shape-following segment even when the shape order is reversed', () => {
    const line = buildBusApproachLine({
      transitLeg: {
        tripId: 'trip-1',
        from: { lat: 44.3, lon: -79.7 },
        route: { color: '#123456' },
      },
      vehicle: {
        coordinate: { latitude: 44.1, longitude: -79.9 },
      },
      shapes: {
        shapeA: [
          { latitude: 44.3, longitude: -79.7 },
          { latitude: 44.2, longitude: -79.8 },
          { latitude: 44.1, longitude: -79.9 },
        ],
      },
      tripMapping: {
        'trip-1': { shapeId: 'shapeA' },
      },
      routePathsByRouteId: new Map(),
    });

    expect(line).toEqual({
      id: 'nav-bus-approach-trip-1',
      coordinates: [
        { latitude: 44.1, longitude: -79.9 },
        { latitude: 44.2, longitude: -79.8 },
        { latitude: 44.3, longitude: -79.7 },
      ],
      color: '#123456',
    });
  });

  test('falls back to a direct dashed line when no shape can be resolved', () => {
    const line = buildBusApproachLine({
      transitLeg: {
        tripId: 'trip-2',
        from: { lat: 44.3, lon: -79.7 },
        route: { color: '#654321' },
      },
      vehicle: {
        coordinate: { latitude: 44.1, longitude: -79.9 },
      },
      shapes: {},
      tripMapping: {},
      routePathsByRouteId: new Map(),
    });

    expect(line).toEqual({
      id: 'nav-bus-approach-trip-2-fallback',
      coordinates: [
        { latitude: 44.1, longitude: -79.9 },
        { latitude: 44.3, longitude: -79.7 },
      ],
      color: '#654321',
    });
  });

  test('supports previewing the ride to the alighting stop', () => {
    const line = buildBusApproachLine({
      transitLeg: {
        tripId: 'trip-3',
        from: { lat: 44.1, lon: -79.9 },
        to: { lat: 44.4, lon: -79.6 },
        route: { color: '#008844' },
      },
      targetStop: { lat: 44.4, lon: -79.6 },
      previewKind: 'alight',
      vehicle: {
        coordinate: { latitude: 44.2, longitude: -79.8 },
      },
      shapes: {
        shapeB: [
          { latitude: 44.1, longitude: -79.9 },
          { latitude: 44.2, longitude: -79.8 },
          { latitude: 44.3, longitude: -79.7 },
          { latitude: 44.4, longitude: -79.6 },
        ],
      },
      tripMapping: {
        'trip-3': { shapeId: 'shapeB' },
      },
      routePathsByRouteId: new Map(),
    });

    expect(line).toEqual({
      id: 'nav-bus-approach-trip-3-alight',
      coordinates: [
        { latitude: 44.2, longitude: -79.8 },
        { latitude: 44.3, longitude: -79.7 },
        { latitude: 44.4, longitude: -79.6 },
      ],
      color: '#008844',
    });
  });

  test('selects the next boarding preview while walking', () => {
    const line = buildCurrentStepBusPreviewLine({
      isWalkingLeg: true,
      nextTransitLeg: {
        tripId: 'trip-4',
        from: { lat: 44.3, lon: -79.7 },
        to: { lat: 44.5, lon: -79.5 },
        route: { color: '#3366FF' },
      },
      walkingVehicle: {
        coordinate: { latitude: 44.1, longitude: -79.9 },
      },
      shapes: {
        shapeC: [
          { latitude: 44.1, longitude: -79.9 },
          { latitude: 44.2, longitude: -79.8 },
          { latitude: 44.3, longitude: -79.7 },
          { latitude: 44.4, longitude: -79.6 },
          { latitude: 44.5, longitude: -79.5 },
        ],
      },
      tripMapping: {
        'trip-4': { shapeId: 'shapeC' },
      },
      routePathsByRouteId: new Map(),
    });

    expect(line).toEqual({
      id: 'nav-bus-approach-trip-4-board',
      coordinates: [
        { latitude: 44.1, longitude: -79.9 },
        { latitude: 44.2, longitude: -79.8 },
        { latitude: 44.3, longitude: -79.7 },
      ],
      color: '#3366FF',
    });
  });

  test('falls back to a shape preview while walking when no live vehicle is matched', () => {
    const line = buildCurrentStepBusPreviewLine({
      isWalkingLeg: true,
      nextTransitLeg: {
        tripId: 'trip-4b',
        from: { lat: 44.302, lon: -79.698 },
        to: { lat: 44.304, lon: -79.696 },
        route: { id: '2B', color: '#3366FF' },
      },
      walkingVehicle: null,
      shapes: {
        shapeC: [
          { latitude: 44.3, longitude: -79.7 },
          { latitude: 44.301, longitude: -79.699 },
          { latitude: 44.302, longitude: -79.698 },
          { latitude: 44.303, longitude: -79.697 },
          { latitude: 44.304, longitude: -79.696 },
        ],
      },
      tripMapping: {
        'trip-4b': { shapeId: 'shapeC' },
      },
      routePathsByRouteId: new Map([
        ['2B', [
          [
            { latitude: 44.3, longitude: -79.7 },
            { latitude: 44.301, longitude: -79.699 },
            { latitude: 44.302, longitude: -79.698 },
            { latitude: 44.303, longitude: -79.697 },
            { latitude: 44.304, longitude: -79.696 },
          ],
        ]],
      ]),
    });

    expect(line).toEqual({
      id: 'nav-bus-approach-trip-4b-board-shape',
      coordinates: [
        { latitude: 44.3, longitude: -79.7 },
        { latitude: 44.301, longitude: -79.699 },
        { latitude: 44.302, longitude: -79.698 },
      ],
      color: '#3366FF',
    });
  });

  test('selects the alighting preview while on board', () => {
    const line = buildCurrentStepBusPreviewLine({
      currentTransitLeg: {
        tripId: 'trip-5',
        from: { lat: 44.1, lon: -79.9 },
        to: { lat: 44.4, lon: -79.6 },
        route: { color: '#AA3300' },
      },
      transitVehicle: {
        coordinate: { latitude: 44.2, longitude: -79.8 },
      },
      transitStatus: 'on_board',
      shapes: {
        shapeD: [
          { latitude: 44.1, longitude: -79.9 },
          { latitude: 44.2, longitude: -79.8 },
          { latitude: 44.3, longitude: -79.7 },
          { latitude: 44.4, longitude: -79.6 },
        ],
      },
      tripMapping: {
        'trip-5': { shapeId: 'shapeD' },
      },
      routePathsByRouteId: new Map(),
    });

    expect(line).toEqual({
      id: 'nav-bus-approach-trip-5-alight',
      coordinates: [
        { latitude: 44.2, longitude: -79.8 },
        { latitude: 44.3, longitude: -79.7 },
        { latitude: 44.4, longitude: -79.6 },
      ],
      color: '#AA3300',
    });
  });
});
