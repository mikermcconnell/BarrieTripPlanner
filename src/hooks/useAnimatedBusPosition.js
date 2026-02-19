import { useState, useRef, useEffect, useCallback } from 'react';
import { ANIMATION } from '../config/constants';

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

/**
 * Hook that smoothly interpolates bus position and bearing between GTFS-RT updates.
 *
 * Uses requestAnimationFrame for ~2s animation on each update, then goes idle.
 * Works on both native (React Native) and web platforms.
 *
 * @param {object} vehicle - Vehicle object with .coordinate {latitude, longitude} and .bearing
 * @returns {{ latitude: number, longitude: number, bearing: number, scale: number }}
 */
export const useAnimatedBusPosition = (vehicle) => {
  const coord = vehicle?.coordinate;
  const targetLat = coord?.latitude;
  const targetLng = coord?.longitude;
  const targetBearing = vehicle?.bearing ?? 0;

  const [animated, setAnimated] = useState({
    latitude: targetLat || 0,
    longitude: targetLng || 0,
    bearing: targetBearing,
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
    frameId: null,
    // Whether we've received at least one position
    initialized: false,
  });

  const animate = useCallback(() => {
    const ref = animRef.current;
    const now = performance.now();
    const elapsed = now - ref.startTime;
    const duration = ANIMATION.BUS_POSITION_DURATION_MS;
    const pulseDuration = ANIMATION.BUS_PULSE_DURATION_MS;

    if (elapsed >= duration) {
      // Animation complete — set final values exactly
      setAnimated({
        latitude: ref.toLat,
        longitude: ref.toLng,
        bearing: ref.toBearing,
        scale: 1,
      });
      ref.frameId = null;
      return;
    }

    const t = easeOutCubic(elapsed / duration);

    // Interpolate position linearly with easing
    const lat = ref.fromLat + (ref.toLat - ref.fromLat) * t;
    const lng = ref.fromLng + (ref.toLng - ref.fromLng) * t;

    // Interpolate bearing via shortest arc
    const bearingDelta = normalizeBearingDelta(ref.toBearing - ref.fromBearing);
    let bearing = ref.fromBearing + bearingDelta * t;
    // Normalize to [0, 360)
    bearing = ((bearing % 360) + 360) % 360;

    // Scale pulse: 1.0 → 1.08 → 1.0 over pulseDuration
    let scale = 1;
    if (elapsed < pulseDuration) {
      const pulseT = elapsed / pulseDuration;
      // Sine curve: 0 → 1 → 0 over the pulse window
      scale = 1 + 0.08 * Math.sin(pulseT * Math.PI);
    }

    setAnimated({ latitude: lat, longitude: lng, bearing, scale });
    ref.frameId = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (!targetLat || !targetLng) return;

    const ref = animRef.current;

    if (!ref.initialized) {
      // First position — snap immediately, no animation
      ref.initialized = true;
      ref.fromLat = targetLat;
      ref.fromLng = targetLng;
      ref.fromBearing = targetBearing;
      ref.toLat = targetLat;
      ref.toLng = targetLng;
      ref.toBearing = targetBearing;
      setAnimated({
        latitude: targetLat,
        longitude: targetLng,
        bearing: targetBearing,
        scale: 1,
      });
      return;
    }

    // New position arrived — start (or restart) animation from current interpolated position
    // If mid-animation, start from where we currently are (no jump)
    if (ref.frameId) {
      cancelAnimationFrame(ref.frameId);
    }

    setAnimated((current) => {
      ref.fromLat = current.latitude;
      ref.fromLng = current.longitude;
      ref.fromBearing = current.bearing;
      ref.toLat = targetLat;
      ref.toLng = targetLng;
      ref.toBearing = targetBearing;
      ref.startTime = performance.now();
      ref.frameId = requestAnimationFrame(animate);
      return current; // Don't change state yet — rAF will drive updates
    });

    return () => {
      if (ref.frameId) {
        cancelAnimationFrame(ref.frameId);
        ref.frameId = null;
      }
    };
  }, [targetLat, targetLng, targetBearing, animate]);

  // Cleanup on unmount
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
