import { useEffect, useMemo } from 'react';
import { Animated as RNAnimated, Easing } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { getHomeVehicleAnimationDuration } from '../utils/homeVehicleInterpolation';

const now = () => globalThis?.performance?.now?.() || Date.now();

export const getHomeVehicleShapeIdentity = (featureCollection) => (
  (featureCollection?.features || [])
    .map((feature) => String(feature?.id ?? feature?.properties?.id ?? ''))
    .sort()
    .join('|')
);

export const createAnimatedHomeVehicleShape = (featureCollection, {
  AnimatedApi = RNAnimated,
  ShapeClass = MapLibreGL.Animated.Shape,
  slotCount = 64,
} = {}) => {
  const nodesById = new Map();
  const slots = [];
  const targets = featureCollection?.features || [];
  const featureCount = Math.max(slotCount, targets.length);
  const features = Array.from({ length: featureCount }, (_, index) => {
    const target = targets[index];
    const id = target ? String(target?.id ?? target?.properties?.id ?? '') : null;
    const feature = target || {
      type: 'Feature',
      id: `home-vehicle-slot-${index}`,
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {
        id: '',
        routeLabel: '',
        routeColor: '#000000',
        bearing: 0,
        hasBearing: 0,
        isActive: 0,
        isSelected: 0,
        opacity: 0,
        sortKey: 0,
      },
    };
    const [longitude, latitude] = feature?.geometry?.coordinates || [0, 0];
    const longitudeNode = new AnimatedApi.Value(longitude);
    const latitudeNode = new AnimatedApi.Value(latitude);
    const bearingNode = new AnimatedApi.Value(Number(feature?.properties?.bearing) || 0);
    const animatedFeature = {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: [longitudeNode, latitudeNode],
      },
      properties: {
        ...feature.properties,
        bearing: bearingNode,
      },
    };

    const slot = {
      feature: animatedFeature,
      longitude: longitudeNode,
      latitude: latitudeNode,
      bearing: bearingNode,
      targetLongitude: longitude,
      targetLatitude: latitude,
      vehicleId: id,
    };
    slots.push(slot);
    if (id) nodesById.set(id, slot);
    return animatedFeature;
  });

  const collection = { ...featureCollection, features };
  return {
    shape: new ShapeClass(collection),
    nodesById,
    slots,
    lastMovementAt: null,
    animation: null,
  };
};

export const syncAnimatedHomeVehicleShape = ({
  controller,
  featureCollection,
  active = true,
  feedIsStale = false,
  AnimatedApi = RNAnimated,
  timestamp = now(),
}) => {
  const targets = featureCollection?.features || [];
  const targetById = new Map(targets.map((target) => [
    String(target?.id ?? target?.properties?.id ?? ''),
    target,
  ]));

  controller.nodesById.forEach((node, id) => {
    if (targetById.has(id)) return;
    node.vehicleId = null;
    node.feature.properties = {
      ...node.feature.properties,
      id: '',
      isActive: 0,
      opacity: 0,
    };
    node.longitude.setValue(0);
    node.latitude.setValue(0);
    node.bearing.setValue(0);
    controller.nodesById.delete(id);
  });

  targets.forEach((target) => {
    const id = String(target?.id ?? target?.properties?.id ?? '');
    if (controller.nodesById.has(id)) return;
    const slot = controller.slots.find((candidate) => candidate.vehicleId == null);
    if (!slot) return;
    const [longitude, latitude] = target?.geometry?.coordinates || [];
    slot.vehicleId = id;
    slot.targetLongitude = longitude;
    slot.targetLatitude = latitude;
    slot.longitude.setValue(longitude);
    slot.latitude.setValue(latitude);
    controller.nodesById.set(id, slot);
  });

  const hasMovement = targets.some((target) => {
    const id = String(target?.id ?? target?.properties?.id ?? '');
    const node = controller.nodesById.get(id);
    const [longitude, latitude] = target?.geometry?.coordinates || [];
    return node && (node.targetLongitude !== longitude || node.targetLatitude !== latitude);
  });

  controller.animation?.stop?.();

  const observedInterval = controller.lastMovementAt == null
    ? 15_000
    : timestamp - controller.lastMovementAt;
  const duration = getHomeVehicleAnimationDuration(observedInterval);
  const animations = [];

  targets.forEach((target) => {
    const id = String(target?.id ?? target?.properties?.id ?? '');
    const node = controller.nodesById.get(id);
    if (!node) return;

    const [longitude, latitude] = target?.geometry?.coordinates || [];
    Object.assign(node.feature.properties, target.properties, { bearing: node.bearing });
    node.feature.properties.isActive = 1;
    node.feature.geometry = {
      ...target.geometry,
      coordinates: [node.longitude, node.latitude],
    };
    node.targetLongitude = longitude;
    node.targetLatitude = latitude;
    node.bearing.setValue(Number(target?.properties?.bearing) || 0);

    if (!hasMovement || !active || feedIsStale) {
      node.longitude.setValue(longitude);
      node.latitude.setValue(latitude);
      return;
    }

    animations.push(
      AnimatedApi.timing(node.longitude, {
        toValue: longitude,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
      AnimatedApi.timing(node.latitude, {
        toValue: latitude,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
  });

  if (hasMovement) controller.lastMovementAt = timestamp;
  if (animations.length > 0) {
    controller.animation = AnimatedApi.parallel(animations);
    controller.animation.start();
  } else {
    controller.animation = null;
  }

  return { animated: animations.length > 0, duration };
};

export const useAnimatedHomeVehicleShape = (
  featureCollection,
  { active = true, feedIsStale = false } = {}
) => {
  const controller = useMemo(
    () => createAnimatedHomeVehicleShape(featureCollection),
    // Fixed reusable slots let vehicles enter and leave without replacing the
    // source and forcing every other bus to jump to its latest feed position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    syncAnimatedHomeVehicleShape({
      controller,
      featureCollection,
      active,
      feedIsStale,
    });
    return () => controller.animation?.stop?.();
  }, [active, controller, featureCollection, feedIsStale]);

  return controller.shape;
};
