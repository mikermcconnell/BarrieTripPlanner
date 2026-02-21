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
  test('fails fast when OTP backend URL is not configured', async () => {
    await expect(
      planTrip({
        fromLat: 44.3891,
        fromLon: -79.6903,
        toLat: 44.395,
        toLon: -79.7,
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
