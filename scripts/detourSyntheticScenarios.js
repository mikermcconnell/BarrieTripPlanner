'use strict';

const TICK_MS = 30_000;
const START_TIME_MS = Date.parse('2026-07-13T14:00:00Z');

const ROUTES = Object.freeze({
  '2A': { latitude: 44.3833, longitude: -79.7149, label: 'Anne Street local closure', bypass: 'Leacock / Edgehill' },
  '7A': { latitude: 44.3941, longitude: -79.7000, label: 'Wellington local closure', bypass: 'Owen / Grove' },
  '8A': { latitude: 44.3764, longitude: -79.6900, label: 'Essa local closure', bypass: 'Innisfil / Tiffin' },
  '11': { latitude: 44.3893, longitude: -79.6910, label: 'Downtown local closure', bypass: 'Collier / Owen' },
  '12A': { latitude: 44.3366, longitude: -79.6780, label: 'Saunders local closure', bypass: 'Welham / Hooper' },
});

function point(latitude, longitude) {
  return { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
}

function makeShape({ latitude, longitude }) {
  return Array.from({ length: 11 }, (_, index) => point(latitude, longitude + index * 0.002));
}

function makeRouteTemplate(routeId) {
  const descriptor = ROUTES[routeId];
  const shape = makeShape(descriptor);
  const shapeId = `synthetic-${routeId.toLowerCase()}-shape`;
  const entryPoint = shape[2];
  const exitPoint = shape[7];
  const detourPath = [
    entryPoint,
    point(descriptor.latitude + 0.0012, shape[2].longitude),
    point(descriptor.latitude + 0.0012, shape[4].longitude),
    point(descriptor.latitude + 0.0012, shape[6].longitude),
    point(descriptor.latitude + 0.0006, shape[7].longitude),
    exitPoint,
  ];
  const stopIds = {
    before: `${routeId}-before`,
    skipped: `${routeId}-skipped`,
    after: `${routeId}-after`,
  };
  return {
    descriptor,
    shape,
    shapeId,
    entryPoint,
    exitPoint,
    detourPath,
    stopIds,
    stopImpactData: {
      routeStopSequencesMapping: {
        [routeId]: {
          [shapeId]: [stopIds.before, stopIds.skipped, stopIds.after],
        },
      },
      stopsById: new Map([
        [stopIds.before, { id: stopIds.before, code: `${routeId}-100`, ...shape[2] }],
        [stopIds.skipped, { id: stopIds.skipped, code: `${routeId}-101`, ...shape[4] }],
        [stopIds.after, { id: stopIds.after, code: `${routeId}-102`, ...shape[7] }],
      ]),
    },
    baseline: {
      routeId,
      shapeIds: [shapeId],
      shapes: { [shapeId]: shape },
    },
  };
}

function vehicle(routeId, id, tripId, coordinate) {
  return { id, routeId, tripId, coordinate };
}

function positiveTicks(template) {
  const { detourPath } = template;
  return [
    { vehicles: [
      vehicle(template.baseline.routeId, 'bus-1', 'trip-1', detourPath[1]),
      vehicle(template.baseline.routeId, 'bus-2', 'trip-2', detourPath[2]),
    ] },
    { vehicles: [
      vehicle(template.baseline.routeId, 'bus-1', 'trip-1', detourPath[3]),
      vehicle(template.baseline.routeId, 'bus-2', 'trip-2', detourPath[4]),
    ] },
    { vehicles: [
      vehicle(template.baseline.routeId, 'bus-1', 'trip-1', detourPath[4]),
      vehicle(template.baseline.routeId, 'bus-2', 'trip-2', detourPath[3]),
    ] },
  ];
}

function baseScenario(id, category, routeId, overrides = {}) {
  const template = makeRouteTemplate(routeId);
  const expected = {
    visibility: 'visible',
    visibleByTick: 1,
    path: 'shown',
    finalState: 'active',
    maxVisibleEventCount: 1,
    ...overrides.expected,
  };
  if (category !== 'safety' && !expected.skippedStopIds) {
    expected.skippedStopIds = [template.stopIds.skipped];
  }
  if (expected.visibility === 'never-visible') delete expected.visibleByTick;
  return {
    id,
    category,
    synthetic: true,
    testOnly: true,
    tickMs: TICK_MS,
    startTimeMs: START_TIME_MS,
    routeId,
    description: `${template.descriptor.label}; bypass via ${template.descriptor.bypass}`,
    baseline: template.baseline,
    detectorConfig: {},
    stopImpactData: template.stopImpactData,
    ticks: positiveTicks(template),
    expected,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'expected')),
  };
}

function normalNoiseScenario() {
  const template = makeRouteTemplate('2A');
  const ticks = Array.from({ length: 6 }, (_, tick) => ({ vehicles: [
    vehicle('2A', 'noise-1', 'noise-trip-1', point(template.shape[tick + 1].latitude + 0.00008, template.shape[tick + 1].longitude)),
    vehicle('2A', 'noise-2', 'noise-trip-2', point(template.shape[tick + 2].latitude - 0.00008, template.shape[tick + 2].longitude)),
  ] }));
  return baseScenario('safety-normal-gps-noise', 'safety', '2A', {
    detectorConfig: {},
    ticks,
    expected: { visibility: 'never-visible', path: 'suppressed', finalState: 'absent' },
  });
}

function singleBusScenario() {
  const template = makeRouteTemplate('7A');
  return baseScenario('safety-single-bus-deviation', 'safety', '7A', {
    detectorConfig: {},
    ticks: template.detourPath.slice(1, 5).map((coordinate) => ({
      vehicles: [vehicle('7A', 'single-bus', 'single-trip', coordinate)],
    })),
    expected: { visibility: 'never-visible', path: 'suppressed', finalState: 'absent' },
  });
}

function shortSpanTrap(id, routeId, latitudeOffsets) {
  const template = makeRouteTemplate(routeId);
  const longitude = template.shape[5].longitude;
  const ticks = latitudeOffsets.map((offset, index) => ({ vehicles: [
    vehicle(routeId, `trap-${index % 2}`, `trap-trip-${index % 2}`, point(template.shape[5].latitude + offset, longitude)),
  ] }));
  return baseScenario(id, 'safety', routeId, {
    detectorConfig: {},
    ticks,
    expected: { visibility: 'never-visible', path: 'suppressed', finalState: 'active-or-absent' },
  });
}

function siblingDirectionScenario() {
  const template = makeRouteTemplate('8A');
  const siblingShapeId = 'synthetic-8b-shape';
  const siblingShape = template.shape.map((coordinate) => point(
    coordinate.latitude + 0.0012,
    coordinate.longitude
  ));
  return baseScenario('safety-route-family-direction', 'safety', '8A', {
    baseline: {
      shapes: {
        [template.shapeId]: template.shape,
        [siblingShapeId]: siblingShape,
      },
      routeShapeMapping: {
        '8A': [template.shapeId],
        '8B': [siblingShapeId],
      },
    },
    detectorConfig: {},
    ticks: [1, 3, 5, 7].map((index) => ({ vehicles: [
      vehicle('8B', 'sibling-bus-1', 'sibling-trip-1', siblingShape[index]),
      vehicle('8B', 'sibling-bus-2', 'sibling-trip-2', siblingShape[index + 1]),
    ] })),
    expected: {
      visibility: 'never-visible',
      path: 'suppressed',
      finalState: 'absent',
      forbiddenVisibleRouteIds: ['8A', '8B'],
    },
  });
}

function lifecycleScenario(id, routeId, lifecycleTicks, expected) {
  const template = makeRouteTemplate(routeId);
  return baseScenario(id, 'lifecycle', routeId, {
    ticks: [...positiveTicks(template), ...lifecycleTicks(template)],
    expected: {
      visibility: 'visible',
      visibleByTick: 1,
      path: 'shown',
      maxVisibleEventCount: 1,
      ...expected,
    },
  });
}

function buildSyntheticDetourScenarios() {
  const positives = [
    ['positive-route-2-local-closure', '2A'],
    ['positive-route-7-wellington-owen-grove', '7A'],
    ['positive-route-8-paired-variant', '8A'],
    ['positive-route-11-downtown-bypass', '11'],
    ['positive-route-12-saunders-welham', '12A'],
  ].map(([id, routeId]) => baseScenario(id, 'positive', routeId));

  const safety = [
    normalNoiseScenario(),
    singleBusScenario(),
    shortSpanTrap('safety-out-and-back', '11', [0.0012, 0.0020, 0.0012, 0.0020]),
    shortSpanTrap('safety-tiny-span-long-path', '12A', [0.0012, 0.0035, 0.0055, 0.0035]),
    siblingDirectionScenario(),
  ];

  const lifecycle = [
    lifecycleScenario('lifecycle-normal-route-clear', '2A', (template) => [2, 3, 4, 5, 6, 7].map((index) => ({ vehicles: [
      vehicle('2A', 'clear-bus-1', 'clear-trip-1', template.shape[index]),
      vehicle('2A', 'clear-bus-2', 'clear-trip-2', template.shape[index]),
    ] })).concat([{ vehicles: [] }]), { finalState: 'absent', clearByTick: 9 }),
    lifecycleScenario('lifecycle-bus-absence-does-not-clear', '7A', () => Array.from({ length: 5 }, () => ({ vehicles: [] })), {
      finalState: 'active', minConsecutiveVisibleTicks: 7,
    }),
    lifecycleScenario('lifecycle-trip-rollover-does-not-clear', '8A', (template) => [1, 3, 5, 7, 9].map((index) => ({ vehicles: [
      vehicle('8A', 'bus-1', 'trip-after-rollover', template.shape[index]),
    ] })), { finalState: 'active' }),
    lifecycleScenario('lifecycle-between-bus-visibility', '11', (template) => [
      { vehicles: [] },
      { vehicles: [vehicle('11', 'bus-1', 'trip-1', template.detourPath[3])] },
      { vehicles: [] },
      { vehicles: [vehicle('11', 'bus-2', 'trip-2', template.detourPath[4])] },
      { vehicles: [] },
    ], { finalState: 'active', minConsecutiveVisibleTicks: 7 }),
    lifecycleScenario('lifecycle-restart-hydration-continuity', '12A', () => [
      { restart: true, vehicles: [] },
      { vehicles: [] },
      { vehicles: [] },
    ], { finalState: 'active', restartContinuity: true, minConsecutiveVisibleTicks: 5 }),
  ];

  return [...positives, ...safety, ...lifecycle];
}

module.exports = {
  TICK_MS,
  buildSyntheticDetourScenarios,
};
