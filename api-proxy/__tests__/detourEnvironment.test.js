const {
  buildDetourWriterMetadata,
  validateDetourWorkerEnvironment,
} = require('../detour/environment');
const { buildDetourStorageConfig } = require('../detour/storageConfig');

describe('detour worker environment isolation', () => {
  test('requires an explicit data environment for an enabled worker', () => {
    expect(() => validateDetourWorkerEnvironment({ DETOUR_WORKER_ENABLED: 'true' }))
      .toThrow('data environment is not classified');
  });

  test('accepts the exact V2 production storage contract', () => {
    const env = {
      DETOUR_WORKER_ENABLED: 'true',
      DETOUR_DATA_ENVIRONMENT: 'production',
      DETOUR_DETECTOR_VERSION: 'v2',
      DETOUR_ACTIVE_COLLECTION: 'activeDetourEventsV2',
      DETOUR_HISTORY_COLLECTION: 'detourEventHistoryV2',
      DETOUR_RUNTIME_STATE_COLLECTION: 'systemState',
      DETOUR_RUNTIME_STATE_DOC: 'detourRuntimeV2',
      NODE_ENV: 'production',
    };
    expect(validateDetourWorkerEnvironment(env, buildDetourStorageConfig(env)))
      .toEqual(expect.objectContaining({ enabled: true, dataEnvironment: 'production' }));
  });

  test('blocks a development worker from production collections', () => {
    const env = {
      DETOUR_WORKER_ENABLED: 'true',
      DETOUR_DATA_ENVIRONMENT: 'development',
      DETOUR_DETECTOR_VERSION: 'v2',
    };
    expect(() => validateDetourWorkerEnvironment(env, buildDetourStorageConfig(env)))
      .toThrow('cannot target production storage');
  });

  test('accepts isolated development collections and records writer identity', () => {
    const env = {
      DETOUR_WORKER_ENABLED: 'true',
      DETOUR_DATA_ENVIRONMENT: 'development',
      DETOUR_DETECTOR_VERSION: 'v2',
      DETOUR_ACTIVE_COLLECTION: 'devActiveDetourEventsV2',
      DETOUR_HISTORY_COLLECTION: 'devDetourEventHistoryV2',
      DETOUR_RUNTIME_STATE_COLLECTION: 'devSystemState',
      DETOUR_RUNTIME_STATE_DOC: 'devDetourRuntimeV2',
      DETOUR_WRITER_ID: 'local-test',
      DETOUR_WORKER_MODE: 'interval',
    };
    const storage = buildDetourStorageConfig(env);
    expect(validateDetourWorkerEnvironment(env, storage)).toEqual(expect.objectContaining({
      dataEnvironment: 'development',
      storage: expect.objectContaining({ activeCollection: 'devActiveDetourEventsV2' }),
    }));
    expect(buildDetourWriterMetadata(env, storage)).toEqual(expect.objectContaining({
      writerEnvironment: 'development',
      writerId: 'local-test',
      writerActiveCollection: 'devActiveDetourEventsV2',
    }));
  });
});
