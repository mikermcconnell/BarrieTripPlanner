import { TripPlanningError, TRIP_ERROR_CODES, planTripAuto } from './tripService';
import { enrichItineraryWithWalking } from './walkingService';
import logger from '../utils/logger';

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
    enrichWalking: false,
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
