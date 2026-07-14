export const isLocationCenterRequestCurrent = (requestId, pendingRef) => (
  requestId === pendingRef?.current
);

export const hasActiveLocationCenterRequest = ({
  isCentering = false,
  releaseTimerRef = null,
} = {}) => Boolean(isCentering || releaseTimerRef?.current);

export const cancelLocationCenterRequest = ({
  pendingRef,
  releaseTimerRef = null,
  stopFollowingUserLocation = null,
  setIsCenteringOnUserLocation = null,
} = {}) => {
  if (pendingRef) {
    pendingRef.current += 1;
  }

  if (releaseTimerRef?.current) {
    clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = null;
  }

  stopFollowingUserLocation?.();
  setIsCenteringOnUserLocation?.(false);
};
