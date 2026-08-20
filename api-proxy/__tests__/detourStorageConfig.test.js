const {
  buildDetourStorageConfig,
  resolveDetourStorageConfig,
} = require('../detour/storageConfig');

describe('detour storage config', () => {
  test('defaults to the rider-client V2 collection and runtime names', () => {
    expect(buildDetourStorageConfig({})).toEqual({
      detourVersion: 'v2',
      activeCollection: 'activeDetourEventsV2',
      historyCollection: 'detourEventHistoryV2',
      runtimeStateCollection: 'systemState',
      runtimeStateDoc: 'detourRuntimeV2',
    });
  });

  test('keeps V1 available only when explicitly selected', () => {
    expect(buildDetourStorageConfig({ DETOUR_DETECTOR_VERSION: 'v1' })).toEqual({
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
      DETOUR_DETECTOR_VERSION: 'v1',
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

  test('rejects detector version typos instead of silently selecting another generation', () => {
    expect(() => buildDetourStorageConfig({ DETOUR_DETECTOR_VERSION: 'V22' }))
      .toThrow(/Unsupported DETOUR_DETECTOR_VERSION/);
  });

  test('uses the explicitly requested version defaults when resolving a partial config', () => {
    expect(resolveDetourStorageConfig({ detourVersion: 'v1' }, {})).toEqual({
      detourVersion: 'v1',
      activeCollection: 'activeDetours',
      historyCollection: 'detourHistory',
      runtimeStateCollection: 'systemState',
      runtimeStateDoc: 'detourRuntime',
    });
  });
});
