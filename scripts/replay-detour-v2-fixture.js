#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { createDetourV2Detector } = require('../api-proxy/detourV2/detector');

function usage() {
  console.error(`
Usage:
  node scripts/replay-detour-v2-fixture.js <fixture.json>

Replays a compact V2 detour fixture and prints the active event summary.
`);
}

function loadFixture(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function buildMaps(fixture) {
  const route = fixture.baselineRoute10;
  if (!route || !route.routeId || !route.shapes || !Array.isArray(route.shapeIds)) {
    throw new Error('Fixture is missing baselineRoute10 routeId, shapeIds, or shapes');
  }
  return {
    shapes: new Map(Object.entries(route.shapes)),
    routeShapeMapping: new Map([[route.routeId, route.shapeIds]]),
  };
}

function summarize(eventId, detour) {
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

function main() {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    usage();
    process.exit(2);
  }

  const fixture = loadFixture(fixturePath);
  const { shapes, routeShapeMapping } = buildMaps(fixture);
  const detector = createDetourV2Detector();
  detector.hydrateRuntimeState(fixture.runtimeRoute10 || {});
  const result = detector.processVehicles([], shapes, routeShapeMapping);
  const eventId = fixture.expected?.eventId || Object.keys(result)[0];
  const detour = result[eventId];

  if (!detour) {
    console.error(`Replay failed: expected event ${eventId} was not produced.`);
    console.error(`Produced events: ${Object.keys(result).join(', ') || '(none)'}`);
    process.exit(1);
  }

  const summary = summarize(eventId, detour);
  console.log(JSON.stringify({
    fixture: fixturePath,
    expected: fixture.expected || null,
    replay: summary,
  }, null, 2));

  if (summary.riderVisible !== false || summary.canShowDetourPath !== false) {
    console.error('Replay failed: fixture did not reproduce a backend-only hidden detour.');
    process.exit(1);
  }
}

main();
