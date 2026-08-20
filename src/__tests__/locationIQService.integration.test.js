const loadLocationService = ({
  localReadyInitially = true,
  localAutocompleteResults = [],
  localReverseResult = null,
  matchesLocalStreet = false,
  retryResponse = null,
} = {}) => {
  jest.resetModules();

  let localReady = localReadyInitially;
  const localMocks = {
    initLocalGeocoding: jest.fn(async () => {
      localReady = true;
      return true;
    }),
    isLocalDataReady: jest.fn(() => localReady),
    localAutocomplete: jest.fn(() => localAutocompleteResults),
    localReverseGeocode: jest.fn(() => localReverseResult),
    matchesLocalStreet: jest.fn(() => matchesLocalStreet),
  };
  const retryFetchMock = jest.fn(async () => retryResponse);
  const getApiProxyRequestOptionsMock = jest.fn(async () => ({
    headers: {
      Authorization: 'Bearer test-id-token',
      'x-client-id': 'barrie-transit-app',
    },
  }));

  jest.doMock('../services/localGeocodingService', () => localMocks);
  jest.doMock('../utils/localLandmarkSearch', () => ({
    findMatchingLocalLandmarks: jest.fn(() => []),
  }));
  jest.doMock('../utils/retryFetch', () => ({ retryFetch: retryFetchMock }));
  jest.doMock('../services/proxyAuth', () => ({
    getApiProxyRequestOptions: getApiProxyRequestOptionsMock,
  }));
  jest.doMock('../utils/logger', () => ({
    __esModule: true,
    default: {
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  }));

  return {
    service: require('../services/locationIQService'),
    localMocks,
    retryFetchMock,
    getApiProxyRequestOptionsMock,
  };
};

const makeResponse = (data, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: jest.fn(async () => data),
});

describe('locationIQService hybrid address integration', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('initializes local address data and keeps matching street searches off the network', async () => {
    const localResult = {
      id: 'local-1',
      displayName: '10 Collier Street, Barrie, Ontario',
      shortName: '10 Collier Street, Barrie',
      lat: 44.389,
      lon: -79.69,
      source: 'local',
    };
    const {
      service,
      localMocks,
      retryFetchMock,
    } = loadLocationService({
      localReadyInitially: false,
      localAutocompleteResults: [localResult],
      matchesLocalStreet: true,
    });

    await expect(service.autocompleteAddress('10 Collier')).resolves.toEqual([localResult]);
    expect(localMocks.initLocalGeocoding).toHaveBeenCalledTimes(1);
    expect(localMocks.localAutocomplete).toHaveBeenCalledWith('10 Collier', 5);
    expect(retryFetchMock).not.toHaveBeenCalled();
  });

  test('uses a confident local result when geocoding a selected address', async () => {
    const localResult = {
      id: 'local-2',
      displayName: '70 Collier Street, Barrie, Ontario',
      shortName: '70 Collier Street, Barrie',
      lat: 44.3895,
      lon: -79.6895,
      source: 'local',
    };
    const { service, retryFetchMock } = loadLocationService({
      localAutocompleteResults: [localResult],
    });

    await expect(service.geocodeAddress('70 Collier Street')).resolves.toEqual(localResult);
    expect(retryFetchMock).not.toHaveBeenCalled();
  });

  test('falls back to the authenticated proxy for POI autocomplete and normalizes its response', async () => {
    const response = makeResponse([
      {
        place_id: 'poi-1',
        display_name: 'Barrie Public Library, 60 Worsley Street, Barrie, Ontario, Canada',
        lat: '44.3901',
        lon: '-79.6874',
        type: 'library',
        importance: 0.8,
        address: {
          name: 'Barrie Public Library',
          city: 'Barrie',
        },
      },
    ]);
    const {
      service,
      retryFetchMock,
      getApiProxyRequestOptionsMock,
    } = loadLocationService({ retryResponse: response });

    await expect(service.autocompleteAddress('Library')).resolves.toEqual([
      expect.objectContaining({
        id: 'poi-1',
        shortName: 'Barrie Public Library, Barrie',
        lat: 44.3901,
        lon: -79.6874,
      }),
    ]);
    expect(getApiProxyRequestOptionsMock).toHaveBeenCalledWith('test-proxy-token');
    expect(retryFetchMock).toHaveBeenCalledWith(
      'https://proxy.example.com/api/autocomplete?q=Library',
      {
        maxRetries: 2,
        headers: {
          Authorization: 'Bearer test-id-token',
          'x-client-id': 'barrie-transit-app',
        },
      }
    );
  });

  test('geocodes through the proxy when the selected address is not in local data', async () => {
    const response = makeResponse([
      {
        display_name: 'East Bayfield Community Centre, 80 Livingstone Street East, Barrie, Ontario, Canada',
        lat: '44.4119',
        lon: '-79.6954',
        address: {
          name: 'East Bayfield Community Centre',
          city: 'Barrie',
        },
      },
    ]);
    const { service, retryFetchMock } = loadLocationService({ retryResponse: response });

    await expect(service.geocodeAddress('East Bayfield Community Centre')).resolves.toEqual(
      expect.objectContaining({
        shortName: 'East Bayfield Community Centre, Barrie',
        lat: 44.4119,
        lon: -79.6954,
      })
    );
    expect(retryFetchMock).toHaveBeenCalledWith(
      'https://proxy.example.com/api/geocode?q=East+Bayfield+Community+Centre',
      expect.objectContaining({ maxRetries: 2 })
    );
  });

  test('falls back to the proxy for reverse geocoding when local data has no nearby address', async () => {
    const response = makeResponse({
      display_name: 'Barrie City Hall, 70 Collier Street, Barrie, Ontario, Canada',
      lat: '44.3895',
      lon: '-79.6895',
      address: {
        name: 'Barrie City Hall',
        city: 'Barrie',
      },
    });
    const { service, retryFetchMock } = loadLocationService({ retryResponse: response });

    await expect(service.reverseGeocode(44.3895, -79.6895)).resolves.toEqual(
      expect.objectContaining({
        shortName: 'Barrie City Hall, Barrie',
        lat: 44.3895,
        lon: -79.6895,
      })
    );
    expect(retryFetchMock).toHaveBeenCalledWith(
      'https://proxy.example.com/api/reverse-geocode?lat=44.3895&lon=-79.6895',
      expect.objectContaining({ maxRetries: 2 })
    );
  });

  test('surfaces proxy rate limiting as a stable rider-facing autocomplete error', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { service } = loadLocationService({
      retryResponse: makeResponse(null, { ok: false, status: 429 }),
    });

    await expect(service.autocompleteAddress('Library')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Search limit reached, try again in a moment',
    });
    consoleErrorSpy.mockRestore();
  });
});
