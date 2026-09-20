import { useEffect, useMemo } from 'react';
import { Animated as RNAnimated, Easing } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { ANIMATION, PERFORMANCE_BUDGETS } from '../config/constants';
import {
  buildHomeVehicleMotionPath,
  getHomeVehicleAnimationDuration,
  normalizeHomeVehicleBearingDelta,
} from '../utils/homeVehicleInterpolation';
import { haversineDistance } from '../utils/geometryUtils';

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
  slotCount = PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_VEHICLES,
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
      targetBearing: Number(feature?.properties?.bearing) || 0,
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

const readAnimatedValue = (node, fallback = 0) => {
  const value = node?.__getValue?.() ?? node?.value ?? node?._value;
  return Number.isFinite(value) ? value : fallback;
};

const buildPositionAnimation = ({
  node,
  motionPath,
  duration,
  AnimatedApi,
}) => {
  const points = Array.isArray(motionPath) ? motionPath : [];
  if (points.length < 2) return null;

  if (points.length === 2 || typeof AnimatedApi.sequence !== 'function') {
    const target = points[points.length - 1];
    return AnimatedApi.parallel([
      AnimatedApi.timing(node.longitude, {
        toValue: target.longitude,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
      AnimatedApi.timing(node.latitude, {
        toValue: target.latitude,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ]);
  }

  const segmentDistances = points.slice(1).map((point, index) => haversineDistance(
    points[index].latitude,
    points[index].longitude,
    point.latitude,
    point.longitude
  ));
  const totalDistance = segmentDistances.reduce((sum, distance) => sum + distance, 0) || 1;

  return AnimatedApi.sequence(points.slice(1).map((point, index) => (
    AnimatedApi.parallel([
      AnimatedApi.timing(node.longitude, {
        toValue: point.longitude,
        duration: Math.max(1, Math.round(duration * (segmentDistances[index] / totalDistance))),
        easing: Easing.linear,
        useNativeDriver: false,
      }),
      AnimatedApi.timing(node.latitude, {
        toValue: point.latitude,
        duration: Math.max(1, Math.round(duration * (segmentDistances[index] / totalDistance))),
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ])
  )));
};

export const syncAnimatedHomeVehicleShape = ({
  controller,
  featureCollection,
  active = true,
  feedIsStale = false,
  motionPathsByVehicleId = new Map(),
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
    node.targetBearing = 0;
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
    slot.targetBearing = Number(target?.properties?.bearing) || 0;
    slot.longitude.setValue(longitude);
    slot.latitude.setValue(latitude);
    controller.nodesById.set(id, slot);
  });

  const hasPositionMovement = targets.some((target) => {
    const id = String(target?.id ?? target?.properties?.id ?? '');
    const node = controller.nodesById.get(id);
    const [longitude, latitude] = target?.geometry?.coordinates || [];
    return node && (node.targetLongitude !== longitude || node.targetLatitude !== latitude);
  });

  const hasBearingMovement = targets.some((target) => {
    const id = String(target?.id ?? target?.properties?.id ?? '');
    const node = controller.nodesById.get(id);
    const targetBearing = Number(target?.properties?.bearing) || 0;
    return node && Math.abs(normalizeHomeVehicleBearingDelta(targetBearing - node.targetBearing)) >= 0.5;
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
    const currentCoordinate = {
      longitude: readAnimatedValue(node.longitude, node.targetLongitude),
      latitude: readAnimatedValue(node.latitude, node.targetLatitude),
    };
    node.targetLongitude = longitude;
    node.targetLatitude = latitude;
    const targetBearing = Number(target?.properties?.bearing) || 0;
    const currentBearing = readAnimatedValue(node.bearing, node.targetBearing);
    const resolvedTargetBearing = currentBearing + normalizeHomeVehicleBearingDelta(
      targetBearing - currentBearing
    );
    node.targetBearing = targetBearing;

    if (!active || feedIsStale) {
      node.longitude.setValue(longitude);
      node.latitude.setValue(latitude);
      node.bearing.setValue(targetBearing);
      return;
    }

    const coordinateChanged = currentCoordinate.longitude !== longitude || currentCoordinate.latitude !== latitude;
    const movementDistance = coordinateChanged
      ? haversineDistance(
          currentCoordinate.latitude,
          currentCoordinate.longitude,
          latitude,
          longitude
        )
      : 0;
    const hasMeaningfulMovement = movementDistance >= ANIMATION.BUS_HOME_ANIMATION_MIN_DISTANCE_M;

    if (coordinateChanged && !hasMeaningfulMovement) {
      // Tiny AVL changes are usually stationary GPS noise. Applying them once
      // avoids hundreds of no-visible-benefit JavaScript animation frames.
      node.longitude.setValue(longitude);
      node.latitude.setValue(latitude);
    } else if (hasMeaningfulMovement) {
      const snapPath = motionPathsByVehicleId.get?.(id);
      const motionPath = buildHomeVehicleMotionPath({
        fromCoordinate: currentCoordinate,
        toCoordinate: { longitude, latitude },
        snapPath,
      });
      const positionAnimation = buildPositionAnimation({
        node,
        motionPath,
        duration,
        AnimatedApi,
      });
      if (positionAnimation) animations.push(positionAnimation);
    }

    if (
      hasMeaningfulMovement &&
      Math.abs(normalizeHomeVehicleBearingDelta(targetBearing - currentBearing)) >= 0.5
    ) {
      animations.push(AnimatedApi.timing(node.bearing, {
        toValue: resolvedTargetBearing,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      }));
    } else if (!hasMeaningfulMovement && currentBearing !== targetBearing) {
      // Do not spend a full animation cycle rotating buses that are stopped.
      node.bearing.setValue(targetBearing);
    }
  });

  if (hasPositionMovement || hasBearingMovement) controller.lastMovementAt = timestamp;
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
  { active = true, feedIsStale = false, motionPathsByVehicleId = new Map() } = {}
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
      motionPathsByVehicleId,
    });
    return () => controller.animation?.stop?.();
  }, [active, controller, featureCollection, feedIsStale, motionPathsByVehicleId]);

  return controller.shape;
};
