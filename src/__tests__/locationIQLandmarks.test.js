jest.mock('../services/localGeocodingService', () => ({
  initLocalGeocoding: jest.fn(async () => false),
  isLocalDataReady: jest.fn(() => false),
  localReverseGeocode: jest.fn(() => null),
  localAutocomplete: jest.fn(() => []),
  matchesLocalStreet: jest.fn(() => false),
}));

jest.mock('../utils/retryFetch', () => ({
  retryFetch: jest.fn(),
}));

jest.mock('../services/proxyAuth', () => ({
  getApiProxyRequestOptions: jest.fn(async () => ({})),
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import { retryFetch } from '../utils/retryFetch';
import { autocompleteAddress, geocodeAddress } from '../services/locationIQService';

describe('LocationIQ service local landmark integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns an exact local alias without calling the remote provider', async () => {
    const results = await autocompleteAddress('RVH');

    expect(results[0]).toMatchObject({
      shortName: 'RVH',
      source: 'local_landmark',
      landmarkId: 'hub-rvh',
    });
    expect(retryFetch).not.toHaveBeenCalled();
  });

  test('supports two-character local abbreviations without a remote call', async () => {
    const results = await autocompleteAddress('GO');

    expect(results.some((result) => result.shortName === 'Allandale Waterfront GO')).toBe(true);
    expect(results.some((result) => result.shortName === 'Barrie South GO')).toBe(true);
    expect(retryFetch).not.toHaveBeenCalled();
  });

  test('forward geocodes a landmark alias locally', async () => {
    await expect(geocodeAddress('BMC')).resolves.toMatchObject({
      shortName: 'Sadlon Arena',
      source: 'local_landmark',
      lat: 44.33769,
      lon: -79.67772,
    });
    expect(retryFetch).not.toHaveBeenCalled();
  });
});
