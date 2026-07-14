import {
  cancelLocationCenterRequest,
  hasActiveLocationCenterRequest,
} from '../utils/locationCenterRequest';

describe('location center request helpers', () => {
  test('only treats an in-flight request or release animation as active', () => {
    expect(hasActiveLocationCenterRequest()).toBe(false);
    expect(hasActiveLocationCenterRequest({ isCentering: true })).toBe(true);
    expect(hasActiveLocationCenterRequest({ releaseTimerRef: { current: null } })).toBe(false);
    expect(hasActiveLocationCenterRequest({ releaseTimerRef: { current: 123 } })).toBe(true);
  });

  test('clears the loading state when an in-flight center request is cancelled', () => {
    const pendingRef = { current: 4 };
    const releaseTimerRef = { current: setTimeout(() => {}, 1000) };
    const stopFollowingUserLocation = jest.fn();
    const setIsCenteringOnUserLocation = jest.fn();

    cancelLocationCenterRequest({
      pendingRef,
      releaseTimerRef,
      stopFollowingUserLocation,
      setIsCenteringOnUserLocation,
    });

    expect(pendingRef.current).toBe(5);
    expect(releaseTimerRef.current).toBe(null);
    expect(stopFollowingUserLocation).toHaveBeenCalledTimes(1);
    expect(setIsCenteringOnUserLocation).toHaveBeenCalledWith(false);
  });
});
