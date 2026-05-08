function createLocationIqProxy({ hasLocationIQKey, apiKey, baseUrl }) {
  return async function proxyRequest(apiPath, params, res, options = {}) {
    if (!hasLocationIQKey) {
      return res.status(503).json({ error: 'LocationIQ proxy is not configured' });
    }

    params.set('key', apiKey);
    if (options.includeFormat !== false) {
      params.set('format', 'json');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(`${baseUrl}/${apiPath}?${params}`, {
          signal: controller.signal,
          headers: { 'User-Agent': 'BarrieTransitProxy/1.0' },
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const raw = await response.text();
      let data = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (_error) {
          data = null;
        }
      }

      if (!response.ok) {
        return res.status(response.status).json({
          error: data?.error || `LocationIQ returned ${response.status}`,
        });
      }

      if (data == null) {
        return res.status(502).json({ error: 'Invalid upstream response' });
      }

      return res.json(data);
    } catch (error) {
      if (error.name === 'AbortError') {
        return res.status(504).json({ error: 'Upstream request timed out' });
      }
      console.error(`Proxy error [${apiPath}]:`, error.message);
      return res.status(502).json({ error: 'Upstream service unavailable' });
    }
  };
}

module.exports = {
  createLocationIqProxy,
};
