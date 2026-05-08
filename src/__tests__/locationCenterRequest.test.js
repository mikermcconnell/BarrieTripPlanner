import { cancelLocationCenterRequest } from '../utils/locationCenterRequest';

describe('location center request helpers', () => {
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
