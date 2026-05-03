const { maybeStartCloudWorkers } = require('./runtime/workers');

function createApiProxyFunction(app, workers = {}, env = process.env) {
  try {
    const { onRequest } = require('firebase-functions/v2/https');

    maybeStartCloudWorkers(workers, env);
    const invoker = env.API_PROXY_FUNCTION_INVOKER ||
      (env.NODE_ENV === 'production' ? 'private' : 'public');

    return onRequest(
      {
        region: 'us-central1',
        invoker,
        secrets: ['LOCATIONIQ_API_KEY'],
        timeoutSeconds: 60,
        memory: '512MiB',
        minInstances: 0,
      },
      app
    );
  } catch (_error) {
    return null;
  }
}

module.exports = {
  createApiProxyFunction,
};
