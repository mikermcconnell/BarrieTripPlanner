const { startServer, registerShutdown } = require('./server');
const { createApiProxyFunction, createDetourManagementBriefFunction } = require('./functions');
const { loadProxyEnvFiles } = require('./config/env');

loadProxyEnvFiles(__dirname);
// createApiProxyApp validates proxy auth when that app is loaded. The scheduled
// management brief has no proxy endpoints and must not require proxy auth env.

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
module.exports.detourManagementBrief = createDetourManagementBriefFunction();

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
