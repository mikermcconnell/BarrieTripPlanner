import { useEffect } from 'react';

const isTransitLeg = (leg) => leg?.mode === 'BUS' || leg?.mode === 'TRANSIT';

export const shouldAutoBoardBus = ({
  currentTransitLeg,
  transitStatus,
  busProximity,
} = {}) => (
  isTransitLeg(currentTransitLeg) &&
  (transitStatus === 'waiting' || transitStatus === 'boarding') &&
  busProximity?.autoBoardReady === true
);

export const useAutoBoardBus = ({
  currentTransitLeg,
  transitStatus,
  busProximity,
  onBoardBus,
  onAutoBoardReady,
  delayMs = 2000,
} = {}) => {
  useEffect(() => {
    if (!shouldAutoBoardBus({ currentTransitLeg, transitStatus, busProximity })) {
      return undefined;
    }

    if (typeof onAutoBoardReady === 'function') {
      onAutoBoardReady();
    }

    const timer = setTimeout(() => {
      if (typeof onBoardBus === 'function') {
        onBoardBus();
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    currentTransitLeg,
    transitStatus,
    busProximity?.autoBoardReady,
    onBoardBus,
    onAutoBoardReady,
    delayMs,
  ]);
};

export default useAutoBoardBus;
