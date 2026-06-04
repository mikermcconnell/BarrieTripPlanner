const {
  makeEventId,
  buildInitialEventWindow,
  pointMatchesEventWindow,
  expandProvisionalEventWindow,
  freezeEventWindow,
  windowsOverlapOrNear,
  buildClearWindowForEvent,
} = require('../detourV2/eventWindows');

describe('detour V2 event windows', () => {
  test('creates stable bucketed ids', () => {
    expect(makeEventId({
      routeId: '8A',
      shapeId: 'shape-1',
      startProgressMeters: 123,
      endProgressMeters: 177,
    })).toBe('8A:shape-1:100-200');
  });

  test('builds provisional core confirm and clear windows', () => {
    const window = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 1500,
      coordinate: { latitude: 44.39, longitude: -79.69 },
      shapeLengthMeters: 5000,
    });

    expect(window).toEqual(expect.objectContaining({
      routeId: '8A',
      shapeId: 'shape-1',
      frozen: false,
      coreStartProgressMeters: 1400,
      coreEndProgressMeters: 1600,
      confirmStartProgressMeters: 1150,
      confirmEndProgressMeters: 1850,
      clearStartProgressMeters: 1000,
      clearEndProgressMeters: 2000,
      geoCenter: { latitude: 44.39, longitude: -79.69 },
    }));
  });

  test('matches only same-shape points inside the chosen window', () => {
    const window = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 1500,
      coordinate: { latitude: 44.39, longitude: -79.69 },
      shapeLengthMeters: 5000,
    });

    expect(pointMatchesEventWindow({ shapeId: 'shape-1', progressMeters: 1700 }, window, 'confirm')).toBe(true);
    expect(pointMatchesEventWindow({ shapeId: 'shape-1', progressMeters: 2500 }, window, 'confirm')).toBe(false);
    expect(pointMatchesEventWindow({ shapeId: 'shape-2', progressMeters: 1700 }, window, 'confirm')).toBe(false);
  });

  test('expands provisional windows but not frozen windows', () => {
    const initial = buildInitialEventWindow({
      routeId: '10',
      shapeId: 'shape-1',
      progressMeters: 1000,
      coordinate: { latitude: 44.39, longitude: -79.69 },
      shapeLengthMeters: 5000,
    });

    const expanded = expandProvisionalEventWindow(initial, {
      shapeId: 'shape-1',
      progressMeters: 1250,
      coordinate: { latitude: 44.391, longitude: -79.688 },
    }, { shapeLengthMeters: 5000 });

    expect(expanded.coreEndProgressMeters).toBeGreaterThan(initial.coreEndProgressMeters);
    expect(expandProvisionalEventWindow(freezeEventWindow(expanded), {
      shapeId: 'shape-1',
      progressMeters: 1800,
      coordinate: { latitude: 44.392, longitude: -79.687 },
    }, { shapeLengthMeters: 5000 })).toEqual(freezeEventWindow(expanded));
  });

  test('recognizes nearby windows and rejects far windows', () => {
    const first = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 1000,
      coordinate: { latitude: 44.39, longitude: -79.69 },
      shapeLengthMeters: 5000,
    });
    const nearby = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 1180,
      coordinate: { latitude: 44.391, longitude: -79.689 },
      shapeLengthMeters: 5000,
    });
    const far = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 3000,
      coordinate: { latitude: 44.40, longitude: -79.68 },
      shapeLengthMeters: 5000,
    });

    expect(windowsOverlapOrNear(first, nearby)).toBe(true);
    expect(windowsOverlapOrNear(first, far)).toBe(false);
  });

  test('uses a shorter lower-coverage clear window for weak detections', () => {
    const window = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 120,
      coordinate: { latitude: 44.39, longitude: -79.69 },
      shapeLengthMeters: 5000,
      coreHalfWidthMeters: 25,
    });

    const clearWindow = buildClearWindowForEvent(window, {
      shapeLengthMeters: 5000,
      quality: 'weak',
    });

    expect(clearWindow.endProgressMeters).toBeLessThanOrEqual(500);
    expect(clearWindow.minCoverageRatio).toBeLessThan(0.95);
  });
});
