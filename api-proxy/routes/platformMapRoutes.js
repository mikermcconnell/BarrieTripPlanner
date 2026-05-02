const { createPlatformMapImageService } = require('../services/platformMapImageService');

function registerPlatformMapRoutes(app, {
  platformMapImageService = createPlatformMapImageService(),
} = {}) {
  app.get('/api/platform-maps/:hubId', async (req, res) => {
    const result = await platformMapImageService.getPlatformMapImage(req.params.hubId);

    if (result.contentType && Buffer.isBuffer(result.body)) {
      res.set('Content-Type', result.contentType);
      res.set('Cache-Control', result.stale ? 'public, max-age=300' : 'public, max-age=86400');
      res.set('X-Platform-Map-Hub', result.hubId);
      res.set('X-Platform-Map-Page', String(result.pageNumber));
      res.set('X-Platform-Map-Cache', result.fromCache ? 'hit' : 'miss');
      if (result.stale) res.set('X-Platform-Map-Stale', 'true');
      return res.status(result.status).send(result.body);
    }

    return res.status(result.status || 500).json(result.body || { error: 'Platform map unavailable' });
  });
}

module.exports = {
  registerPlatformMapRoutes,
};
