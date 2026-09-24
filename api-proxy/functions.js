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

function createDetourManagementBriefFunction() {
  const { onSchedule } = require('firebase-functions/v2/scheduler');
  return onSchedule({
    schedule: 'every 5 minutes',
    timeZone: 'America/Toronto',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '512MiB',
    maxInstances: 1,
    secrets: ['RESEND_API_KEY', 'CARTO_BASEMAP_API_KEY', 'DETOUR_ALERT_RECIPIENT', 'DETOUR_ALERT_FROM'],
  }, async () => {
    const { runDetourManagementBrief } = require('./services/detourManagementBrief');
    const result = await runDetourManagementBrief();
    console.log('[detourManagementBrief]', JSON.stringify(result));
  });
}

module.exports = {
  createApiProxyFunction,
  createDetourManagementBriefFunction,
};
