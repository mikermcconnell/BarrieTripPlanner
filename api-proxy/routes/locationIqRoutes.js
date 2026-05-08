function registerLocationIqRoutes(app, {
  proxyRequest,
  normalizeQuery,
  parseLatLon,
  validateLatitude,
  validateLongitude,
  parseCoordinatePair,
  barrieBounds,
}) {
  app.get('/api/autocomplete', (req, res) => {
    let query;
    try {
      query = normalizeQuery(req.query.q);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const params = new URLSearchParams({
      q: query,
      addressdetails: '1',
      limit: '5',
      countrycodes: 'ca',
      viewbox: barrieBounds,
      bounded: '1',
    });

    return proxyRequest('autocomplete', params, res);
  });

  app.get('/api/geocode', (req, res) => {
    let query;
    try {
      query = normalizeQuery(req.query.q);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const params = new URLSearchParams({
      q: query,
      addressdetails: '1',
      limit: '1',
      countrycodes: 'ca',
      viewbox: barrieBounds,
      bounded: '1',
    });

    return proxyRequest('search', params, res);
  });

  app.get('/api/reverse-geocode', (req, res) => {
    if (req.query.lat == null || req.query.lon == null) {
      return res.status(400).json({ error: 'Parameters "lat" and "lon" are required' });
    }

    let lat;
    let lon;
    try {
      lat = parseLatLon(req.query.lat, 'lat');
      lon = parseLatLon(req.query.lon, 'lon');
      validateLatitude(lat, 'lat');
      validateLongitude(lon, 'lon');
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      addressdetails: '1',
    });

    return proxyRequest('reverse', params, res);
  });

  app.get('/api/walking-directions', (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({
        error: 'Parameters "from" and "to" are required (format: lat,lon)',
      });
    }

    let fromCoord;
    let toCoord;
    try {
      fromCoord = parseCoordinatePair(from, 'from');
      toCoord = parseCoordinatePair(to, 'to');
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const coords = `${fromCoord.lon},${fromCoord.lat};${toCoord.lon},${toCoord.lat}`;
    const params = new URLSearchParams({
      steps: 'true',
      overview: 'full',
      geometries: 'polyline',
    });

    return proxyRequest(`directions/walking/${coords}`, params, res, { includeFormat: false });
  });
}

module.exports = {
  registerLocationIqRoutes,
};
