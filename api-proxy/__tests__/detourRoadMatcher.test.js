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
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[detourRoadMatcher] OSRM match attempt failed'),
      expect.objectContaining({ radiusMeters: 75, reason: expect.stringContaining('HTTP 400') })
    );
    expect(result.roadMatchSource).toBe('osrm-match');
    expect(result.roadMatchConfidence).toBe('high');
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

  test('trims normal-route approach before publishing likely detour geometry', async () => {
    const routeShapePolyline = [
      { latitude: 44.0, longitude: -79.700 },
      { latitude: 44.0, longitude: -79.699 },
      { latitude: 44.0, longitude: -79.698 },
      { latitude: 44.0, longitude: -79.697 },
      { latitude: 44.0, longitude: -79.696 },
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
      },
      fetchImpl,
      shapes: new Map([['shape-11', routeShapePolyline]]),
    });

    expect(result.segments[0].likelyDetourPolyline).toEqual([
      { latitude: 44.002, longitude: -79.697 },
      { latitude: 44.002, longitude: -79.695 },
    ]);
    expect(result.likelyDetourPolyline).toEqual(result.segments[0].likelyDetourPolyline);
  });
});
