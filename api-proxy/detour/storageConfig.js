const V1_DEFAULTS = {
  detourVersion: 'v1',
  activeCollection: 'activeDetours',
  historyCollection: 'detourHistory',
  runtimeStateCollection: 'systemState',
  runtimeStateDoc: 'detourRuntime',
};

const V2_DEFAULTS = {
  detourVersion: 'v2',
  activeCollection: 'activeDetourEventsV2',
  historyCollection: 'detourEventHistoryV2',
  runtimeStateCollection: 'systemState',
  runtimeStateDoc: 'detourRuntimeV2',
};

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function versionFromEnv(env = process.env) {
  return clean(env.DETOUR_DETECTOR_VERSION).toLowerCase() === 'v2' ? 'v2' : 'v1';
}

function buildDetourStorageConfig(env = process.env) {
  const defaults = versionFromEnv(env) === 'v2' ? V2_DEFAULTS : V1_DEFAULTS;

  return {
    detourVersion: defaults.detourVersion,
    activeCollection: clean(env.DETOUR_ACTIVE_COLLECTION) || defaults.activeCollection,
    historyCollection: clean(env.DETOUR_HISTORY_COLLECTION) || defaults.historyCollection,
    runtimeStateCollection:
      clean(env.DETOUR_RUNTIME_STATE_COLLECTION) || defaults.runtimeStateCollection,
    runtimeStateDoc: clean(env.DETOUR_RUNTIME_STATE_DOC) || defaults.runtimeStateDoc,
  };
}

function resolveDetourStorageConfig(storageConfig = null, env = process.env) {
  const defaults = buildDetourStorageConfig(env);
  const source = storageConfig && typeof storageConfig === 'object' ? storageConfig : {};

  return {
    detourVersion: clean(source.detourVersion) || defaults.detourVersion,
    activeCollection: clean(source.activeCollection) || defaults.activeCollection,
    historyCollection: clean(source.historyCollection) || defaults.historyCollection,
    runtimeStateCollection:
      clean(source.runtimeStateCollection) || defaults.runtimeStateCollection,
    runtimeStateDoc: clean(source.runtimeStateDoc) || defaults.runtimeStateDoc,
  };
}

module.exports = {
  buildDetourStorageConfig,
  resolveDetourStorageConfig,
};
