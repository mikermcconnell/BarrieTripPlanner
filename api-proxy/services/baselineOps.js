const {
  getBaselineData,
  setBaseline,
  setBaselineRoutes,
  clearBaseline,
  getBaselineStatus,
} = require('../baselineManager');
const { buildBaselineDivergence: compareBaselineDivergence } = require('../baselineDivergence');

async function loadHydratedBaselineComparison() {
  try {
    const { getStaticData } = require('../gtfsLoader');
    const liveData = await getStaticData();
    const baseline = await getBaselineData(liveData);
    return { liveData, baseline, status: getBaselineStatus() };
  } catch (err) {
    return { error: err };
  }
}

async function buildBaselineDivergence(status) {
  const comparison = await loadHydratedBaselineComparison();
  const hydratedStatus = comparison.status || status || getBaselineStatus();
  if (comparison.error) return { error: 'Could not load live GTFS for comparison' };
  if (!hydratedStatus.loaded) return null;
  return compareBaselineDivergence({
    baselineShapes: comparison.baseline.shapes,
    baselineRouteShapeMapping: comparison.baseline.routeShapeMapping,
    liveShapes: comparison.liveData.shapes,
    liveRouteShapeMapping: comparison.liveData.routeShapeMapping,
  });
}

async function getBaselineStatusWithDivergence() {
  const comparison = await loadHydratedBaselineComparison();
  const status = comparison.status || getBaselineStatus();
  const divergence = comparison.error
    ? { error: 'Could not load live GTFS for comparison' }
    : status.loaded
      ? compareBaselineDivergence({
        baselineShapes: comparison.baseline.shapes,
        baselineRouteShapeMapping: comparison.baseline.routeShapeMapping,
        liveShapes: comparison.liveData.shapes,
        liveRouteShapeMapping: comparison.liveData.routeShapeMapping,
      })
      : null;
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
  const result = await setBaselineRoutes(liveData, routeIds, { source: 'manual-route-update' });
  const status = getBaselineStatus();
  return {
    ok: true,
    message: 'Selected route baselines updated from current GTFS',
    updatedRoutes: result?.updatedRouteIds || [],
    removedRoutes: result?.removedRouteIds || [],
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
