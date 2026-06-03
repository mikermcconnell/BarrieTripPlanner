const {
  getBaselineData,
  setBaseline,
  setBaselineRoutes,
  clearBaseline,
  getBaselineStatus,
} = require('../baselineManager');
const { buildBaselineDivergence: compareBaselineDivergence } = require('../baselineDivergence');

async function buildBaselineDivergence(status) {
  if (!status.loaded) {
    return null;
  }

  try {
    const { getStaticData } = require('../gtfsLoader');
    const liveData = await getStaticData();
    const baseline = await getBaselineData(liveData);
    return compareBaselineDivergence({
      baselineShapes: baseline.shapes,
      baselineRouteShapeMapping: baseline.routeShapeMapping,
      liveShapes: liveData.shapes,
      liveRouteShapeMapping: liveData.routeShapeMapping,
    });
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
