const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toRadians = (degrees) => degrees * (Math.PI / 180);
const toDegrees = (radians) => radians * (180 / Math.PI);
const getFiniteBearing = (bearing) => {
  if (bearing == null || bearing === '') return null;
  const numericBearing = Number(bearing);
  return Number.isFinite(numericBearing) ? numericBearing : null;
};

export const getHomeVehicleMovementBearing = (fromCoordinate, toCoordinate) => {
  if (
    !Number.isFinite(fromCoordinate?.latitude) ||
    !Number.isFinite(fromCoordinate?.longitude) ||
    !Number.isFinite(toCoordinate?.latitude) ||
    !Number.isFinite(toCoordinate?.longitude)
  ) return null;

  const latitudeDelta = Math.abs(toCoordinate.latitude - fromCoordinate.latitude);
  const longitudeDelta = Math.abs(toCoordinate.longitude - fromCoordinate.longitude);
  if (latitudeDelta < 0.000001 && longitudeDelta < 0.000001) return null;

  const fromLatitude = toRadians(fromCoordinate.latitude);
  const toLatitude = toRadians(toCoordinate.latitude);
  const longitudeDifference = toRadians(toCoordinate.longitude - fromCoordinate.longitude);
  const y = Math.sin(longitudeDifference) * Math.cos(toLatitude);
  const x = (
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDifference)
  );

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
};

export const inferHomeVehicleBearings = ({ fromVehicles = [], toVehicles = [] } = {}) => {
  const fromById = new Map(fromVehicles.map((vehicle) => [String(vehicle.id), vehicle]));

  return toVehicles.map((target) => {
    if (getFiniteBearing(target?.bearing) != null) return target;
    const from = fromById.get(String(target?.id));
    const inferredBearing = getHomeVehicleMovementBearing(from?.coordinate, target?.coordinate);
    const fallbackBearing = getFiniteBearing(from?.bearing);
    const bearing = Number.isFinite(inferredBearing)
      ? inferredBearing
      : fallbackBearing != null
        ? fallbackBearing
        : null;

    return Number.isFinite(bearing) ? { ...target, bearing } : target;
  });
};

export const getHomeVehicleAnimationDuration = (observedIntervalMs) => (
  clamp((Number(observedIntervalMs) || 12_000) * 0.92, 2_000, 14_000)
);

export const interpolateHomeVehicles = ({ fromVehicles = [], toVehicles = [], progress = 1 } = {}) => {
  const safeProgress = clamp(Number(progress) || 0, 0, 1);
  const fromById = new Map(fromVehicles.map((vehicle) => [String(vehicle.id), vehicle]));

  return toVehicles.map((target) => {
    const from = fromById.get(String(target.id));
    const fromCoordinate = from?.coordinate;
    const toCoordinate = target?.coordinate;
    if (
      !Number.isFinite(fromCoordinate?.latitude) ||
      !Number.isFinite(fromCoordinate?.longitude) ||
      !Number.isFinite(toCoordinate?.latitude) ||
      !Number.isFinite(toCoordinate?.longitude)
    ) {
      return target;
    }

    return {
      ...target,
      coordinate: {
        latitude: fromCoordinate.latitude + (toCoordinate.latitude - fromCoordinate.latitude) * safeProgress,
        longitude: fromCoordinate.longitude + (toCoordinate.longitude - fromCoordinate.longitude) * safeProgress,
      },
    };
  });
};
