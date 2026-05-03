const { startWorkers, stopWorkers } = require('./runtime/workers');

function startServer({ app, port, workers = {} }) {
  return app.listen(port, () => {
    console.log(`API proxy running on port ${port}`);
    startWorkers(workers);
  });
}

function registerShutdown({ server, workers = {} }) {
  process.on('SIGTERM', () => {
    console.log('SIGTERM received — shutting down');
    stopWorkers(workers);
    if (server) {
      server.close();
    }
    process.exit(0);
  });
}

module.exports = {
  startServer,
  registerShutdown,
};
