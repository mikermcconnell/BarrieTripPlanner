import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { HOME_MAP_THEME } from '../config/homeMapTheme';
import {
  getHomeVehicleAnimationDuration,
  inferHomeVehicleBearings,
  interpolateHomeVehicles,
} from '../utils/homeVehicleInterpolation';

const now = () => globalThis?.performance?.now?.() || Date.now();

export const useBatchedHomeVehiclePositions = (vehicles = [], { active = true, feedIsStale = false } = {}) => {
  const [renderedVehicles, setRenderedVehicles] = useState(vehicles);
  const renderedRef = useRef(vehicles);
  const frameRef = useRef(null);
  const lastTargetAtRef = useRef(null);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { reduceMotionRef.current = value; }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      reduceMotionRef.current = Boolean(value);
    });
    return () => subscription?.remove?.();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
      if (!appActiveRef.current && frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const targetAt = now();
    const observedInterval = lastTargetAtRef.current ? targetAt - lastTargetAtRef.current : 12_000;
    lastTargetAtRef.current = targetAt;
    const fromVehicles = renderedRef.current;
    const targetVehicles = inferHomeVehicleBearings({ fromVehicles, toVehicles: vehicles });

    if (!active || feedIsStale || reduceMotionRef.current || renderedRef.current.length === 0) {
      renderedRef.current = targetVehicles;
      setRenderedVehicles(targetVehicles);
      return undefined;
    }

    const duration = getHomeVehicleAnimationDuration(observedInterval);
    let lastPaintAt = 0;

    const tick = () => {
      if (!appActiveRef.current) return;
      const tickAt = now();
      const progress = Math.min(1, (tickAt - targetAt) / duration);
      if (progress >= 1) {
        renderedRef.current = targetVehicles;
        setRenderedVehicles(targetVehicles);
        frameRef.current = null;
        return;
      }

      if (tickAt - lastPaintAt >= HOME_MAP_THEME.vehicleAnimationFrameMs) {
        lastPaintAt = tickAt;
        const next = interpolateHomeVehicles({ fromVehicles, toVehicles: targetVehicles, progress });
        renderedRef.current = next;
        setRenderedVehicles(next);
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [active, feedIsStale, vehicles]);

  return renderedVehicles;
};
