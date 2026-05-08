import { haversineDistance } from './geometryUtils';
import { decodePolyline, findClosestPointIndex } from './polylineUtils';

const BOARDING_PROGRESS_TOLERANCE_METERS = 80;

const hasStopCoordinate = (point) => (
  Number.isFinite(point?.lat) &&
  Number.isFinite(point?.lon)
);

const hasVehicleCoordinate = (vehicle) => (
  Number.isFinite(vehicle?.coordinate?.latitude) &&
  Number.isFinite(vehicle?.coordinate?.longitude)
);

const normalizeRouteKey = (routeId) => (
  routeId == null ? '' : String(routeId).trim().toUpperCase()
);

const getLegRouteId = (leg) => leg?.route?.id || leg?.routeId || null;

const getLegTripIds = (leg) => {
  if (Array.isArray(leg?.tripIds) && leg.tripIds.length > 0) {
    return leg.tripIds;
  }

  return leg?.tripId ? [leg.tripId] : [];
};

const getLegDirectionId = (leg, tripMapping = {}) => {
  if (leg?.directionId !== null && leg?.directionId !== undefined) {
    return leg.directionId;
  }
  if (leg?.tripId && tripMapping?.[leg.tripId]?.directionId !== undefined) {
    return tripMapping[leg.tripId].directionId;
  }
  return null;
};

const directionsMatch = (leg, vehicle, tripMapping = {}) => {
  const legDirectionId = getLegDirectionId(leg, tripMapping);
  if (legDirectionId === null || legDirectionId === undefined) {
    return true;
  }
  if (vehicle?.directionId === null || vehicle?.directionId === undefined) {
    return true;
  }
  return String(vehicle.directionId) === String(legDirectionId);
};

const getShapeForLeg = (leg, shapes = {}, tripMapping = {}) => {
  const shapeId = leg?.tripId ? tripMapping?.[leg.tripId]?.shapeId : null;
  if (shapeId && Array.isArray(shapes?.[shapeId]) && shapes[shapeId].length >= 2) {
    return shapes[shapeId];
  }

  if (leg?.legGeometry?.points) {
    const decoded = decodePolyline(leg.legGeometry.points);
    if (decoded.length >= 2) {
      return decoded;
    }
  }

  return null;
};

const getShapeProgress = (shapeCoords, lat, lon) => {
  if (!Array.isArray(shapeCoords) || shapeCoords.length < 2) {
    return null;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const index = findClosestPointIndex(shapeCoords, lat, lon);
  let meters = 0;
  for (let i = 1; i <= index; i += 1) {
    meters += haversineDistance(
      shapeCoords[i - 1].latitude,
      shapeCoords[i - 1].longitude,
      shapeCoords[i].latitude,
      shapeCoords[i].longitude
    );
  }

  return { index, meters };
};

const getVehicleDistanceToStop = (vehicle, stop) => {
  if (!hasVehicleCoordinate(vehicle) || !hasStopCoordinate(stop)) {
    return Infinity;
  }

  return haversineDistance(
    vehicle.coordinate.latitude,
    vehicle.coordinate.longitude,
    stop.lat,
    stop.lon
  );
};

const getBoardingProgressMatch = ({
  leg,
  vehicle,
  shapes,
  tripMapping,
}) => {
  if (!hasVehicleCoordinate(vehicle)) {
    return { keep: false, evaluated: false, score: Infinity };
  }

  const shapeCoords = getShapeForLeg(leg, shapes, tripMapping);

  if (!shapeCoords || !hasStopCoordinate(leg?.from) || !hasStopCoordinate(leg?.to)) {
    return {
      keep: true,
      evaluated: false,
      score: getVehicleDistanceToStop(vehicle, leg?.from),
    };
  }

  const boardProgress = getShapeProgress(shapeCoords, leg.from.lat, leg.from.lon);
  const alightProgress = getShapeProgress(shapeCoords, leg.to.lat, leg.to.lon);
  const vehicleProgress = getShapeProgress(
    shapeCoords,
    vehicle.coordinate.latitude,
    vehicle.coordinate.longitude
  );

  if (!boardProgress || !alightProgress || !vehicleProgress || boardProgress.index === alightProgress.index) {
    return {
      keep: true,
      evaluated: false,
      score: getVehicleDistanceToStop(vehicle, leg?.from),
    };
  }

  const travelIncreasing = boardProgress.meters <= alightProgress.meters;
  const hasPassedBoarding = travelIncreasing
    ? vehicleProgress.meters > boardProgress.meters + BOARDING_PROGRESS_TOLERANCE_METERS
    : vehicleProgress.meters < boardProgress.meters - BOARDING_PROGRESS_TOLERANCE_METERS;

  return {
    keep: !hasPassedBoarding,
    evaluated: true,
    score: Math.abs(boardProgress.meters - vehicleProgress.meters),
  };
};

const rankProgressMatches = ({
  leg,
  vehicles,
  shapes,
  tripMapping,
}) => vehicles
  .map((vehicle) => ({
    vehicle,
    ...getBoardingProgressMatch({ leg, vehicle, shapes, tripMapping }),
  }))
  .sort((a, b) => a.score - b.score);

const pickNearestVehicleToBoarding = (vehicles, transitLeg) => {
  let bestVehicle = null;
  let bestDistance = Infinity;

  vehicles.forEach((vehicle) => {
    const distance = getVehicleDistanceToStop(vehicle, transitLeg?.from);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestVehicle = vehicle;
    }
  });

  return bestVehicle;
};

export const selectMatchingVehicleForTransitLeg = ({
  transitLeg,
  vehicles = [],
  shapes = {},
  tripMapping = {},
}) => {
  if (!transitLeg || !vehicles.length) {
    return { vehicle: null, matchQuality: 'none' };
  }

  const legTripIds = new Set(getLegTripIds(transitLeg).filter(Boolean));
  const exactVehicles = vehicles.filter((vehicle) => legTripIds.has(vehicle?.tripId));
  const routeId = normalizeRouteKey(getLegRouteId(transitLeg));
  const routeVehicles = vehicles.filter((vehicle) => (
    routeId &&
    routeId === normalizeRouteKey(vehicle?.routeId) &&
    directionsMatch(transitLeg, vehicle, tripMapping)
  ));

  if (exactVehicles.length > 0) {
    const exactMatches = rankProgressMatches({
      leg: transitLeg,
      vehicles: exactVehicles,
      shapes,
      tripMapping,
    });
    const bestExactMatch = exactMatches.find((match) => match.keep);

    if (bestExactMatch?.evaluated) {
      return { vehicle: bestExactMatch.vehicle, matchQuality: 'trip_id' };
    }

    const routeMatches = rankProgressMatches({
      leg: transitLeg,
      vehicles: routeVehicles,
      shapes,
      tripMapping,
    });
    const bestRouteMatch = routeMatches.find((match) => match.keep && match.evaluated);

    if (bestRouteMatch) {
      return { vehicle: bestRouteMatch.vehicle, matchQuality: 'route_progress' };
    }

    if (!exactMatches.some((match) => match.evaluated)) {
      return { vehicle: exactVehicles[0], matchQuality: 'trip_id' };
    }

    return { vehicle: null, matchQuality: 'none' };
  }

  if (routeVehicles.length === 0) {
    return { vehicle: null, matchQuality: 'none' };
  }

  const routeMatches = rankProgressMatches({
    leg: transitLeg,
    vehicles: routeVehicles,
    shapes,
    tripMapping,
  });
  const bestRouteMatch = routeMatches.find((match) => match.keep && match.evaluated);
  if (bestRouteMatch) {
    return { vehicle: bestRouteMatch.vehicle, matchQuality: 'route_progress' };
  }

  if (routeMatches.some((match) => match.evaluated)) {
    return { vehicle: null, matchQuality: 'none' };
  }

  if (routeVehicles.length === 1) {
    return { vehicle: routeVehicles[0], matchQuality: 'route_single' };
  }

  const nearestRouteVehicle = pickNearestVehicleToBoarding(routeVehicles, transitLeg);
  if (nearestRouteVehicle) {
    return { vehicle: nearestRouteVehicle, matchQuality: 'route_nearest' };
  }

  return { vehicle: null, matchQuality: 'none' };
};
