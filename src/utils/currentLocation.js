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

  try {
    const currentLocation = await Promise.race([
      LocationApi.getCurrentPositionAsync({
        accuracy: accuracy ?? LocationApi.Accuracy?.Balanced,
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Location lookup timed out')), timeoutMs);
      }),
    ]);
    const currentCoords = toCoords(currentLocation);
    if (currentCoords) return currentCoords;
  } catch (currentError) {
    const lastKnownLocation = await LocationApi.getLastKnownPositionAsync?.();
    const lastKnownCoords = toCoords(lastKnownLocation);
    if (lastKnownCoords) return lastKnownCoords;
    throw currentError;
  }

  const lastKnownLocation = await LocationApi.getLastKnownPositionAsync?.();
  const lastKnownCoords = toCoords(lastKnownLocation);
  if (lastKnownCoords) return lastKnownCoords;

  throw new Error('Location unavailable');
};
