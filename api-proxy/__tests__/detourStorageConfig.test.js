const { buildDetourStorageConfig } = require('../detour/storageConfig');

describe('detour storage config', () => {
  test('defaults to V1 collection and runtime names', () => {
    expect(buildDetourStorageConfig({})).toEqual({
      detourVersion: 'v1',
      activeCollection: 'activeDetours',
      historyCollection: 'detourHistory',
      runtimeStateCollection: 'systemState',
      runtimeStateDoc: 'detourRuntime',
    });
  });

  test('uses isolated V2 collection and runtime names', () => {
    expect(buildDetourStorageConfig({ DETOUR_DETECTOR_VERSION: 'v2' })).toEqual({
      detourVersion: 'v2',
      activeCollection: 'activeDetourEventsV2',
      historyCollection: 'detourEventHistoryV2',
      runtimeStateCollection: 'systemState',
      runtimeStateDoc: 'detourRuntimeV2',
    });
  });

  test('allows explicit collection and runtime overrides', () => {
    expect(buildDetourStorageConfig({
      DETOUR_ACTIVE_COLLECTION: 'labActive',
      DETOUR_HISTORY_COLLECTION: 'labHistory',
      DETOUR_RUNTIME_STATE_COLLECTION: 'labState',
      DETOUR_RUNTIME_STATE_DOC: 'labRuntime',
    })).toEqual({
      detourVersion: 'v1',
      activeCollection: 'labActive',
      historyCollection: 'labHistory',
      runtimeStateCollection: 'labState',
      runtimeStateDoc: 'labRuntime',
    });
  });
});
