const {
  buildProxyConfig,
  validateProxyConfig,
} = require('../config/env');

describe('proxy environment validation', () => {
  test('allows Firebase Functions discovery without runtime auth env', () => {
    const env = {
      FUNCTIONS_CONTROL_API: 'true',
    };

    expect(() => validateProxyConfig(buildProxyConfig(env), env)).not.toThrow();
  });
});
