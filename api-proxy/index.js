const { app, PORT, detourWorker, newsWorker } = require('./app');
const { startServer, registerShutdown } = require('./server');
const { createApiProxyFunction } = require('./functions');

const workers = {
  detourWorker,
  newsWorker,
};

module.exports = app;

const apiProxy = createApiProxyFunction(app, workers, process.env);
if (apiProxy) {
  module.exports.apiProxy = apiProxy;
}

if (require.main === module) {
  const server = startServer({
    app,
    port: PORT,
    workers,
  });

  registerShutdown({
    server,
    workers,
  });
}
