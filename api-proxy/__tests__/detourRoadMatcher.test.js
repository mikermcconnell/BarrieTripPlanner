const {
  buildOsrmMatchUrl,
  buildOsrmRouteUrl,
  confidenceLabel,
  getRoadMatcherStats,
  matchDetourGeometry,
  matchPolylineToRoads,
  normalizePolyline,
  removeAvoidableBacktracksFromPolyline,
  resetRoadMatcherStats,
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
  beforeEach(() => {
    resetRoadMatcherStats();
  });

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

  test('prefers OSRM route for sparse waypoint/preset paths', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => OSRM_ROUTE_RESPONSE,
    }));

    const result = await matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
      },
      preferRouteMatching: true,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('/route/v1/driving/');
    expect(fetchImpl.mock.calls[0][0]).not.toContain('/match/v1/driving/');
    expect(result.roadMatchSource).toBe('osrm-route');
    expect(result.likelyDetourRoadNames).toEqual([
      'Bayfield Street',
      'Grove Street',
      'Duckworth Street',
    ]);
    expect(getRoadMatcherStats()).toEqual(expect.objectContaining({
      requests: 1,
      routeAttempts: 1,
      successes: 1,
      failures: 0,
    }));
  });

  test('preferred OSRM route still rejects paths that reuse the closed segment', async () => {
    const rejectionReasons = [];
    const routePolyline = OSRM_ROUTE_RESPONSE.routes[0].geometry.coordinates
      .map(([longitude, latitude]) => ({ latitude, longitude }));
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => OSRM_ROUTE_RESPONSE,
    }));

    const result = await matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
      },
      preferRouteMatching: true,
      blockedPolyline: routePolyline,
      rejectionReasons,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('/route/v1/driving/');
    expect(result).toBeNull();
    expect(rejectionReasons).toContainEqual(expect.objectContaining({ reason: 'blocked-overlap' }));
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

  test('rejects low-confidence OSRM matches instead of publishing rider-facing geometry', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        matchings: [
          {
            confidence: 0.07,
            geometry: {
              coordinates: [
                [-79.6901, 44.3801],
                [-79.685, 44.385],
                [-79.6801, 44.3901],
              ],
            },
            legs: [{ steps: [{ name: 'Wonky Road' }] }],
          },
        ],
      }),
    }));

    const result = await matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_ENDPOINT_MAX_MISMATCH_METERS: '160',
        DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED: 'false',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    warnSpy.mockRestore();
  });

  test('falls back to OSRM route when trace matching is low-confidence', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'Ok',
          matchings: [
            {
              confidence: 0.07,
              geometry: {
                coordinates: [
                  [-79.6901, 44.3801],
                  [-79.685, 44.385],
                  [-79.6801, 44.3901],
                ],
              },
              legs: [{ steps: [{ name: 'Wonky Road' }] }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => OSRM_ROUTE_RESPONSE,
      });

    const result = await matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_ENDPOINT_MAX_MISMATCH_METERS: '160',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toContain('/route/v1/driving/');
    expect(result.roadMatchSource).toBe('osrm-route');
    expect(result.likelyDetourRoadNames).toEqual([
      'Bayfield Street',
      'Grove Street',
      'Duckworth Street',
    ]);
    warnSpy.mockRestore();
  });

  test('rejects road-matched paths whose endpoints drift too far from the observed detour path', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        matchings: [
          {
            confidence: 0.82,
            geometry: {
              coordinates: [
                [-79.6915, 44.3815],
                [-79.686, 44.386],
                [-79.6815, 44.3915],
              ],
            },
            legs: [{ steps: [{ name: 'Drifted Road' }] }],
          },
        ],
      }),
    }));

    const result = await matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_ENDPOINT_MAX_MISMATCH_METERS: '45',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    warnSpy.mockRestore();
  });

  test('accepts a road-matched endpoint that naturally rejoins the regular route corridor', async () => {
    const candidatePolyline = [
      { latitude: 44.000, longitude: -79.700 },
      { latitude: 44.002, longitude: -79.697 },
      { latitude: 44.000, longitude: -79.694 },
    ];
    const matchedPolyline = [
      [-79.700, 44.000],
      [-79.697, 44.002],
      [-79.695, 44.000],
    ];
    const routeShapePolyline = [
      { latitude: 44.000, longitude: -79.696 },
      { latitude: 44.000, longitude: -79.695 },
      { latitude: 44.000, longitude: -79.694 },
    ];
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        matchings: [
          {
            confidence: 0.82,
            geometry: { coordinates: matchedPolyline },
            legs: [{ steps: [{ name: 'Local Detour Road' }] }],
          },
        ],
      }),
    }));

    const result = await matchPolylineToRoads(candidatePolyline, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_ENDPOINT_MAX_MISMATCH_METERS: '45',
        DETOUR_ROAD_MATCHING_REJOIN_CORRIDOR_MAX_MISMATCH_METERS: '125',
      },
      routeShapePolyline,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      roadMatchSource: 'osrm-match',
      endpointMismatchAcceptedReason: 'rejoined-regular-route-corridor',
      likelyDetourPolyline: matchedPolyline.map(([longitude, latitude]) => ({ latitude, longitude })),
    }));
    expect(result.endpointMismatchMeters).toBeGreaterThan(45);
    expect(result.endpointMismatchMeters).toBeLessThanOrEqual(125);
  });

  test('accepts an explicit service rejoin point that differs from the GTFS route endpoint', async () => {
    const serviceRejoinPoint = { latitude: 44.002, longitude: -79.697 };
    const candidatePolyline = [
      { latitude: 44.000, longitude: -79.700 },
      { latitude: 44.001, longitude: -79.698 },
      serviceRejoinPoint,
    ];
    const matchedPolyline = [
      [-79.7006, 44.0003],
      [-79.698, 44.001],
      [-79.6976, 44.0023],
    ];
    const routeShapePolyline = [
      { latitude: 44.000, longitude: -79.700 },
      { latitude: 44.000, longitude: -79.699 },
    ];
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        matchings: [
          {
            confidence: 0.9,
            geometry: { coordinates: matchedPolyline },
            legs: [{ steps: [{ name: 'Service Rejoin Road' }] }],
          },
        ],
      }),
    }));

    const result = await matchPolylineToRoads(candidatePolyline, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_ENDPOINT_MAX_MISMATCH_METERS: '45',
        DETOUR_ROAD_MATCHING_REJOIN_CORRIDOR_MAX_MISMATCH_METERS: '125',
      },
      routeShapePolyline,
      serviceRejoinPoint,
      fetchImpl,
    });

    expect(result).toEqual(expect.objectContaining({
      roadMatchSource: 'osrm-match',
      endpointMismatchAcceptedReason: 'matched-explicit-service-rejoin',
      likelyDetourPolyline: matchedPolyline.map(([longitude, latitude]) => ({ latitude, longitude })),
    }));
    expect(result.endpointMismatchMeters).toBeGreaterThan(45);
    expect(result.endpointMismatchMeters).toBeLessThanOrEqual(125);
  });


  test('retries map matching with a smaller radius before route fallback', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ code: 'TooBig', message: 'Radius search size is too large for map matching.' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => OSRM_RESPONSE,
      });

    const result = await matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_RADIUS_METERS: '75',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toContain('radiuses=75%3B75%3B75');
    expect(fetchImpl.mock.calls[1][0]).toContain('radiuses=25%3B25%3B25');
    expect(fetchImpl.mock.calls[1][0]).toContain('/match/v1/driving/');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"detour_road_match_failed"'));
    const warning = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(warning).toEqual(expect.objectContaining({
      event: 'detour_road_match_failed',
      source: 'osrm-match',
      radiusMeters: 75,
      reason: expect.stringContaining('HTTP 400'),
    }));
    expect(result.roadMatchSource).toBe('osrm-match');
    expect(result.roadMatchConfidence).toBe('high');
    warnSpy.mockRestore();
  });

  test('includes route and event context in road-match failure telemetry', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ code: 'InvalidValue', message: 'bad trace' }),
    }));

    await expect(matchPolylineToRoads(INPUT_POLYLINE, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED: 'false',
      },
      logContext: {
        routeId: '8A',
        publishId: '8A:event-1',
        eventId: 'event-1',
        segmentEventId: 'segment-1',
      },
      fetchImpl,
    })).rejects.toThrow('Road matching failed with HTTP 400');

    const warning = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(warning).toEqual(expect.objectContaining({
      event: 'detour_road_match_failed',
      routeId: '8A',
      publishId: '8A:event-1',
      eventId: 'event-1',
      segmentEventId: 'segment-1',
      source: 'osrm-match',
    }));
    expect(getRoadMatcherStats().recentEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'failure',
        routeId: '8A',
        publishId: '8A:event-1',
      }),
    ]));
    warnSpy.mockRestore();
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
        DETOUR_ROAD_MATCHING_BLOCKED_ENDPOINT_RATIO: '0.2',
        DETOUR_ROAD_MATCHING_BACKTRACK_PROXIMITY_METERS: '20',
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

  test('does not use OSRM route fallback for configured corridor segments', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = jest.fn(async (url) => {
      if (url.includes('/route/v1/driving/')) {
        return {
          ok: true,
          json: async () => OSRM_ROUTE_RESPONSE,
        };
      }
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
      };
    });
    const geometry = {
      canShowDetourPath: true,
      inferredDetourPolyline: INPUT_POLYLINE,
      skippedSegmentPolyline: [
        { latitude: 44.38, longitude: -79.691 },
        { latitude: 44.39, longitude: -79.679 },
      ],
      segments: [{
        canShowDetourPath: true,
        configuredCorridor: true,
        configuredCorridorLabel: 'Livingstone-Anne',
        inferredDetourPolyline: INPUT_POLYLINE,
        skippedSegmentPolyline: [
          { latitude: 44.38, longitude: -79.691 },
          { latitude: 44.39, longitude: -79.679 },
        ],
      }],
    };

    const result = await matchDetourGeometry(geometry, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED: 'true',
      },
      fetchImpl,
    });

    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchImpl.mock.calls.every((call) => call[0].includes('/match/v1/driving/'))).toBe(true);
    expect(fetchImpl.mock.calls.some((call) => call[0].includes('/route/v1/driving/'))).toBe(false);
    expect(result.likelyDetourPolyline).toBeUndefined();
    expect(result.segments[0].likelyDetourPolyline).toBeUndefined();
    expect(result.segments[0].inferredDetourPolyline).toEqual(INPUT_POLYLINE);
    warnSpy.mockRestore();
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
        DETOUR_ROAD_MATCHING_BLOCKED_ENDPOINT_RATIO: '0.2',
        DETOUR_ROAD_MATCHING_BACKTRACK_PROXIMITY_METERS: '20',
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
                  [-79.6801, 44.3901],
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
        DETOUR_ROAD_MATCHING_ENDPOINT_MAX_MISMATCH_METERS: '160',
      },
      fetchImpl,
    });

    expect(result.roadMatchSource).toBe('osrm-route');
    expect(result.likelyDetourPolyline).toEqual([
      { latitude: 44.379, longitude: -79.691 },
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.3901, longitude: -79.6801 },
    ]);
  });

  test('route fallback can publish a Hooper Road detour after removing a leading OSRM spur', async () => {
    const inferredDetourPolyline = [
      { latitude: 44.33886019274972, longitude: -79.66989393548232 },
      { latitude: 44.336219787597656, longitude: -79.67129516601562 },
      { latitude: 44.33441162109375, longitude: -79.67435455322266 },
      { latitude: 44.33293067604765, longitude: -79.67451703744516 },
    ];
    const skippedSegmentPolyline = [
      { latitude: 44.33886019280516, longitude: -79.66989393549959 },
      { latitude: 44.338480305004, longitude: -79.6697756710763 },
      { latitude: 44.33673653, longitude: -79.66942321 },
      { latitude: 44.3344369145376, longitude: -79.6687486938254 },
      { latitude: 44.3342517234573, longitude: -79.6689704420632 },
      { latitude: 44.33312923, longitude: -79.67365255 },
      { latitude: 44.33293067702775, longitude: -79.67451703317792 },
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
                  [-79.669912, 44.338900],
                  [-79.670052, 44.338868],
                  [-79.671667, 44.338491],
                  [-79.675445, 44.337602],
                  [-79.675544, 44.337581],
                  [-79.675489, 44.337473],
                  [-79.674781, 44.337647],
                  [-79.672571, 44.338169],
                  [-79.672263, 44.338238],
                  [-79.670927, 44.338539],
                  [-79.670003, 44.338740],
                  [-79.669818, 44.338780],
                  [-79.669795, 44.338692],
                  [-79.669406, 44.337199],
                  [-79.669353, 44.336993],
                  [-79.669248, 44.336659],
                  [-79.669865, 44.336540],
                  [-79.671289, 44.336208],
                  [-79.672749, 44.335867],
                  [-79.673196, 44.335763],
                  [-79.673686, 44.335648],
                  [-79.674015, 44.335517],
                  [-79.674167, 44.335389],
                  [-79.674266, 44.335278],
                  [-79.674389, 44.335053],
                  [-79.674383, 44.334783],
                  [-79.674290, 44.334420],
                  [-79.674268, 44.334333],
                  [-79.673956, 44.333104],
                  [-79.673896, 44.332986],
                  [-79.674473, 44.332865],
                  [-79.674488, 44.332862],
                ],
              },
              legs: [
                {
                  steps: [
                    { name: 'Mapleview Drive East' },
                    { name: 'Welham Road' },
                    { name: 'Hooper Road' },
                    { name: 'Saunders Road' },
                  ],
                },
              ],
            },
          ],
        }),
      });

    const result = await matchDetourGeometry({
      shapeId: '12A',
      inferredDetourPolyline,
      segments: [
        {
          segmentId: 'segment-1',
          skippedSegmentPolyline,
          inferredDetourPolyline,
          canShowDetourPath: true,
        },
      ],
    }, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_BLOCKED_ENDPOINT_RATIO: '0.2',
        DETOUR_ROAD_MATCHING_BACKTRACK_PROXIMITY_METERS: '20',
      },
      fetchImpl,
    });

    expect(result.likelyDetourPolyline.length).toBeGreaterThan(2);
    expect(result.likelyDetourRoadNames).toContain('Hooper Road');
    expect(result.roadMatchSource).toBe('osrm-route');
    expect(result.likelyDetourPolyline).not.toContainEqual({
      latitude: 44.337602,
      longitude: -79.675445,
    });
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

  test('matches trusted segments even when a multi-segment detour has a stale top-level path', async () => {
    const staleTopLevelPath = [
      { latitude: 44.388, longitude: -79.691 },
      { latitude: 44.387, longitude: -79.690 },
    ];
    const trustedSegmentPath = [
      { latitude: 44.33657, longitude: -79.66937 },
      { latitude: 44.3364, longitude: -79.67046 },
      { latitude: 44.33515, longitude: -79.67443 },
      { latitude: 44.33304, longitude: -79.67401 },
    ];
    const matchedTrustedSegmentPath = [
      { latitude: 44.3366, longitude: -79.6693 },
      { latitude: 44.3355, longitude: -79.6720 },
      { latitude: 44.3331, longitude: -79.6740 },
    ];
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'Ok',
          matchings: [{
            confidence: 0.8,
            geometry: {
              coordinates: [
                [-79.691, 44.388],
                [-79.690, 44.387],
              ],
            },
            legs: [{ steps: [{ name: 'Maple Avenue' }] }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'Ok',
          matchings: [{
            confidence: 0.86,
            geometry: {
              coordinates: matchedTrustedSegmentPath.map((point) => [point.longitude, point.latitude]),
            },
            legs: [{ steps: [{ name: 'Hooper Road' }, { name: 'Saunders Road' }] }],
          }],
        }),
      });

    const result = await matchDetourGeometry({
      shapeId: '12A',
      inferredDetourPolyline: staleTopLevelPath,
      segments: [
        {
          segmentId: 'south-segment',
          inferredDetourPolyline: trustedSegmentPath,
          canShowDetourPath: true,
        },
        {
          segmentId: 'low-segment',
          inferredDetourPolyline: staleTopLevelPath,
          canShowDetourPath: false,
        },
      ],
    }, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.likelyDetourRoadNames).toEqual(['Hooper Road', 'Saunders Road']);
    expect(result.likelyDetourPolyline).toEqual(matchedTrustedSegmentPath);
    expect(result.segments[0].likelyDetourPolyline).toEqual(matchedTrustedSegmentPath);
    expect(result.segments[0].roadMatchSource).toBe('osrm-match');
    expect(result.segments[1].likelyDetourPolyline).toBeUndefined();
  });

  test('does not road-match untrusted sparse detour paths', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => OSRM_RESPONSE,
    }));

    const geometry = {
      shapeId: 'shape-12',
      inferredDetourPolyline: INPUT_POLYLINE,
      segments: [
        {
          segmentId: 'segment-1',
          inferredDetourPolyline: INPUT_POLYLINE,
          canShowDetourPath: false,
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

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.likelyDetourPolyline).toBeUndefined();
    expect(result.segments[0].likelyDetourPolyline).toBeUndefined();
  });

  test('clears stale low-confidence likely paths when a fresh match is rejected', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const staleLikelyPath = [
      { latitude: 44.389976, longitude: -79.690763 },
      { latitude: 44.389413, longitude: -79.690277 },
    ];
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        matchings: [
          {
            confidence: 0.07,
            geometry: {
              coordinates: staleLikelyPath.map((point) => [point.longitude, point.latitude]),
            },
            legs: [{ steps: [{ name: 'Old Low Confidence Road' }] }],
          },
        ],
      }),
    }));

    const result = await matchDetourGeometry({
      shapeId: 'shape-8',
      inferredDetourPolyline: INPUT_POLYLINE,
      likelyDetourPolyline: staleLikelyPath,
      roadMatchSource: 'osrm-match',
      roadMatchConfidence: 'low',
      roadMatchRawConfidence: 0.07,
      likelyDetourRoadNames: ['Old Low Confidence Road'],
      segments: [
        {
          segmentId: 'segment-8',
          inferredDetourPolyline: INPUT_POLYLINE,
          likelyDetourPolyline: staleLikelyPath,
          roadMatchSource: 'osrm-match',
          roadMatchConfidence: 'low',
          roadMatchRawConfidence: 0.07,
          likelyDetourRoadNames: ['Old Low Confidence Road'],
          canShowDetourPath: true,
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
    expect(result.roadMatchSource).toBeUndefined();
    expect(result.roadMatchConfidence).toBeUndefined();
    expect(result.segments[0].likelyDetourPolyline).toBeUndefined();
    expect(result.segments[0].roadMatchSource).toBeUndefined();
    expect(result.segments[0].roadMatchConfidence).toBeUndefined();
    warnSpy.mockRestore();
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

  test('rejects short 12A road-matched paths that materially overlap the closed segment', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const skippedSegmentPolyline = [
      { latitude: 44.35015, longitude: -79.615745 },
      { latitude: 44.348353, longitude: -79.614675 },
      { latitude: 44.3475292511835, longitude: -79.614012632186 },
      { latitude: 44.34775282446762, longitude: -79.61311112654813 },
    ];
    const suspiciousLikelyPath = [
      { latitude: 44.35104, longitude: -79.616055 },
      { latitude: 44.349648, longitude: -79.615383 },
      { latitude: 44.349031, longitude: -79.614955 },
      { latitude: 44.348194, longitude: -79.614333 },
      { latitude: 44.348485, longitude: -79.613472 },
    ];
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        matchings: [{
          confidence: 0.84,
          geometry: {
            coordinates: suspiciousLikelyPath.map((point) => [point.longitude, point.latitude]),
          },
          legs: [{ steps: [{ name: 'Mapleview Drive East' }, { name: 'Lally Terrace' }] }],
        }],
      }),
    }));

    const result = await matchDetourGeometry({
      shapeId: '12A',
      inferredDetourPolyline: suspiciousLikelyPath,
      segments: [
        {
          segmentId: '12A:1c872f32-f2a7-4aed-9eaa-72386e4d576e:0-400',
          shapeId: '12A',
          skippedSegmentPolyline,
          inferredDetourPolyline: suspiciousLikelyPath,
          canShowDetourPath: true,
        },
      ],
    }, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED: 'false',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.likelyDetourPolyline).toBeUndefined();
    expect(result.roadMatchSource).toBeUndefined();
    expect(result.segments[0].canShowDetourPath).toBe(false);
    expect(result.segments[0].inferredDetourPolyline).toBeNull();
    expect(result.segments[0].likelyDetourPolyline).toBeUndefined();
    expect(result.segments[0].roadMatchSource).toBeUndefined();
    warnSpy.mockRestore();
  });

  test('rejects 12A route-fallback paths that materially overlap the closed segment', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const skippedSegmentPolyline = [
      { latitude: 44.35015, longitude: -79.615745 },
      { latitude: 44.348353, longitude: -79.614675 },
      { latitude: 44.3475292511835, longitude: -79.614012632186 },
      { latitude: 44.34775282446762, longitude: -79.61311112654813 },
    ];
    const inferredDetourPolyline = [
      { latitude: 44.35103225708008, longitude: -79.61605072021484 },
      { latitude: 44.35165786743164, longitude: -79.61360931396484 },
      { latitude: 44.35073471069336, longitude: -79.61592864990234 },
      { latitude: 44.34844970703125, longitude: -79.61344909667969 },
    ];
    const overlappingRouteFallbackPath = [
      { latitude: 44.35104, longitude: -79.616055 },
      { latitude: 44.350744, longitude: -79.615891 },
      { latitude: 44.349648, longitude: -79.615383 },
      { latitude: 44.349031, longitude: -79.614955 },
      { latitude: 44.348194, longitude: -79.614333 },
      { latitude: 44.348485, longitude: -79.613472 },
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
          routes: [{
            geometry: {
              coordinates: overlappingRouteFallbackPath.map((point) => [point.longitude, point.latitude]),
            },
            legs: [{ steps: [{ name: 'Mapleview Drive East' }, { name: 'Lally Terrace' }] }],
          }],
        }),
      });

    const result = await matchDetourGeometry({
      shapeId: '12A',
      inferredDetourPolyline,
      segments: [
        {
          segmentId: '12A:1c872f32-f2a7-4aed-9eaa-72386e4d576e:0-400',
          shapeId: '12A',
          skippedSegmentPolyline,
          inferredDetourPolyline,
          canShowDetourPath: true,
        },
      ],
    }, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_BLOCKED_ENDPOINT_RATIO: '0.2',
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.canShowDetourPath).toBe(false);
    expect(result.inferredDetourPolyline).toBeNull();
    expect(result.likelyDetourPolyline).toBeUndefined();
    expect(result.roadMatchSource).toBeUndefined();
    expect(result.segments[0].canShowDetourPath).toBe(false);
    expect(result.segments[0].inferredDetourPolyline).toBeNull();
    expect(result.segments[0].likelyDetourPolyline).toBeUndefined();
    expect(result.segments[0].roadMatchSource).toBeUndefined();
    warnSpy.mockRestore();
  });

  test('keeps normal-route approach in the published rider detour geometry', async () => {
    const routeShapePolyline = [
      { latitude: 44.0, longitude: -79.700 },
      { latitude: 44.0, longitude: -79.699 },
      { latitude: 44.0, longitude: -79.698 },
      { latitude: 44.0, longitude: -79.697 },
      { latitude: 44.0, longitude: -79.696 },
      { latitude: 44.0, longitude: -79.695 },
      { latitude: 44.0, longitude: -79.694 },
      { latitude: 44.0, longitude: -79.693 },
    ];
    const skippedSegmentPolyline = [
      { latitude: 44.0, longitude: -79.696 },
      { latitude: 44.0, longitude: -79.694 },
    ];
    const matchedPath = [
      [-79.700, 44.000],
      [-79.699, 44.000],
      [-79.698, 44.000],
      [-79.697, 44.002],
      [-79.695, 44.002],
    ];
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        matchings: [{
          confidence: 0.91,
          geometry: { coordinates: matchedPath },
          legs: [{ steps: [{ name: 'Detour Road' }] }],
        }],
      }),
    });

    const result = await matchDetourGeometry({
      shapeId: 'shape-11',
      inferredDetourPolyline: matchedPath.map(([longitude, latitude]) => ({ latitude, longitude })),
      segments: [{
        shapeId: 'shape-11',
        skippedSegmentPolyline,
        inferredDetourPolyline: matchedPath.map(([longitude, latitude]) => ({ latitude, longitude })),
        canShowDetourPath: true,
      }],
    }, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_ROUTE_OVERLAP_MIN_RUN_METERS: '1',
      },
      fetchImpl,
      shapes: new Map([['shape-11', routeShapePolyline]]),
    });

    expect(result.segments[0].likelyDetourPolyline).toEqual([
      { latitude: 44.0, longitude: -79.7 },
      { latitude: 44.0, longitude: -79.699 },
      { latitude: 44.0, longitude: -79.698 },
      { latitude: 44.002, longitude: -79.697 },
      { latitude: 44.002, longitude: -79.695 },
    ]);
    expect(result.likelyDetourPolyline).toEqual(result.segments[0].likelyDetourPolyline);
    expect(result.segments[0].entryConnectorPolyline).toBeNull();
    expect(result.segments[0].exitConnectorPolyline).toBeNull();
  });

  test('publishes road-matched detour path with normal-route approaches already stitched in', async () => {
    const routeShapePolyline = [
      { latitude: 44.0, longitude: -79.700 },
      { latitude: 44.0, longitude: -79.699 },
      { latitude: 44.0, longitude: -79.698 },
      { latitude: 44.0, longitude: -79.697 },
      { latitude: 44.0, longitude: -79.696 },
      { latitude: 44.0, longitude: -79.695 },
      { latitude: 44.0, longitude: -79.694 },
      { latitude: 44.0, longitude: -79.693 },
    ];
    const matchedPath = [
      [-79.700, 44.000],
      [-79.699, 44.000],
      [-79.698, 44.000],
      [-79.697, 44.002],
      [-79.695, 44.002],
      [-79.694, 44.000],
      [-79.693, 44.000],
    ];
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        matchings: [{
          confidence: 0.91,
          geometry: { coordinates: matchedPath },
          legs: [{ steps: [{ name: 'Detour Road' }] }],
        }],
      }),
    });

    const result = await matchDetourGeometry({
      shapeId: 'shape-8b',
      inferredDetourPolyline: matchedPath.map(([longitude, latitude]) => ({ latitude, longitude })),
      segments: [{
        shapeId: 'shape-8b',
        skippedSegmentPolyline: [
          { latitude: 44.0, longitude: -79.698 },
          { latitude: 44.0, longitude: -79.693 },
        ],
        inferredDetourPolyline: matchedPath.map(([longitude, latitude]) => ({ latitude, longitude })),
        canShowDetourPath: true,
      }],
    }, {
      env: {
        DETOUR_ROAD_MATCHING_ENABLED: 'true',
        DETOUR_ROAD_MATCHING_BASE_URL: 'https://router.example.com',
        DETOUR_ROAD_MATCHING_ROUTE_OVERLAP_MIN_RUN_METERS: '1',
      },
      fetchImpl,
      shapes: new Map([['shape-8b', routeShapePolyline]]),
    });

    expect(result.segments[0].likelyDetourPolyline).toEqual([
      { latitude: 44.0, longitude: -79.7 },
      { latitude: 44.0, longitude: -79.699 },
      { latitude: 44.0, longitude: -79.698 },
      { latitude: 44.002, longitude: -79.697 },
      { latitude: 44.002, longitude: -79.695 },
      { latitude: 44.0, longitude: -79.694 },
      { latitude: 44.0, longitude: -79.693 },
    ]);
    expect(result.likelyDetourPolyline).toEqual(result.segments[0].likelyDetourPolyline);
    expect(result.segments[0].entryConnectorPolyline).toBeNull();
    expect(result.segments[0].exitConnectorPolyline).toBeNull();
    expect(result.entryConnectorPolyline).toBeNull();
    expect(result.exitConnectorPolyline).toBeNull();
  });
});
