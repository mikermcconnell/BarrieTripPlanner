import { COLORS } from '../../../config/theme';
import { calculateBearing } from '../../../utils/geometryUtils';
import { getVehicleSnapPath } from '../../../utils/navigationBusPreview';

const isTransitLeg = (leg) => leg?.mode === 'BUS' || leg?.mode === 'TRANSIT';

const resolveVehicleForTransitLeg = ({
  transitLeg,
  vehicles = [],
  proximityVehicle = null,
}) => {
  if (!transitLeg) return null;

  const tripId = transitLeg.tripId;
  const routeId = transitLeg.route?.id || transitLeg.routeId;
  let vehicle = null;

  if (tripId) {
    vehicle = vehicles.find((candidate) => candidate.tripId === tripId) || null;
  }

  if (!vehicle && routeId) {
    vehicle = vehicles.find((candidate) => candidate.routeId === routeId) || null;
  }

  if (!vehicle && proximityVehicle) {
    vehicle = proximityVehicle;
  }

  if (!vehicle?.coordinate) {
    return null;
  }

  return {
    ...vehicle,
    routeId: vehicle.routeId || routeId,
    coordinate: {
      latitude: vehicle.coordinate.latitude,
      longitude: vehicle.coordinate.longitude,
    },
  };
};

const buildVehicleMarker = ({
  id,
  transitLeg,
  vehicles = [],
  proximityVehicle = null,
  routePathsByRouteId,
  bearingOverride = null,
}) => {
  if (!transitLeg) return null;

  const vehicle = resolveVehicleForTransitLeg({
    transitLeg,
    vehicles,
    proximityVehicle,
  });

  if (!vehicle?.coordinate) return null;

  const markerBearing = Number.isFinite(bearingOverride) ? bearingOverride : vehicle.bearing;
  const markerVehicle = Number.isFinite(bearingOverride)
    ? { ...vehicle, bearing: bearingOverride }
    : vehicle;

  return {
    id,
    latitude: vehicle.coordinate.latitude,
    longitude: vehicle.coordinate.longitude,
    vehicle: markerVehicle,
    color: transitLeg.route?.color || COLORS.primary,
    routeId: transitLeg.route?.id || transitLeg.routeId,
    routeShortName: transitLeg.route?.shortName || '?',
    bearing: markerBearing,
    snapPath: getVehicleSnapPath(vehicle, routePathsByRouteId),
  };
};

const getWalkingApproachBearing = (vehicle, transitLeg) => {
  if (!vehicle?.coordinate) return null;
  const stop = transitLeg?.from;
  if (!Number.isFinite(stop?.lat) || !Number.isFinite(stop?.lon)) return null;

  return calculateBearing(
    vehicle.coordinate,
    { latitude: stop.lat, longitude: stop.lon }
  );
};

const findWalkingTransitLeg = ({
  itinerary,
  currentLegIndex = 0,
  nextTransitLeg = null,
}) => {
  if (nextTransitLeg) {
    return nextTransitLeg;
  }

  const legs = itinerary?.legs || [];
  for (let index = currentLegIndex - 1; index >= 0; index -= 1) {
    if (isTransitLeg(legs[index])) {
      return legs[index];
    }
  }

  return null;
};

export const buildTrackedBusMarker = ({
  currentTransitLeg = null,
  vehicles = [],
  busProximityVehicle = null,
  routePathsByRouteId,
}) => buildVehicleMarker({
  id: 'tracked-bus',
  transitLeg: currentTransitLeg,
  vehicles,
  proximityVehicle: busProximityVehicle,
  routePathsByRouteId,
});

export const buildWalkingBusMarker = ({
  itinerary,
  currentLegIndex = 0,
  isWalkingLeg = false,
  nextTransitLeg = null,
  vehicles = [],
  nextTransitProximityVehicle = null,
  routePathsByRouteId,
}) => {
  if (!isWalkingLeg) return null;

  const transitLeg = findWalkingTransitLeg({
    itinerary,
    currentLegIndex,
    nextTransitLeg,
  });

  const walkingApproachBearing = nextTransitLeg
    ? getWalkingApproachBearing(
        resolveVehicleForTransitLeg({
          transitLeg,
          vehicles,
          proximityVehicle: nextTransitProximityVehicle,
        }),
        transitLeg
      )
    : null;

  return buildVehicleMarker({
    id: 'walking-bus',
    transitLeg,
    vehicles,
    proximityVehicle: nextTransitProximityVehicle,
    routePathsByRouteId,
    bearingOverride: walkingApproachBearing,
  });
};

export const buildNavigationVehicleMarkers = (args) => ({
  trackedBusMarker: buildTrackedBusMarker(args),
  walkingBusMarker: buildWalkingBusMarker(args),
});

export default buildNavigationVehicleMarkers;
