jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../services/locationIQService', () => ({
  geocodeAddress: jest.fn(),
  reverseGeocode: jest.fn(),
}));

const {
  planTrip,
  TRIP_ERROR_CODES,
  formatDuration,
  formatDistance,
  formatMinutes,
} = require('../services/tripService');

describe('tripService configuration and format helpers', () => {
  test('cancellation remains connected while the OTP response body is loading', async () => {
    const { OTP_CONFIG } = require('../config/constants');
    const previousUrl = OTP_CONFIG.BASE_URL;
    const previousFetch = global.fetch;
    let startedBody;
    const bodyStarted = new Promise(resolve => { startedBody = resolve; });
    let requestSignal;
    OTP_CONFIG.BASE_URL = 'https://otp.test';
    global.fetch = jest.fn(async (_url, options) => {
      requestSignal = options.signal;
      return { ok: true, json: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true });
        startedBody();
      }) };
    });
    try {
      const controller = new AbortController();
      const operation = planTrip({ fromLat: 44.30, fromLon: -79.80, toLat: 44.49, toLon: -79.56, signal: controller.signal });
      const assertion = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      await bodyStarted;
      controller.abort();
      await assertion;
      expect(requestSignal.aborted).toBe(true);
    } finally {
      OTP_CONFIG.BASE_URL = previousUrl;
      global.fetch = previousFetch;
    }
  });

  test('fails fast when OTP backend URL is not configured', async () => {
    await expect(
      planTrip({
        fromLat: 44.30,
        fromLon: -79.80,
        toLat: 44.49,
        toLon: -79.56,
      })
    ).rejects.toMatchObject({
      code: TRIP_ERROR_CODES.OTP_UNAVAILABLE,
      message: 'Trip planning backend is not configured',
    });
  });

  test('formats durations and distances defensively', () => {
    expect(formatMinutes(90)).toBe('1 hr 30 min');
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(3600)).toBe('1 hr');
    expect(formatDistance(250)).toBe('250m');
    expect(formatDistance(1500)).toBe('1.5km');
    expect(formatDistance(-1)).toBe('0m');
  });
});
