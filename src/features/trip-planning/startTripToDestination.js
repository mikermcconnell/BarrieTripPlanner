export const startTripToDestination = ({
  destination,
  label = 'Selected location',
  beforeEnter,
  enterPlanningMode,
  setTripFrom,
  setTripTo,
  useCurrentLocationForTrip,
}) => {
  if (!destination) return;

  beforeEnter?.();
  enterPlanningMode?.();
  if (useCurrentLocationForTrip) {
    setTripFrom?.(null, 'Current Location');
    setTripTo?.(destination, label, { suppressAutoSearch: true });
    useCurrentLocationForTrip(destination);
    return;
  }

  setTripTo?.(destination, label);
};

export default startTripToDestination;
