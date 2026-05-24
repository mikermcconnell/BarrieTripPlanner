const { startServer, registerShutdown } = require('./server');
const { createApiProxyFunction } = require('./functions');
const {
  buildProxyConfig,
  loadProxyEnvFiles,
  validateProxyConfig,
} = require('./config/env');

loadProxyEnvFiles(__dirname);
validateProxyConfig(buildProxyConfig(process.env), process.env);

let appBundle = null;

function loadAppBundle() {
  if (!appBundle) {
    appBundle = require('./app');
  }
  return appBundle;
}

function appHandler(req, res) {
  return loadAppBundle().app(req, res);
}

module.exports = appHandler;

const apiProxy = createApiProxyFunction(appHandler, {}, process.env);
if (apiProxy) {
  module.exports.apiProxy = apiProxy;
}

if (require.main === module) {
  const { app, PORT, detourWorker, newsWorker } = loadAppBundle();
  const workers = {
    detourWorker,
    newsWorker,
  };

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
