const {
  getBaselineData,
  setBaseline,
  setBaselineRoutes,
  clearBaseline,
  getBaselineStatus,
} = require('../baselineManager');

async function buildBaselineDivergence(status) {
  if (!status.loaded) {
    return null;
  }

  try {
    const { getStaticData } = require('../gtfsLoader');
    const liveData = await getStaticData();
    const baselineMapping = (await getBaselineData(liveData)).routeShapeMapping;
    const liveMapping = liveData.routeShapeMapping;

    const added = [];
    const removed = [];

    for (const [routeId, liveShapeIds] of liveMapping) {
      const baseIds = baselineMapping.get(routeId);
      if (!baseIds) {
        added.push({ routeId, shapeCount: liveShapeIds.length });
        continue;
      }

      const baseSet = new Set(baseIds);
      const liveSet = new Set(liveShapeIds);
      const addedShapes = liveShapeIds.filter((id) => !baseSet.has(id));
      const removedShapes = baseIds.filter((id) => !liveSet.has(id));

      if (addedShapes.length > 0) added.push({ routeId, shapes: addedShapes });
      if (removedShapes.length > 0) removed.push({ routeId, shapes: removedShapes });
    }

    for (const routeId of baselineMapping.keys()) {
      if (!liveMapping.has(routeId)) {
        removed.push({ routeId, note: 'route removed from live' });
      }
    }

    return {
      hasChanges: added.length > 0 || removed.length > 0,
      added,
      removed,
    };
  } catch (_err) {
    return { error: 'Could not load live GTFS for comparison' };
  }
}

async function getBaselineStatusWithDivergence() {
  const status = getBaselineStatus();
  const divergence = await buildBaselineDivergence(status);
  return { ...status, divergence };
}

async function setBaselineFromLiveGtfs() {
  const { getStaticData, forceRefresh } = require('../gtfsLoader');
  await forceRefresh();
  const liveData = await getStaticData();
  await setBaseline(liveData, { source: 'manual-live' });
  const status = getBaselineStatus();
  return { ok: true, message: 'Baseline set from current GTFS', ...status };
}

async function setRouteBaselinesFromLiveGtfs(routeIds) {
  const { getStaticData, forceRefresh } = require('../gtfsLoader');
  await forceRefresh();
  const liveData = await getStaticData();
  await setBaselineRoutes(liveData, routeIds, { source: 'manual-route-update' });
  const status = getBaselineStatus();
  return {
    ok: true,
    message: 'Selected route baselines updated from current GTFS',
    updatedRoutes: routeIds,
    ...status,
  };
}

async function clearCurrentBaseline() {
  await clearBaseline();
  return {
    ok: true,
    message: 'Baseline cleared. Detour detection will remain unsafe until a trusted baseline is set.',
  };
}

module.exports = {
  buildBaselineDivergence,
  getBaselineStatusWithDivergence,
  setBaselineFromLiveGtfs,
  setRouteBaselinesFromLiveGtfs,
  clearCurrentBaseline,
};
