import { useState, useRef, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { ANIMATION } from '../config/constants';
import {
  buildPolylineSegment,
  haversineDistance,
  projectPointToPolyline,
} from '../utils/geometryUtils';

const SHOULD_SKIP_JS_MARKER_ANIMATION = Platform.OS === 'android';

/**
 * Normalize a bearing delta to [-180, 180] for shortest-arc rotation.
 */
const normalizeBearingDelta = (delta) => {
  let d = delta % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

/**
 * Cubic ease-out: fast start, smooth deceleration.
 * f(t) = 1 - (1 - t)^3
 */
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getNow = () => (
  typeof globalThis?.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now()
);

const buildMeasuredPath = (points) => {
  if (!Array.isArray(points) || points.length < 2) return null;

  const cumulative = [0];
  let totalDistance = 0;

  for (let i = 1; i < points.length; i++) {
    totalDistance += haversineDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
    cumulative.push(totalDistance);
  }

  if (totalDistance <= 0) return null;

  return {
    points,
    cumulative,
    totalDistance,
  };
};

const interpolateMeasuredPath = (path, progress) => {
  if (!path || !Array.isArray(path.points) || path.points.length === 0) {
    return null;
  }

  if (progress <= 0) return path.points[0];
  if (progress >= 1) return path.points[path.points.length - 1];

  const targetDistance = path.totalDistance * progress;

  for (let i = 1; i < path.cumulative.length; i++) {
    if (targetDistance <= path.cumulative[i]) {
      const segmentStartDistance = path.cumulative[i - 1];
      const segmentDistance = path.cumulative[i] - segmentStartDistance || 1;
      const localProgress = (targetDistance - segmentStartDistance) / segmentDistance;
      const from = path.points[i - 1];
      const to = path.points[i];

      return {
        latitude: from.latitude + (to.latitude - from.latitude) * localProgress,
        longitude: from.longitude + (to.longitude - from.longitude) * localProgress,
      };
    }
  }

  return path.points[path.points.length - 1];
};

const resolveSnappedTarget = (point, snapPath) => {
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    return {
      point,
      projection: null,
      snappedBearing: null,
      isSnapped: false,
    };
  }

  if (!Array.isArray(snapPath) || snapPath.length < 2) {
    return {
      point,
      projection: null,
      snappedBearing: null,
      isSnapped: false,
    };
  }

  const projection = projectPointToPolyline(point, snapPath);
  if (!projection || projection.distanceMeters > ANIMATION.BUS_ROUTE_SNAP_MAX_DISTANCE_M) {
    return {
      point,
      projection: null,
      snappedBearing: null,
      isSnapped: false,
    };
  }

  return {
    point: projection.point,
    projection,
    snappedBearing: projection.bearing,
    isSnapped: true,
  };
};

const resolveTargetBearing = ({ currentBearing, vehicle, snappedBearing }) => {
  const rawBearing = Number.isFinite(vehicle?.bearing) ? vehicle.bearing : null;
  const speed = vehicle?.speed;
  const isMoving = !Number.isFinite(speed) || speed >= ANIMATION.BUS_BEARING_MIN_SPEED_MPS;

  let nextBearing = currentBearing ?? rawBearing ?? snappedBearing ?? 0;

  if (!isMoving) {
    return nextBearing;
  }

  if (rawBearing !== null) {
    nextBearing = rawBearing;
  } else if (Number.isFinite(snappedBearing)) {
    nextBearing = snappedBearing;
  }

  if (currentBearing != null) {
    const delta = normalizeBearingDelta(nextBearing - currentBearing);
    if (Math.abs(delta) < ANIMATION.BUS_BEARING_THRESHOLD_DEG) {
      return currentBearing;
    }
  }

  return nextBearing;
};

/**
 * Hook that smoothly interpolates bus position and bearing between GTFS-RT updates.
 *
 * Uses requestAnimationFrame for an interval-aware animation on each update.
 * Works on both native (React Native) and web platforms.
 *
 * @param {object} vehicle - Vehicle object with .coordinate {latitude, longitude}, .bearing, and .speed
 * @param {{ snapPath?: Array<{latitude: number, longitude: number}> }} options
 * @returns {{ latitude: number, longitude: number, bearing: number, scale: number }}
 */
export const useAnimatedBusPosition = (vehicle, options = {}) => {
  const coord = vehicle?.coordinate;
  const targetLat = coord?.latitude;
  const targetLng = coord?.longitude;
  const snapPath = options?.snapPath;
  const hasValidTarget = Number.isFinite(targetLat) && Number.isFinite(targetLng);
  const rawTargetPoint = hasValidTarget
    ? { latitude: targetLat, longitude: targetLng }
    : null;
  const snappedTarget = resolveSnappedTarget(rawTargetPoint, snapPath);
  const resolvedTargetPoint = snappedTarget.point;
  const initialBearing = resolveTargetBearing({
    currentBearing: null,
    vehicle,
    snappedBearing: snappedTarget.snappedBearing,
  });

  const [animated, setAnimated] = useState({
    latitude: resolvedTargetPoint?.latitude ?? 0,
    longitude: resolvedTargetPoint?.longitude ?? 0,
    bearing: initialBearing,
    scale: 1,
  });

  const animRef = useRef({
    // Previous (start) values for interpolation
    fromLat: null,
    fromLng: null,
    fromBearing: null,
    // Current target
    toLat: null,
    toLng: null,
    toBearing: null,
    // Animation timing
    startTime: null,
    durationMs: ANIMATION.BUS_POSITION_DURATION_MS,
    lastTargetAt: null,
    motionPath: null,
    frameId: null,
    // Whether we've received at least one position
    initialized: false,
  });

  const animate = useCallback(() => {
    const ref = animRef.current;
    const now = getNow();
    const elapsed = now - ref.startTime;
    const duration = ref.durationMs || ANIMATION.BUS_POSITION_DURATION_MS;
    const pulseDuration = ANIMATION.BUS_PULSE_DURATION_MS;

    if (elapsed >= duration) {
      setAnimated({
        latitude: ref.toLat,
        longitude: ref.toLng,
        bearing: ref.toBearing,
        scale: 1,
      });
      ref.motionPath = null;
      ref.frameId = null;
      return;
    }

    const t = easeOutCubic(elapsed / duration);
    const pathPoint = interpolateMeasuredPath(ref.motionPath, t);
    const lat = pathPoint
      ? pathPoint.latitude
      : ref.fromLat + (ref.toLat - ref.fromLat) * t;
    const lng = pathPoint
      ? pathPoint.longitude
      : ref.fromLng + (ref.toLng - ref.fromLng) * t;

    const bearingDelta = normalizeBearingDelta(ref.toBearing - ref.fromBearing);
    let bearing = ref.fromBearing + bearingDelta * t;
    bearing = ((bearing % 360) + 360) % 360;

    let scale = 1;
    if (elapsed < pulseDuration) {
      const pulseT = elapsed / pulseDuration;
      scale = 1 + 0.08 * Math.sin(pulseT * Math.PI);
    }

    setAnimated({ latitude: lat, longitude: lng, bearing, scale });
    ref.frameId = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (!resolvedTargetPoint) return;

    const ref = animRef.current;
    const now = getNow();
    const targetBearing = resolveTargetBearing({
      currentBearing: ref.toBearing,
      vehicle,
      snappedBearing: snappedTarget.snappedBearing,
    });

    if (SHOULD_SKIP_JS_MARKER_ANIMATION) {
      if (ref.frameId) {
        cancelAnimationFrame(ref.frameId);
        ref.frameId = null;
      }

      ref.initialized = true;
      ref.fromLat = resolvedTargetPoint.latitude;
      ref.fromLng = resolvedTargetPoint.longitude;
      ref.fromBearing = targetBearing;
      ref.toLat = resolvedTargetPoint.latitude;
      ref.toLng = resolvedTargetPoint.longitude;
      ref.toBearing = targetBearing;
      ref.durationMs = 0;
      ref.lastTargetAt = now;
      ref.motionPath = null;

      setAnimated({
        latitude: resolvedTargetPoint.latitude,
        longitude: resolvedTargetPoint.longitude,
        bearing: targetBearing,
        scale: 1,
      });
      return undefined;
    }

    if (!ref.initialized) {
      ref.initialized = true;
      ref.fromLat = resolvedTargetPoint.latitude;
      ref.fromLng = resolvedTargetPoint.longitude;
      ref.fromBearing = targetBearing;
      ref.toLat = resolvedTargetPoint.latitude;
      ref.toLng = resolvedTargetPoint.longitude;
      ref.toBearing = targetBearing;
      ref.durationMs = ANIMATION.BUS_POSITION_DURATION_MS;
      ref.lastTargetAt = now;
      ref.motionPath = null;
      setAnimated({
        latitude: resolvedTargetPoint.latitude,
        longitude: resolvedTargetPoint.longitude,
        bearing: targetBearing,
        scale: 1,
      });
      return;
    }

    if (ref.frameId) {
      cancelAnimationFrame(ref.frameId);
    }

    const observedInterval = ref.lastTargetAt ? now - ref.lastTargetAt : ANIMATION.BUS_POSITION_DURATION_MS;
    const nextDuration = clamp(
      observedInterval * ANIMATION.BUS_POSITION_DURATION_RATIO,
      ANIMATION.BUS_POSITION_MIN_DURATION_MS,
      ANIMATION.BUS_POSITION_MAX_DURATION_MS
    );
    ref.lastTargetAt = now;

    setAnimated((current) => {
      const currentPoint = {
        latitude: current.latitude,
        longitude: current.longitude,
      };
      const currentProjection = resolveSnappedTarget(currentPoint, snapPath);
      const motionPath =
        currentProjection.isSnapped && snappedTarget.isSnapped
          ? buildMeasuredPath(
              buildPolylineSegment(
                snapPath,
                currentProjection.projection,
                snappedTarget.projection
              )
            )
          : null;

      ref.fromLat = current.latitude;
      ref.fromLng = current.longitude;
      ref.fromBearing = current.bearing;
      ref.toLat = resolvedTargetPoint.latitude;
      ref.toLng = resolvedTargetPoint.longitude;
      ref.toBearing = targetBearing;
      ref.startTime = now;
      ref.durationMs = nextDuration;
      ref.motionPath = motionPath;
      ref.frameId = requestAnimationFrame(animate);
      return current;
    });

    return () => {
      if (ref.frameId) {
        cancelAnimationFrame(ref.frameId);
        ref.frameId = null;
      }
    };
  }, [
    animate,
    resolvedTargetPoint?.latitude,
    resolvedTargetPoint?.longitude,
    snapPath,
    snappedTarget.isSnapped,
    snappedTarget.projection?.segmentIndex,
    snappedTarget.projection?.t,
    snappedTarget.snappedBearing,
    vehicle?.bearing,
    vehicle?.speed,
  ]);

  useEffect(() => {
    return () => {
      if (animRef.current.frameId) {
        cancelAnimationFrame(animRef.current.frameId);
        animRef.current.frameId = null;
      }
    };
  }, []);

  return animated;
};
