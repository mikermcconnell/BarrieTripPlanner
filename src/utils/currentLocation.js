export const getForegroundDeviceLocation = async (
  LocationApi,
  { accuracy, timeoutMs = 4000 } = {}
) => {
  const { status } = await LocationApi.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission required');
  }

  const toCoords = (location) => {
    const coords = location?.coords;
    if (!coords) return null;
    return { lat: coords.latitude, lon: coords.longitude };
  };

  const withTimeout = (promiseFactory) => {
    let timeoutId = null;
    return Promise.race([
      Promise.resolve().then(promiseFactory),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Location lookup timed out')), timeoutMs);
      }),
    ]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
  };

  const getLastKnownCoords = async () => {
    if (typeof LocationApi.getLastKnownPositionAsync !== 'function') return null;
    const lastKnownLocation = await withTimeout(() => LocationApi.getLastKnownPositionAsync());
    return toCoords(lastKnownLocation);
  };

  try {
    const currentLocation = await withTimeout(() =>
      LocationApi.getCurrentPositionAsync({
        accuracy: accuracy ?? LocationApi.Accuracy?.Balanced,
      })
    );
    const currentCoords = toCoords(currentLocation);
    if (currentCoords) return currentCoords;
  } catch (currentError) {
    const lastKnownCoords = await getLastKnownCoords();
    if (lastKnownCoords) return lastKnownCoords;
    throw currentError;
  }

  const lastKnownCoords = await getLastKnownCoords();
  if (lastKnownCoords) return lastKnownCoords;

  throw new Error('Location unavailable');
};
