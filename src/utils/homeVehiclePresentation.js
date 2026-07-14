import { getVehicleTimestampMs, isHomeVehicleStale } from './homeVehicleFeatures';

export const buildVehicleSelectionLabel = (selectedRouteNames = [], activeVehicleCount = 0) => {
  if (selectedRouteNames.length === 1) {
    return `${selectedRouteNames[0]} · ${activeVehicleCount} ${activeVehicleCount === 1 ? 'bus' : 'buses'}`;
  }
  if (selectedRouteNames.length > 1) {
    return `${selectedRouteNames.length} routes · ${activeVehicleCount} buses`;
  }
  return null;
};

export const formatVehicleFreshness = (vehicle, now = Date.now(), feedIsStale = false) => {
  const timestampMs = getVehicleTimestampMs(vehicle?.timestamp);
  if (!timestampMs) return feedIsStale ? 'Updates delayed' : 'Live position';
  const ageSeconds = Math.max(0, Math.round((now - timestampMs) / 1000));
  if (feedIsStale || isHomeVehicleStale(vehicle, now, feedIsStale)) {
    return ageSeconds < 120 ? `Position delayed · ${ageSeconds} sec old` : `Position delayed · ${Math.round(ageSeconds / 60)} min old`;
  }
  return ageSeconds < 5 ? 'Updated just now' : `Updated ${ageSeconds} sec ago`;
};
