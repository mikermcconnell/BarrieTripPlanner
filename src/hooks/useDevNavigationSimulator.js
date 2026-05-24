import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildNavigationSimulationPath,
  buildSimulatedNavigationLocation,
  getNavigationSimulationProgress,
  isNavigationSimulatorDevEnabled,
} from '../utils/navigationSimulation';

const SIMULATION_INTERVAL_MS = 1200;

export const useDevNavigationSimulator = ({
  enabled = true,
  transitLeg,
  onStartRide,
} = {}) => {
  const devEnabled = isNavigationSimulatorDevEnabled();
  const canUseSimulator = devEnabled && enabled;
  const path = useMemo(
    () => (canUseSimulator ? buildNavigationSimulationPath(transitLeg) : []),
    [canUseSimulator, transitLeg]
  );
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [location, setLocation] = useState(null);

  const canSimulate = canUseSimulator && path.length >= 2;

  const clear = useCallback(() => {
    setIsRunning(false);
    setCurrentIndex(0);
    setLocation(null);
  }, []);

  const start = useCallback(() => {
    if (!canSimulate) return false;

    setCurrentIndex(0);
    setLocation(buildSimulatedNavigationLocation(path, 0));
    setIsRunning(true);

    if (typeof onStartRide === 'function') {
      onStartRide();
    }

    return true;
  }, [canSimulate, onStartRide, path]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const resume = useCallback(() => {
    if (canSimulate && location) {
      setIsRunning(true);
    }
  }, [canSimulate, location]);

  useEffect(() => {
    clear();
  }, [clear, transitLeg]);

  useEffect(() => {
    if (!isRunning || !canSimulate) return undefined;

    const interval = setInterval(() => {
      setCurrentIndex((previousIndex) => {
        const nextIndex = Math.min(previousIndex + 1, path.length - 1);
        setLocation(buildSimulatedNavigationLocation(path, nextIndex));

        if (nextIndex >= path.length - 1) {
          setIsRunning(false);
        }

        return nextIndex;
      });
    }, SIMULATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [canSimulate, isRunning, path]);

  const progress = getNavigationSimulationProgress(path, currentIndex);

  return {
    canSimulate,
    clear,
    isDevSimulatorEnabled: devEnabled,
    isRunning,
    location,
    pause,
    progress,
    resume,
    start,
  };
};

export default useDevNavigationSimulator;
