import { getRouteStopSequence } from './gtfsStopSequences';

const ON_TIME_THRESHOLD_SECONDS = 60;

const getStopName = (stopsById, stopId) => stopsById.get(String(stopId))?.name || null;

const getNextStop = (vehicle, routeStopsMapping, routeStopSequencesMapping) => {
  if (!vehicle?.stopId) return { stopId: null, stopSequence: null };

  // GTFS-RT identifies the stop a vehicle is travelling toward with IN_TRANSIT_TO.
  if (Number(vehicle.currentStatus) === 2) {
    return { stopId: vehicle.stopId, stopSequence: vehicle.currentStopSequence ?? null };
  }

  const stopSequence = getRouteStopSequence({
    routeId: vehicle.routeId,
    shapeId: vehicle.shapeId,
    routeStopsMapping,
    routeStopSequencesMapping,
  });
  const currentIndex = stopSequence?.findIndex((stopId) => String(stopId) === String(vehicle.stopId));

  return {
    stopId: currentIndex >= 0 ? stopSequence[currentIndex + 1] || null : null,
    stopSequence: Number.isFinite(Number(vehicle.currentStopSequence))
      ? Number(vehicle.currentStopSequence) + 1
      : null,
  };
};

const getScheduleStatus = (tripUpdate, nextStop) => {
  if ((!nextStop?.stopId && nextStop?.stopSequence == null) || !tripUpdate?.stopTimeUpdates?.length) return null;

  const stopUpdate = tripUpdate.stopTimeUpdates.find(
    (update) => (
      (nextStop.stopId && String(update.stopId) === String(nextStop.stopId)) ||
      (nextStop.stopSequence != null && Number(update.stopSequence) === Number(nextStop.stopSequence))
    )
  );
  const delay = stopUpdate?.departure?.delay ?? stopUpdate?.arrival?.delay;
  if (!Number.isFinite(delay)) return null;

  if (delay > ON_TIME_THRESHOLD_SECONDS) return `Late · ${Math.ceil(delay / 60)} min`;
  if (delay < -ON_TIME_THRESHOLD_SECONDS) return `Early · ${Math.ceil(Math.abs(delay) / 60)} min`;
  return 'On time';
};

export const getVehicleQuickDetails = ({
  vehicle,
  stops = [],
  routeStopsMapping,
  routeStopSequencesMapping,
  tripUpdate,
}) => {
  const stopsById = new Map(stops.map((stop) => [String(stop.id), stop]));
  const nextStop = getNextStop(vehicle, routeStopsMapping, routeStopSequencesMapping);

  return {
    busIdentifier: vehicle?.vehicleLabel || vehicle?.id || null,
    nextStopName: getStopName(stopsById, nextStop.stopId),
    scheduleStatus: getScheduleStatus(tripUpdate, nextStop),
  };
};
