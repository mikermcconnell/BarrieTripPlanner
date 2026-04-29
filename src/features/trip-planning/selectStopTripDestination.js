import { startTripToDestination } from './startTripToDestination';

export const selectStopTripDestination = ({
  stopInfo,
  isTripPlanningMode = false,
  tripFromLocation = null,
  setSelectedStop,
  enterPlanningMode,
  setTripFrom,
  setTripTo,
  useCurrentLocationForTrip,
}) => {
  if (!stopInfo) return;

  const destination = { lat: stopInfo.lat, lon: stopInfo.lon };
  const label = stopInfo.name || 'Selected stop';

  if (isTripPlanningMode || tripFromLocation) {
    setSelectedStop?.(null);
    enterPlanningMode?.();
    setTripTo?.(destination, label);
    return;
  }

  startTripToDestination({
    destination,
    label,
    beforeEnter: () => setSelectedStop?.(null),
    enterPlanningMode,
    setTripFrom,
    setTripTo,
    useCurrentLocationForTrip,
  });
};

export default selectStopTripDestination;
