import { TripPlanningError, TRIP_ERROR_CODES, planTripAuto } from './tripService';
import { enrichItineraryWithWalking } from './walkingService';
import logger from '../utils/logger';
import { isItineraryFeasible } from '../utils/itineraryFeasibility';
import { applyDelaysToItinerary } from './tripDelayService';
import { getTransitRideLegsWithIndexes } from '../utils/routeContinuity';

const isWalkLeg = (leg) => String(leg?.mode).toUpperCase() === 'WALK';

const hasStreetWalkingDetails = (leg) => (
  Boolean(leg?.legGeometry?.points) &&
  Array.isArray(leg?.steps) &&
  leg.steps.length > 0
);

const needsWalkingPreparation = (itinerary) => (
  Array.isArray(itinerary?.legs) &&
  itinerary.legs.some((leg) => isWalkLeg(leg) && !hasStreetWalkingDetails(leg))
);

export const prepareItineraryForNavigation = async (itinerary) => {
  let prepared = itinerary;
  if (needsWalkingPreparation(itinerary)) {
    try {
      prepared = await enrichItineraryWithWalking(itinerary);
    } catch (error) {
      logger.warn('Could not prepare walking directions before navigation, using selected itinerary:', error);
    }
  }
  if (prepared?.legs?.some((leg) => !isWalkLeg(leg) && leg.tripId)) {
    // Refresh after walking preparation; a preview may have been open for minutes.
    // Failed refreshes revert to the timetable rather than retaining stale live times.
    prepared = await applyDelaysToItinerary(prepared);
  }
  if (getTransitRideLegsWithIndexes(prepared?.legs || []).length > 0) {
    return { ...prepared, navigationStartCheckedAt: Date.now() };
  }
  return prepared;
};

export const recalculateNavigationItinerary = async ({
  userLocation,
  destination,
  ensureRoutingData,
  onDemandZones,
  stops,
}) => {
  if (!userLocation?.latitude || !userLocation?.longitude || !destination?.lat || !destination?.lon) {
    throw new TripPlanningError(
      TRIP_ERROR_CODES.VALIDATION_ERROR,
      'Current location or destination is unavailable for rerouting.'
    );
  }

  let routingData = null;
  if (typeof ensureRoutingData === 'function') {
    try {
      routingData = await ensureRoutingData();
    } catch (error) {
      logger.warn('Reroute could not build local routing data, continuing with fallback routing:', error);
    }
  }

  const result = await planTripAuto({
    fromLat: userLocation.latitude,
    fromLon: userLocation.longitude,
    toLat: destination.lat,
    toLon: destination.lon,
    date: new Date(),
    time: new Date(),
    arriveBy: false,
    routingData,
    enrichWalking: true,
    onDemandZones,
    stops,
  });

  const nextItinerary = result?.itineraries?.[0];
  if (!nextItinerary) {
    throw new TripPlanningError(
      TRIP_ERROR_CODES.NO_ROUTES_FOUND,
      'No updated route was available from your current location.'
    );
  }

  const enrichedItinerary = await enrichItineraryWithWalking(nextItinerary);
  if (!isItineraryFeasible(enrichedItinerary)) {
    throw new TripPlanningError(TRIP_ERROR_CODES.NO_ROUTES_FOUND, 'Updated walking times do not leave a feasible connection. Re-plan for another trip.');
  }
  return {
    itinerary: {
      ...enrichedItinerary,
      rerouteMetadata: {
        recalculatedAt: Date.now(),
        fromLat: userLocation.latitude,
        fromLon: userLocation.longitude,
      },
    },
    routingDiagnostics: result.routingDiagnostics || null,
  };
};

export default recalculateNavigationItinerary;
