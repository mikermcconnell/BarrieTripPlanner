jest.mock('@maplibre/maplibre-react-native', () => ({
  __esModule: true,
  default: {
    Animated: {
      Shape: class MockMapLibreShape {},
    },
  },
}));

import {
  createAnimatedHomeVehicleShape,
  getHomeVehicleShapeIdentity,
  syncAnimatedHomeVehicleShape,
} from '../hooks/useAnimatedHomeVehicleShape';

class FakeValue {
  constructor(value) { this.value = value; }
  setValue(value) { this.value = value; }
}

class FakeShape {
  constructor(value) { this.value = value; }
}

const animations = [];
const AnimatedApi = {
  Value: FakeValue,
  timing: (node, config) => ({
    start: () => { node.value = config.toValue; },
    stop: jest.fn(),
    node,
    config,
  }),
  parallel: (items) => {
    const animation = {
      start: () => items.forEach((item) => item.start()),
      stop: jest.fn(),
      items,
    };
    animations.push(animation);
    return animation;
  },
  sequence: (items) => ({
    start: () => items.forEach((item) => item.start()),
    stop: jest.fn(),
    items,
    type: 'sequence',
  }),
};

const collection = (longitude = -79.69, latitude = 44.39) => ({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    id: 'bus-1',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties: { id: 'bus-1', routeLabel: '400', bearing: 90 },
  }],
});

const fleetCollection = (longitudeOffset = 0) => ({
  type: 'FeatureCollection',
  features: Array.from({ length: 110 }, (_, index) => ({
    type: 'Feature',
    id: `bus-${index}`,
    geometry: {
      type: 'Point',
      coordinates: [-79.7 + longitudeOffset, 44.35 + index * 0.0001],
    },
    properties: {
      id: `bus-${index}`,
      routeLabel: String((index % 15) + 1),
      bearing: 90,
    },
  })),
});

describe('animated home vehicle shape', () => {
  beforeEach(() => animations.splice(0));

  test('keeps a stable fleet identity when only coordinates change', () => {
    expect(getHomeVehicleShapeIdentity(collection())).toBe('bus-1');
    expect(getHomeVehicleShapeIdentity(collection(-79.68, 44.4))).toBe('bus-1');
  });

  test('builds an animated MapLibre shape with coordinate nodes', () => {
    const controller = createAnimatedHomeVehicleShape(collection(), {
      AnimatedApi,
      ShapeClass: FakeShape,
    });
    const coordinates = controller.shape.value.features[0].geometry.coordinates;

    expect(coordinates[0]).toBeInstanceOf(FakeValue);
    expect(coordinates[1]).toBeInstanceOf(FakeValue);
    expect(coordinates.map((node) => node.value)).toEqual([-79.69, 44.39]);
  });

  test('animates coordinate nodes for a live movement update', () => {
    const controller = createAnimatedHomeVehicleShape(collection(), {
      AnimatedApi,
      ShapeClass: FakeShape,
    });
    const result = syncAnimatedHomeVehicleShape({
      controller,
      featureCollection: collection(-79.68, 44.4),
      AnimatedApi,
      timestamp: 15_000,
    });

    expect(result).toEqual({ animated: true, duration: 15750 });
    expect(animations.at(-1).items).toHaveLength(1);
    expect(controller.nodesById.get('bus-1').longitude.value).toBe(-79.68);
    expect(controller.nodesById.get('bus-1').latitude.value).toBe(44.4);
  });

  test('uses route keyframes and smoothly rotates bearing', () => {
    const controller = createAnimatedHomeVehicleShape(collection(), {
      AnimatedApi,
      ShapeClass: FakeShape,
    });
    const target = collection(-79.68, 44.4);
    target.features[0].properties.bearing = 180;
    const motionPathsByVehicleId = new Map([['bus-1', [
      { latitude: 44.39, longitude: -79.69 },
      { latitude: 44.39, longitude: -79.68 },
      { latitude: 44.4, longitude: -79.68 },
    ]]]) ;

    syncAnimatedHomeVehicleShape({
      controller,
      featureCollection: target,
      motionPathsByVehicleId,
      AnimatedApi,
      timestamp: 15_000,
    });

    const topLevelAnimation = animations.at(-1);
    expect(topLevelAnimation.items).toHaveLength(2);
    expect(topLevelAnimation.items[0].type).toBe('sequence');
    expect(topLevelAnimation.items[1].config.toValue).toBe(180);
  });

  test('jumps immediately when animation is disabled or the feed is stale', () => {
    const controller = createAnimatedHomeVehicleShape(collection(), {
      AnimatedApi,
      ShapeClass: FakeShape,
    });
    const result = syncAnimatedHomeVehicleShape({
      controller,
      featureCollection: collection(-79.68, 44.4),
      active: false,
      feedIsStale: true,
      AnimatedApi,
    });

    expect(result.animated).toBe(false);
    expect(animations).toHaveLength(0);
    expect(controller.nodesById.get('bus-1').longitude.value).toBe(-79.68);
  });

  test('does not animate stationary GPS noise or stationary bearing changes', () => {
    const controller = createAnimatedHomeVehicleShape(collection(), {
      AnimatedApi,
      ShapeClass: FakeShape,
    });
    const target = collection(-79.689995, 44.39);
    target.features[0].properties.bearing = 180;

    const result = syncAnimatedHomeVehicleShape({
      controller,
      featureCollection: target,
      AnimatedApi,
      timestamp: 15_000,
    });

    expect(result.animated).toBe(false);
    expect(animations).toHaveLength(0);
    expect(controller.nodesById.get('bus-1').longitude.value).toBe(-79.689995);
    expect(controller.nodesById.get('bus-1').bearing.value).toBe(180);
  });

  test('reuses fixed slots when vehicles enter and leave', () => {
    const controller = createAnimatedHomeVehicleShape(collection(), {
      AnimatedApi,
      ShapeClass: FakeShape,
      slotCount: 2,
    });
    const originalShape = controller.shape;
    const replacement = collection(-79.67, 44.41);
    replacement.features[0].id = 'bus-2';
    replacement.features[0].properties.id = 'bus-2';

    syncAnimatedHomeVehicleShape({
      controller,
      featureCollection: replacement,
      AnimatedApi,
    });

    expect(controller.shape).toBe(originalShape);
    expect(controller.nodesById.has('bus-1')).toBe(false);
    expect(controller.nodesById.get('bus-2')).toBeDefined();
    expect(controller.nodesById.get('bus-2').feature.properties.isActive).toBe(1);
    expect(controller.slots.filter((slot) => slot.vehicleId == null)).toHaveLength(1);
  });

  test('reserves the full supported home-map fleet capacity', () => {
    const controller = createAnimatedHomeVehicleShape({
      type: 'FeatureCollection',
      features: [],
    }, {
      AnimatedApi,
      ShapeClass: FakeShape,
    });

    expect(controller.slots).toHaveLength(110);
  });

  test('prepares route-following animation for 110 buses within the GPS-update budget', () => {
    const initial = fleetCollection();
    const target = fleetCollection(0.002);
    const motionPathsByVehicleId = new Map(initial.features.map((feature, index) => {
      const latitude = 44.35 + index * 0.0001;
      return [feature.id, Array.from({ length: 20 }, (_, pointIndex) => ({
        latitude,
        longitude: -79.7 + pointIndex * (0.002 / 19),
      }))];
    }));
    const controller = createAnimatedHomeVehicleShape(initial, {
      AnimatedApi,
      ShapeClass: FakeShape,
    });

    const startedAt = performance.now();
    const result = syncAnimatedHomeVehicleShape({
      controller,
      featureCollection: target,
      motionPathsByVehicleId,
      AnimatedApi,
      timestamp: 15_000,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.animated).toBe(true);
    expect(controller.nodesById.size).toBe(110);
    expect(elapsedMs).toBeLessThan(150);
  });

  test('limits fleet animation work to buses with meaningful movement', () => {
    const initial = fleetCollection();
    const target = fleetCollection();
    target.features.forEach((feature, index) => {
      feature.geometry.coordinates[0] += index < 10 ? 0.002 : 0.000005;
    });
    const controller = createAnimatedHomeVehicleShape(initial, {
      AnimatedApi,
      ShapeClass: FakeShape,
    });

    syncAnimatedHomeVehicleShape({
      controller,
      featureCollection: target,
      AnimatedApi,
      timestamp: 15_000,
    });

    expect(animations.at(-1).items).toHaveLength(10);
  });
});
