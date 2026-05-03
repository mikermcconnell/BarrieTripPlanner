const express = require('express');
const request = require('supertest');
const { registerPlatformMapRoutes } = require('../routes/platformMapRoutes');

describe('platformMapRoutes', () => {
  test('returns a PNG image for a valid hub', async () => {
    const app = express();
    const getPlatformMapImage = jest.fn().mockResolvedValue({
      status: 200,
      body: Buffer.from('png-bytes'),
      contentType: 'image/png',
      hubId: 'georgian-college',
      pageNumber: 5,
      fromCache: false,
      stale: false,
    });

    registerPlatformMapRoutes(app, { platformMapImageService: { getPlatformMapImage } });

    const response = await request(app).get('/api/platform-maps/georgian-college');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/image\/png/);
    expect(response.headers['cache-control']).toContain('public');
    expect(response.headers['x-platform-map-hub']).toBe('georgian-college');
    expect(response.headers['x-platform-map-page']).toBe('5');
    expect(response.body.toString()).toBe('png-bytes');
    expect(getPlatformMapImage).toHaveBeenCalledWith('georgian-college');
  });

  test('returns 404 JSON for an unknown hub', async () => {
    const app = express();
    registerPlatformMapRoutes(app, {
      platformMapImageService: {
        getPlatformMapImage: jest.fn().mockResolvedValue({
          status: 404,
          body: { error: 'Unknown platform map' },
        }),
      },
    });

    const response = await request(app).get('/api/platform-maps/not-real');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Unknown platform map' });
  });
});
