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
        timeoutSeconds: 120,
        memory: '512MiB',
        // Gen 2 Firebase functions default to 1 full CPU below 2GiB memory.
        // The proxy/detour workload is mostly I/O and scheduler wait time, so
        // use the lower Gen 1 CPU tier to reduce billed compute.
        cpu: 'gcf_gen1',
        minInstances: 0,
        // Fractional-CPU functions can be unavailable to concurrent requests
        // while a long scheduled burst is running. Keep scale bounded, but
        // allow enough headroom for health/client requests during detour ticks.
        maxInstances: 3,
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
