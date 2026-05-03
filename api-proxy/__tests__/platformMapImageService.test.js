const { createPlatformMapImageService } = require('../services/platformMapImageService');

describe('platformMapImageService', () => {
  test('renders and caches a known hub page', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('pdf-bytes'),
    });
    const renderPageToPng = jest.fn().mockResolvedValue(Buffer.from('png-bytes'));
    const now = jest.fn().mockReturnValue(1000);
    const service = createPlatformMapImageService({ fetchImpl, renderPageToPng, now, cacheTtlMs: 60_000 });

    const first = await service.getPlatformMapImage('georgian-college');
    const second = await service.getPlatformMapImage('georgian-college');

    expect(first).toEqual(expect.objectContaining({
      status: 200,
      contentType: 'image/png',
      hubId: 'georgian-college',
      pageNumber: 5,
      fromCache: false,
    }));
    expect(first.body.toString()).toBe('png-bytes');
    expect(second.fromCache).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(renderPageToPng).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), 5);
  });

  test('returns 404 for an unknown hub', async () => {
    const service = createPlatformMapImageService({
      fetchImpl: jest.fn(),
      renderPageToPng: jest.fn(),
    });

    const result = await service.getPlatformMapImage('not-real');

    expect(result).toEqual({
      status: 404,
      body: { error: 'Unknown platform map' },
    });
  });

  test('serves stale cache when source PDF fetch fails', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('pdf-bytes') })
      .mockResolvedValueOnce({ ok: false, status: 503, arrayBuffer: async () => Buffer.alloc(0) });
    const renderPageToPng = jest.fn().mockResolvedValue(Buffer.from('cached-png'));
    let currentTime = 1000;
    const service = createPlatformMapImageService({
      fetchImpl,
      renderPageToPng,
      now: () => currentTime,
      cacheTtlMs: 10,
    });

    await service.getPlatformMapImage('downtown-hub');
    currentTime = 5000;
    const result = await service.getPlatformMapImage('downtown-hub');

    expect(result.status).toBe(200);
    expect(result.fromCache).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.body.toString()).toBe('cached-png');
  });

  test('returns 502 when source PDF fetch fails and no cache exists', async () => {
    const service = createPlatformMapImageService({
      fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 503, arrayBuffer: async () => Buffer.alloc(0) }),
      renderPageToPng: jest.fn(),
    });

    const result = await service.getPlatformMapImage('park-place-terminal');

    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: 'Platform map source is unavailable' });
  });
});
