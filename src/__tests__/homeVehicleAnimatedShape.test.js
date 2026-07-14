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

    expect(result).toEqual({ animated: true, duration: 13800 });
    expect(animations).toHaveLength(1);
    expect(animations[0].items).toHaveLength(2);
    expect(controller.nodesById.get('bus-1').longitude.value).toBe(-79.68);
    expect(controller.nodesById.get('bus-1').latitude.value).toBe(44.4);
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
});
