jest.mock('../utils/fetchWithCORS', () => ({
  fetchWithCORS: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
  },
}));

const { fetchWithCORS } = require('../utils/fetchWithCORS');
const logger = require('../utils/logger').default;
const { fetchServiceAlerts } = require('../services/alertService');

describe('alertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns no alerts without throwing when the service alerts feed returns 500', async () => {
    fetchWithCORS.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(fetchServiceAlerts()).resolves.toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Service alerts feed unavailable; continuing without alerts:',
      { message: 'HTTP error! status: 500' }
    );
  });

  test('treats a 404 service alerts feed as no active alerts', async () => {
    fetchWithCORS.mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(fetchServiceAlerts()).resolves.toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
