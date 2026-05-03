/**
 * API Proxy app bootstrap.
 *
 * Runtime-specific startup lives in index.js/server.js/functions.js.
 * createApp.js owns Express construction so tests and deployments can build
 * the app with explicit config/dependencies.
 */

const { loadProxyEnvFiles } = require('./config/env');
const { createApiProxyApp } = require('./createApp');

loadProxyEnvFiles(__dirname);

module.exports = createApiProxyApp({ env: process.env });
