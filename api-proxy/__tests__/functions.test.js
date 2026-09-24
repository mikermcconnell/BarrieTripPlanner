const { createApiProxyFunction, createDetourManagementBriefFunction } = require('../functions');

describe('Firebase function deployment options', () => {
  test('uses the lower Gen 1 CPU tier for the API proxy function', () => {
    const handler = jest.fn();
    const apiProxy = createApiProxyFunction(handler, {}, {
      NODE_ENV: 'production',
      LOCATIONIQ_API_KEY: 'test-key',
    });

    expect(apiProxy.__endpoint).toMatchObject({
      cpu: 'gcf_gen1',
      availableMemoryMb: 512,
      timeoutSeconds: 120,
      minInstances: 0,
      maxInstances: 3,
    });
  });

  test('schedules the brief every five minutes with its required secrets', () => {
    const endpoint = createDetourManagementBriefFunction().__endpoint;
    expect(endpoint.scheduleTrigger).toMatchObject({ schedule: 'every 5 minutes', timeZone: 'America/Toronto' });
    expect(endpoint.maxInstances).toBe(1);
    expect(endpoint.secretEnvironmentVariables.map((item) => item.key)).toEqual([
      'RESEND_API_KEY', 'CARTO_BASEMAP_API_KEY', 'DETOUR_ALERT_RECIPIENT', 'DETOUR_ALERT_FROM',
    ]);
  });
});
