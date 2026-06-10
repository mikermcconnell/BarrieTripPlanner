const { buildBaselineDivergence, getShapeCoordinateSignature } = require('./baselineDivergence');

const DEFAULT_STABILITY_MS = 30 * 60 * 1000;
const pendingRoutes = new Map();

function isEnabled() {
  return process.env.BASELINE_AUTO_UPDATE_ENABLED !== 'false';
}

function getStabilityMs() {
  const parsed = Number.parseInt(process.env.BASELINE_AUTO_UPDATE_STABILITY_MS || '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_STABILITY_MS;
}

function normalizeRouteId(routeId) {
  return String(routeId || '').trim();
}

function getMapValue(collection, key) {
  if (!collection) return undefined;
  if (typeof collection.get === 'function') return collection.get(key);
  return collection[key];
}

function routeShapeSignature(data = {}, routeId) {
  const shapeIds = getMapValue(data.routeShapeMapping, routeId) || [];
  return (Array.isArray(shapeIds) ? shapeIds : [])
    .map((shapeId) => {
      const shape = getMapValue(data.shapes, shapeId);
      const signature = getShapeCoordinateSignature(shape);
      return signature || '';
    })
    .filter(Boolean)
    .sort()
    .join('||');
}

function getChangedRouteIds(baselineDivergence = {}) {
  return [...new Set((baselineDivergence.changedRouteIds || []).map(normalizeRouteId).filter(Boolean))]
    .sort();
}

function buildDivergence(baselineData, liveData) {
  return buildBaselineDivergence({
    baselineShapes: baselineData?.shapes,
    baselineRouteShapeMapping: baselineData?.routeShapeMapping,
    liveShapes: liveData?.shapes,
    liveRouteShapeMapping: liveData?.routeShapeMapping,
  });
}

async function evaluateBaselineAutoUpdate({
  baselineDivergence,
  baselineData,
  liveData,
  forceRefresh,
  getStaticData,
  setBaselineRoutes,
  nowMs = Date.now(),
} = {}) {
  if (!isEnabled()) {
    return {
      baselineDivergence,
      pendingRouteIds: [],
      autoUpdatedRouteIds: [],
      liveData,
    };
  }

  const changedRouteIds = getChangedRouteIds(baselineDivergence);
  const changedRouteSet = new Set(changedRouteIds);
  for (const routeId of [...pendingRoutes.keys()]) {
    if (!changedRouteSet.has(routeId)) pendingRoutes.delete(routeId);
  }

  if (changedRouteIds.length === 0) {
    return {
      baselineDivergence,
      pendingRouteIds: [],
      autoUpdatedRouteIds: [],
      liveData,
    };
  }

  const stabilityMs = getStabilityMs();
  const dueRouteIds = [];

  for (const routeId of changedRouteIds) {
    const signature = routeShapeSignature(liveData, routeId);
    if (!signature) continue;

    const pending = pendingRoutes.get(routeId);
    if (!pending || pending.signature !== signature) {
      pendingRoutes.set(routeId, {
        signature,
        firstSeenAt: nowMs,
        dueAt: nowMs + stabilityMs,
      });
    }

    const current = pendingRoutes.get(routeId);
    if (current && nowMs >= current.dueAt) {
      dueRouteIds.push(routeId);
    }
  }

  let refreshedLiveData = liveData;
  let refreshedDivergence = baselineDivergence;
  const autoUpdatedRouteIds = [];

  if (dueRouteIds.length > 0 && typeof forceRefresh === 'function' && typeof setBaselineRoutes === 'function') {
    await forceRefresh();
    refreshedLiveData = typeof getStaticData === 'function' ? await getStaticData() : liveData;
    refreshedDivergence = buildDivergence(baselineData, refreshedLiveData);
    const refreshedChangedRouteIds = new Set(getChangedRouteIds(refreshedDivergence));

    for (const routeId of dueRouteIds) {
      const pending = pendingRoutes.get(routeId);
      const refreshedSignature = routeShapeSignature(refreshedLiveData, routeId);
      if (!refreshedChangedRouteIds.has(routeId)) {
        pendingRoutes.delete(routeId);
        continue;
      }
      if (pending?.signature && pending.signature === refreshedSignature) {
        autoUpdatedRouteIds.push(routeId);
      } else if (refreshedSignature) {
        pendingRoutes.set(routeId, {
          signature: refreshedSignature,
          firstSeenAt: nowMs,
          dueAt: nowMs + stabilityMs,
        });
      }
    }

    if (autoUpdatedRouteIds.length > 0) {
      await setBaselineRoutes(refreshedLiveData, autoUpdatedRouteIds, { source: 'auto-gtfs-refresh' });
      autoUpdatedRouteIds.forEach((routeId) => pendingRoutes.delete(routeId));
    }
  }

  const autoUpdatedSet = new Set(autoUpdatedRouteIds);
  const pendingRouteIds = getChangedRouteIds(refreshedDivergence)
    .filter((routeId) => !autoUpdatedSet.has(routeId) && pendingRoutes.has(routeId))
    .sort();

  return {
    baselineDivergence: refreshedDivergence,
    pendingRouteIds,
    autoUpdatedRouteIds: autoUpdatedRouteIds.sort(),
    liveData: refreshedLiveData,
  };
}

function resetBaselineAutoUpdaterForTests() {
  pendingRoutes.clear();
}

module.exports = {
  evaluateBaselineAutoUpdate,
  routeShapeSignature,
  resetBaselineAutoUpdaterForTests,
};
