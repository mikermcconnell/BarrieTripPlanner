function registerNewsRoutes(app, { newsWorker }) {
  app.get('/api/news-status', (_req, res) => {
    if (!newsWorker) {
      return res.json({ enabled: false });
    }

    return res.json({ enabled: true, ...newsWorker.getStatus() });
  });
}

module.exports = {
  registerNewsRoutes,
};
