import { HOME_MAP_THEME } from '../config/homeMapTheme';

export const getVehicleTimestampMs = (timestamp) => {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
};

export const isHomeVehicleStale = (vehicle, now = Date.now(), feedIsStale = false) => {
  if (feedIsStale) return true;
  const timestampMs = getVehicleTimestampMs(vehicle?.timestamp);
  if (!timestampMs) return false;
  return now - timestampMs > HOME_MAP_THEME.staleVehicleThresholdMs;
};

export const buildHomeVehicleFeatureCollection = ({
  vehicles = [],
  getRouteColor,
  getRouteLabel,
  selectedVehicleId = null,
  feedIsStale = false,
  isVehicleDimmed = () => false,
  isVehicleFullyOpaque = () => false,
  now = Date.now(),
} = {}) => ({
  type: 'FeatureCollection',
  features: vehicles
    .filter((vehicle) => Number.isFinite(vehicle?.coordinate?.latitude) && Number.isFinite(vehicle?.coordinate?.longitude))
    .map((vehicle) => {
      const routeLabel = String(getRouteLabel?.(vehicle) || vehicle.routeId || '?');
      const isSelected = selectedVehicleId != null && String(vehicle.id) === String(selectedVehicleId);
      const isStale = isHomeVehicleStale(vehicle, now, feedIsStale);
      const isDimmed = Boolean(isVehicleDimmed(vehicle));
      const isFullyOpaque = Boolean(isVehicleFullyOpaque(vehicle));
      const bearing = vehicle.bearing == null || vehicle.bearing === ''
        ? null
        : Number(vehicle.bearing);

      return {
        type: 'Feature',
        id: String(vehicle.id),
        geometry: {
          type: 'Point',
          coordinates: [vehicle.coordinate.longitude, vehicle.coordinate.latitude],
        },
        properties: {
          id: String(vehicle.id),
          routeId: String(vehicle.routeId || ''),
          routeLabel,
          routeColor: getRouteColor?.(vehicle.routeId) || '#0C8CE5',
          bearing: Number.isFinite(bearing) ? ((bearing % 360) + 360) % 360 : 0,
          hasBearing: Number.isFinite(bearing) ? 1 : 0,
          isActive: 1,
          headsign: vehicle.headsign || '',
          timestamp: getVehicleTimestampMs(vehicle.timestamp) || 0,
          isStale: isStale ? 1 : 0,
          isDimmed: isDimmed ? 1 : 0,
          isSelected: isSelected ? 1 : 0,
          // Keep every bus icon fully visible on the main map. Stale and
          // detour-focus state remain available for status and layer sorting.
          opacity: 1,
          sortKey: isSelected ? 4 : isFullyOpaque ? 3 : isStale ? 1 : 2,
        },
      };
    }),
});

export const findVehicleById = (vehicles = [], vehicleId = null) => (
  vehicleId == null ? null : vehicles.find((vehicle) => String(vehicle.id) === String(vehicleId)) || null
);
