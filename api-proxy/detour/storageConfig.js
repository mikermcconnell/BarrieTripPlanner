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
  const version = clean(env.DETOUR_DETECTOR_VERSION).toLowerCase();
  if (!version) return 'v2';
  if (version === 'v1' || version === 'v2') return version;
  throw new Error(`Unsupported DETOUR_DETECTOR_VERSION "${version}". Expected "v1" or "v2".`);
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
  const source = storageConfig && typeof storageConfig === 'object' ? storageConfig : {};
  const sourceVersion = clean(source.detourVersion).toLowerCase();
  if (sourceVersion && sourceVersion !== 'v1' && sourceVersion !== 'v2') {
    throw new Error(`Unsupported detourVersion "${sourceVersion}". Expected "v1" or "v2".`);
  }
  const defaults = sourceVersion
    ? buildDetourStorageConfig({ ...env, DETOUR_DETECTOR_VERSION: sourceVersion })
    : buildDetourStorageConfig(env);

  return {
    detourVersion: sourceVersion || defaults.detourVersion,
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
