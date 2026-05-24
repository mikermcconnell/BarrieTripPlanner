const { createApiProxyFunction } = require('../functions');

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
});
