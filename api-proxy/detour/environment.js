const fs = require('fs');

const PRODUCTION_PROJECT_ID = 'barrie-transit-trip-plan-cc84e';
const PRODUCTION_STORAGE = Object.freeze({
  detectorVersion: 'v2',
  activeCollection: 'activeDetourEventsV2',
  historyCollection: 'detourEventHistoryV2',
  runtimeStateCollection: 'systemState',
  runtimeStateDoc: 'detourRuntimeV2',
});

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseJsonProjectId(value) {
  if (!clean(value)) return '';
  try {
    const parsed = JSON.parse(value);
    return clean(parsed.project_id || parsed.projectId);
  } catch (_error) {
    return '';
  }
}

function readCredentialProjectId(filePath) {
  const resolved = clean(filePath);
  if (!resolved || !fs.existsSync(resolved)) return '';
  try {
    return parseJsonProjectId(fs.readFileSync(resolved, 'utf8'));
  } catch (_error) {
    return '';
  }
}

function resolveFirebaseProjectId(env = process.env) {
  return clean(
    env.GCLOUD_PROJECT ||
    env.GOOGLE_CLOUD_PROJECT ||
    parseJsonProjectId(env.FIREBASE_CONFIG) ||
    parseJsonProjectId(env.FIREBASE_SERVICE_ACCOUNT_JSON) ||
    readCredentialProjectId(env.GOOGLE_APPLICATION_CREDENTIALS)
  );
}

function resolveDetourDataEnvironment(env = process.env) {
  return clean(env.DETOUR_DATA_ENVIRONMENT).toLowerCase();
}

function buildDetourWriterMetadata(env = process.env, storageConfig = {}) {
  const dataEnvironment = resolveDetourDataEnvironment(env) || 'unclassified';
  const writerId = clean(
    env.DETOUR_WRITER_ID ||
    env.K_REVISION ||
    env.HOSTNAME ||
    env.COMPUTERNAME
  ) || 'unknown-writer';

  return {
    writerEnvironment: dataEnvironment,
    writerId,
    writerProjectId: resolveFirebaseProjectId(env) || null,
    writerMode: clean(env.DETOUR_WORKER_MODE || 'interval').toLowerCase(),
    writerDetectorVersion: clean(storageConfig.detourVersion || env.DETOUR_DETECTOR_VERSION || 'v2').toLowerCase(),
    writerActiveCollection: clean(storageConfig.activeCollection || env.DETOUR_ACTIVE_COLLECTION) || null,
    writerHistoryCollection: clean(storageConfig.historyCollection || env.DETOUR_HISTORY_COLLECTION) || null,
  };
}

function validateDetourWorkerEnvironment(env = process.env, storageConfig = {}) {
  if (String(env.DETOUR_WORKER_ENABLED || '').toLowerCase() !== 'true') {
    return { enabled: false };
  }
  if (env.NODE_ENV === 'test' && env.DETOUR_VALIDATE_TEST_ENVIRONMENT !== 'true') {
    return { enabled: true, skipped: true, reason: 'test-environment' };
  }

  const dataEnvironment = resolveDetourDataEnvironment(env);
  if (!['production', 'development', 'simulation'].includes(dataEnvironment)) {
    throw new Error(
      'Detour worker data environment is not classified. Set DETOUR_DATA_ENVIRONMENT to production, development, or simulation.'
    );
  }

  const resolved = {
    detourVersion: clean(storageConfig.detourVersion || env.DETOUR_DETECTOR_VERSION || 'v2').toLowerCase(),
    activeCollection: clean(storageConfig.activeCollection || env.DETOUR_ACTIVE_COLLECTION || PRODUCTION_STORAGE.activeCollection),
    historyCollection: clean(storageConfig.historyCollection || env.DETOUR_HISTORY_COLLECTION || PRODUCTION_STORAGE.historyCollection),
    runtimeStateCollection: clean(
      storageConfig.runtimeStateCollection || env.DETOUR_RUNTIME_STATE_COLLECTION || PRODUCTION_STORAGE.runtimeStateCollection
    ),
    runtimeStateDoc: clean(storageConfig.runtimeStateDoc || env.DETOUR_RUNTIME_STATE_DOC || PRODUCTION_STORAGE.runtimeStateDoc),
  };
  const isCloudProduction = env.NODE_ENV === 'production' || Boolean(env.K_SERVICE);

  if (isCloudProduction && dataEnvironment !== 'production') {
    throw new Error('Cloud detour workers must use DETOUR_DATA_ENVIRONMENT=production.');
  }

  if (dataEnvironment === 'production') {
    for (const [key, expected] of Object.entries(PRODUCTION_STORAGE)) {
      const actualKey = key === 'detectorVersion' ? 'detourVersion' : key;
      if (resolved[actualKey] !== expected) {
        throw new Error(
          `Production detour storage must use ${actualKey}=${expected}; received ${resolved[actualKey] || 'empty'}.`
        );
      }
    }
  } else {
    const collisions = [
      ['activeCollection', PRODUCTION_STORAGE.activeCollection],
      ['historyCollection', PRODUCTION_STORAGE.historyCollection],
      ['runtimeStateCollection', PRODUCTION_STORAGE.runtimeStateCollection],
      ['runtimeStateDoc', PRODUCTION_STORAGE.runtimeStateDoc],
    ].filter(([key, productionValue]) => resolved[key] === productionValue);
    if (collisions.length > 0) {
      throw new Error(
        `Non-production detour worker cannot target production storage: ${collisions.map(([key]) => key).join(', ')}. ` +
        'Use isolated dev/simulation collections and runtime state.'
      );
    }
  }

  return {
    enabled: true,
    dataEnvironment,
    projectId: resolveFirebaseProjectId(env) || null,
    productionProjectId: clean(env.DETOUR_PRODUCTION_FIREBASE_PROJECT_ID) || PRODUCTION_PROJECT_ID,
    storage: resolved,
  };
}

module.exports = {
  PRODUCTION_PROJECT_ID,
  PRODUCTION_STORAGE,
  buildDetourWriterMetadata,
  resolveDetourDataEnvironment,
  resolveFirebaseProjectId,
  validateDetourWorkerEnvironment,
};
