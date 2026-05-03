export const startTripToDestination = ({
  destination,
  label = 'Selected location',
  beforeEnter,
  enterPlanningMode,
  setTripTo,
}) => {
  if (!destination) return;

  beforeEnter?.();
  enterPlanningMode?.();
  setTripTo?.(destination, label);
};

export default startTripToDestination;
