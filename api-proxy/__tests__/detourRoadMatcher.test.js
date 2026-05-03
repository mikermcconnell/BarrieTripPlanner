const {
  buildOsrmMatchUrl,
  buildOsrmRouteUrl,
  confidenceLabel,
  matchDetourGeometry,
  matchPolylineToRoads,
  normalizePolyline,
  removeAvoidableBacktracksFromPolyline,
} = require('../detourRoadMatcher');

const INPUT_POLYLINE = [
  { latitude: 44.38, longitude: -79.69 },
  { latitude: 44.381, longitude: -79.688 },
  { latitude: 44.39, longitude: -79.68 },
];

const OSRM_RESPONSE = {
  code: 'Ok',
  matchings: [
    {
      confidence: 0.82,
      geometry: {
        coordinates: [
          [-79.6901, 44.3801],
          [-79.685, 44.385],
          [-79.6801, 44.3901],
        ],
      },
      legs: [
        { steps: [{ name: 'Mapleview Drive East' }, { name: 'Yonge Street' }] },
        { steps: [{ name: 'Yonge Street' }, { name: 'Big Bay Point Road' }] },
      ],
    },
  ],
};

const OSRM_ROUTE_RESPONSE = {
  code: 'Ok',
  routes: [
    {
      geometry: {
        coordinates: [
          [-79.6901, 44.3801],
          [-79.6901, 44.386],
          [-79.6801, 44.386],
          [-79.6801, 44.3901],
        ],
      },
      legs: [
        { steps: [{ name: 'Bayfield Street' }, { name: 'Grove Street' }] },
        { steps: [{ name: 'Grove Street' }, { name: 'Duckworth Street' }] },
      ],
    },
  ],
};

describe('detourRoadMatcher', () => {
  test('normalizes coordinates and drops invalid points', () => {
    expect(normalizePolyline([
      { lat: '44.38', lon: '-79.69' },
      { latitude: null, longitude: -79.68 },
      { latitude: 44.39, longitude: -79.67 },
    ])).toEqual([
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.39, longitude: -79.67 },
    ]);
  });

  test('builds OSRM match URLs with lon-lat coordinates', () => {
    expect(buildOsrmMatchUrl('https://router.example.com', INPUT_POLYLINE))
      .toContain('/match/v1/driving/-79.69,44.38;-79.688,44.381;-79.68,44.39?');
    expect(buildOsrmMatchUrl('https://router.example.com', INPUT_POLYLINE))
      .toContain('radiuses=75%3B75%3B75');
  });

  test('builds OSRM route fallback URLs with lon-lat coordinates', () => {
    expect(buildOsrmRouteUrl('https://router.example.com', INPUT_POLYLINE))
      .toContain('/route/v1/driving/-79.69,44.38;-79.688,44.381;-79.68,44.39?');
  });

  test('maps raw OSRM confidence to labels', () => {
    expect(confidenceLabel(0.9)).toBe('high');
    expect(confidenceLabel(0.5)).toBe('medium');
    expect(confidenceLabel(0.2)).toBe('low');
    expect(confidenceLabel(null)).toBeNull();
  });

  test('returns null when road matching is disabled or unconfigured', async () => {
    const fetchImpl = jest.fn();
    await expect(matchPolylineToRoads(INPUT_POLYLINE, {
      env: { DETOUR_ROAD_MATCHING_ENABLED: 'false' },
      fetchImpl,
    })).resolves.toBeNull();
    await expect(matchPolylineToRoads(INPUT_POLYLINE, {
      env: { DETOUR_ROAD_MATCHING_ENABLED: 'true' },
      fetchImpl,
    })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('matches an inferred detour path to roads', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => OSRM_RESPONSE,
    }));

    const result = await matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com/',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.detourPathLabel).toBe('Likely detour path');
    expect(result.roadMatchConfidence).toBe('high');
    expect(result.likelyDetourRoadNames).toEqual([
      'Mapleview Drive East',
      'Yonge Street',
      'Big Bay Point Road',
    ]);
    expect(result.likelyDetourPolyline).toEqual([
      { latitude: 44.3801, longitude: -79.6901 },
      { latitude: 44.385, longitude: -79.685 },
      { latitude: 44.3901, longitude: -79.6801 },
    ]);
  });

  test('falls back to OSRM route when trace matching has no usable geometry', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'Ok', matchings: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => OSRM_ROUTE_RESPONSE,
      });

    const result = await matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toContain('/match/v1/driving/');
    expect(fetchImpl.mock.calls[1][0]).toContain('/route/v1/driving/');
    expect(result.roadMatchSource).toBe('osrm-route');
    expect(result.likelyDetourRoadNames).toEqual([
      'Bayfield Street',
      'Grove Street',
      'Duckworth Street',
    ]);
    expect(result.likelyDetourPolyline).toEqual([
      { latitude: 44.3801, longitude: -79.6901 },
      { latitude: 44.386, longitude: -79.6901 },
      { latitude: 44.386, longitude: -79.6801 },
      { latitude: 44.3901, longitude: -79.6801 },
    ]);
  });

  test('uses a fresh timeout signal for route fallback after match aborts', async () => {
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(async () => {
        const error = new Error('This operation was aborted');
        error.name = 'AbortError';
        throw error;
      })
      .mockImplementationOnce(async (_url, options = {}) => {
        expect(options.signal?.aborted).toBe(false);
        return {
          ok: true,
          json: async () => OSRM_ROUTE_RESPONSE,
        };
      });

    const result = await matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.roadMatchSource).toBe('osrm-route');
  });

  test('removes obvious out-and-back road matching spurs', () => {
    const cleaned = removeAvoidableBacktracksFromPolyline([
      { latitude: 44.379, longitude: -79.691 },
      { latitude: 44.38, longitude: -79.690 },
      { latitude: 44.381, longitude: -79.689 },
      { latitude: 44.382, longitude: -79.688 },
      { latitude: 44.381, longitude: -79.689 },
      { latitude: 44.38, longitude: -79.690 },
      { latitude: 44.38, longitude: -79.680 },
    ]);

    expect(cleaned).toEqual([
      { latitude: 44.379, longitude: -79.691 },
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.38, longitude: -79.68 },
    ]);
  });

  test('route fallback strips spurs before publishing likely detour geometry', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'Ok', matchings: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              geometry: {
                coordinates: [
                  [-79.691, 44.379],
                  [-79.690, 44.380],
                  [-79.689, 44.381],
                  [-79.688, 44.382],
                  [-79.689, 44.381],
                  [-79.690, 44.380],
                  [-79.680, 44.380],
                ],
              },
              legs: [
                { steps: [{ name: 'Main Road' }, { name: 'Side Street' }] },
                { steps: [{ name: 'Main Road' }] },
              ],
            },
          ],
        }),
      });

    const result = await matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
      },
      fetchImpl,
    });

    expect(result.roadMatchSource).toBe('osrm-route');
    expect(result.likelyDetourPolyline).toEqual([
      { latitude: 44.379, longitude: -79.691 },
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.38, longitude: -79.68 },
    ]);
  });

  test('decorates each segment and mirrors the primary likely path top-level', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => OSRM_RESPONSE,
    }));

    const geometry = {
      shapeId: 'shape-10',
      inferredDetourPolyline: INPUT_POLYLINE,
      segments: [
        {
          segmentId: 'segment-1',
          inferredDetourPolyline: INPUT_POLYLINE,
        },
      ],
    };

    const result = await matchDetourGeometry(geometry, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
      },
      fetchImpl,
    });

    expect(result.detourPathLabel).toBe('Likely detour path');
    expect(result.likelyDetourPolyline).toHaveLength(3);
    expect(result.likelyDetourRoadNames).toContain('Yonge Street');
    expect(result.segments[0].likelyDetourPolyline).toHaveLength(3);
    expect(result.segments[0].roadMatchSource).toBe('osrm-match');
  });

  test('rejects road-matched paths that mostly reuse the skipped closed segment', async () => {
    const skippedSegmentPolyline = [
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.385, longitude: -79.685 },
      { latitude: 44.39, longitude: -79.68 },
    ];
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'Ok', matchings: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              geometry: {
                coordinates: [
                  [-79.69, 44.38],
                  [-79.6875, 44.3825],
                  [-79.685, 44.385],
                  [-79.6825, 44.3875],
                  [-79.68, 44.39],
                ],
              },
              legs: [
                { steps: [{ name: 'Closed Road' }] },
                { steps: [{ name: 'Still Closed Road' }] },
              ],
            },
          ],
        }),
      });

    const result = await matchDetourGeometry({
      shapeId: 'shape-10',
      inferredDetourPolyline: INPUT_POLYLINE,
      segments: [
        {
          segmentId: 'segment-1',
          skippedSegmentPolyline,
          inferredDetourPolyline: INPUT_POLYLINE,
        },
      ],
    }, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_BLOCKED_OVERLAP_RATIO: '0.2',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.likelyDetourPolyline).toBeUndefined();
    expect(result.roadMatchSource).toBeUndefined();
    expect(result.segments[0].likelyDetourPolyline).toBeUndefined();
  });

  test('rejects likely detour geometry with visible interior overlap on the closed segment', async () => {
    const skippedSegmentPolyline = [
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.381, longitude: -79.689 },
      { latitude: 44.382, longitude: -79.688 },
      { latitude: 44.383, longitude: -79.687 },
      { latitude: 44.384, longitude: -79.686 },
      { latitude: 44.385, longitude: -79.685 },
    ];
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'Ok', matchings: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              geometry: {
                coordinates: [
                  [-79.690, 44.380],
                  [-79.689, 44.381],
                  [-79.688, 44.382],
                  [-79.686, 44.384],
                  [-79.682, 44.389],
                  [-79.680, 44.390],
                ],
              },
              legs: [{ steps: [{ name: 'Closed Road' }] }],
            },
          ],
        }),
      });

    const result = await matchDetourGeometry({
      shapeId: 'shape-10',
      inferredDetourPolyline: INPUT_POLYLINE,
      segments: [
        {
          segmentId: 'segment-1',
          skippedSegmentPolyline,
          inferredDetourPolyline: INPUT_POLYLINE,
        },
      ],
    }, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
      },
      fetchImpl,
    });

    expect(result.likelyDetourPolyline).toBeUndefined();
    expect(result.segments[0].likelyDetourPolyline).toBeUndefined();
  });
});
