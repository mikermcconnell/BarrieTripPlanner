const { createDetourV2Detector } = require('../api-proxy/detourV2/detector');

function buildReplayMaps(fixture = {}) {
  const route = fixture.baseline || fixture.baselineRoute10;
  const mappingEntries = route?.routeShapeMapping
    ? Object.entries(route.routeShapeMapping)
    : (route?.routeId && Array.isArray(route?.shapeIds) ? [[route.routeId, route.shapeIds]] : []);
  if (!route || !route.shapes || mappingEntries.length === 0) {
    throw new Error('Replay fixture is missing baseline routeId, shapeIds, or shapes');
  }
  return {
    shapes: new Map(Object.entries(route.shapes)),
    routeShapeMapping: new Map(mappingEntries),
  };
}

function summarizeReplay(eventId, detour) {
  const firstSegment = Array.isArray(detour?.geometry?.segments)
    ? detour.geometry.segments[0]
    : null;
  return {
    eventId,
    routeId: detour?.routeId,
    state: detour?.state,
    riderVisible: detour?.riderVisible,
    riderVisibilityReason: detour?.riderVisibilityReason,
    canShowDetourPath: detour?.canShowDetourPath,
    geometryTrustBlockedReason: detour?.geometry?.geometryTrustBlockedReason ?? null,
    segmentReason: firstSegment?.geometryTrustBlockedReason ?? null,
    evidencePointCount: detour?.geometry?.evidencePointCount ?? null,
    currentVehicleCount: detour?.currentVehicleCount ?? null,
    vehicleCount: detour?.vehicleCount ?? null,
    uniqueVehicleCount: detour?.uniqueVehicleCount ?? null,
    startProgressMeters: detour?.geometry?.startProgressMeters ?? null,
    endProgressMeters: detour?.geometry?.endProgressMeters ?? null,
  };
}

function replayDetourV2Fixture(fixture = {}) {
  const { shapes, routeShapeMapping } = buildReplayMaps(fixture);
  const detector = createDetourV2Detector();
  detector.hydrateRuntimeState(fixture.runtimeState || fixture.runtimeRoute10 || {});
  if (fixture.activeDetourEvent) {
    const activeEventId = fixture.activeDetourEvent.eventId || fixture.expected?.eventId;
    detector.hydrateActiveDetourSnapshots({ [activeEventId]: fixture.activeDetourEvent });
  } else if (fixture.activeDetours) {
    detector.hydrateActiveDetourSnapshots(fixture.activeDetours);
  }
  const result = detector.processVehicles([], shapes, routeShapeMapping);
  const eventId = fixture.expected?.eventId || Object.keys(result)[0];
  const detour = result[eventId];
  if (!detour) {
    throw new Error(
      `Expected replay event ${eventId || '(unspecified)'} was not produced. ` +
      `Produced events: ${Object.keys(result).join(', ') || '(none)'}`
    );
  }
  return summarizeReplay(eventId, detour);
}

function normalizeSyntheticVehicle(vehicle = {}, timestampMs) {
  const coordinate = vehicle.coordinate || (
    Number.isFinite(Number(vehicle.latitude)) && Number.isFinite(Number(vehicle.longitude))
      ? { latitude: Number(vehicle.latitude), longitude: Number(vehicle.longitude) }
      : null
  );
  return {
    ...vehicle,
    coordinate,
    timestampMs: Number.isFinite(Number(vehicle.timestampMs))
      ? Number(vehicle.timestampMs)
      : timestampMs,
  };
}

function detoursForRoute(result = {}, routeId) {
  return Object.entries(result)
    .filter(([, detour]) => String(detour?.routeId || '') === String(routeId || ''))
    .map(([eventId, detour]) => ({ eventId, detour }));
}

function hasRenderablePath(detour = {}) {
  const geometry = detour.geometry || {};
  const isPolyline = (value) => Array.isArray(value) && value.length >= 2;
  return detour.canShowDetourPath === true && (
    isPolyline(geometry.likelyDetourPolyline) ||
    isPolyline(geometry.inferredDetourPolyline) ||
    (Array.isArray(geometry.segments) && geometry.segments.some((segment) => (
      isPolyline(segment?.likelyDetourPolyline) ||
      isPolyline(segment?.inferredDetourPolyline)
    )))
  );
}

function replaySyntheticDetourTrace(fixture = {}) {
  if (fixture.synthetic !== true) {
    throw new Error('Synthetic trace fixtures must set synthetic=true');
  }
  const tickMs = Number(fixture.tickMs || 30_000);
  if (tickMs !== 30_000) {
    throw new Error('Synthetic detour traces must use 30-second ticks');
  }
  if (!Array.isArray(fixture.ticks) || fixture.ticks.length === 0) {
    throw new Error('Synthetic trace fixture must contain at least one tick');
  }

  const { shapes, routeShapeMapping } = buildReplayMaps(fixture);
  const startTimeMs = Number(fixture.startTimeMs || Date.parse('2026-07-13T14:00:00Z'));
  let detector = createDetourV2Detector(fixture.detectorConfig || {});
  const timeline = [];
  let restartCount = 0;

  fixture.ticks.forEach((tick, tickIndex) => {
    if (tick?.restart === true) {
      const snapshot = detector.serializeDetectorRuntimeState();
      detector = createDetourV2Detector(fixture.detectorConfig || {});
      detector.hydrateRuntimeState(snapshot);
      restartCount += 1;
    }
    const timestampMs = Number.isFinite(Number(tick?.timestampMs))
      ? Number(tick.timestampMs)
      : startTimeMs + tickIndex * tickMs;
    const vehicles = (Array.isArray(tick?.vehicles) ? tick.vehicles : [])
      .map((vehicle) => normalizeSyntheticVehicle(vehicle, timestampMs));
    const result = detector.processVehicles(
      vehicles,
      shapes,
      routeShapeMapping,
      null,
      fixture.stopImpactData || null
    );
    const routeEntries = detoursForRoute(result, fixture.routeId);
    const visibleEntries = routeEntries.filter(({ detour }) => detour.riderVisible !== false);
    const skippedStopIds = [...new Set(visibleEntries.flatMap(({ detour }) => (
      detour?.geometry?.skippedStopIds || []
    )))];
    timeline.push({
      tick: tickIndex,
      timestampMs,
      vehicleCount: vehicles.length,
      eventCount: routeEntries.length,
      visibleEventCount: visibleEntries.length,
      visible: visibleEntries.length > 0,
      state: routeEntries[0]?.detour?.state || 'absent',
      pathShown: visibleEntries.some(({ detour }) => hasRenderablePath(detour)),
      skippedStopIds,
      eventIds: routeEntries.map(({ eventId }) => eventId),
      allVisibleRouteIds: [...new Set(Object.values(result)
        .filter((detour) => detour?.riderVisible !== false)
        .map((detour) => String(detour.routeId)))],
    });
  });

  const firstDetected = timeline.find((tick) => tick.eventCount > 0);
  const firstVisible = timeline.find((tick) => tick.visible);
  const last = timeline[timeline.length - 1];
  let longestVisibleRun = 0;
  let currentVisibleRun = 0;
  for (const tick of timeline) {
    currentVisibleRun = tick.visible ? currentVisibleRun + 1 : 0;
    longestVisibleRun = Math.max(longestVisibleRun, currentVisibleRun);
  }

  return {
    routeId: fixture.routeId,
    tickMs,
    tickCount: timeline.length,
    restartCount,
    firstDetectedTick: firstDetected?.tick ?? null,
    firstVisibleTick: firstVisible?.tick ?? null,
    finalState: last?.state || 'absent',
    finalVisible: last?.visible === true,
    pathEverShown: timeline.some((tick) => tick.pathShown),
    maxVisibleEventCount: Math.max(0, ...timeline.map((tick) => tick.visibleEventCount)),
    longestVisibleRun,
    visibleTicks: timeline.filter((tick) => tick.visible).map((tick) => tick.tick),
    allVisibleRouteIds: [...new Set(timeline.flatMap((tick) => tick.allVisibleRouteIds))],
    skippedStopIds: [...new Set(timeline.flatMap((tick) => tick.skippedStopIds))],
    timeline,
  };
}

module.exports = {
  buildReplayMaps,
  replayDetourV2Fixture,
  replaySyntheticDetourTrace,
  summarizeReplay,
};
