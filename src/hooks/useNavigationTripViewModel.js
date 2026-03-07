import { useMemo } from 'react';
import { buildNavigationTripViewModel } from '../utils/navigationTripViewModel';

export const useNavigationTripViewModel = ({
  itinerary,
  currentLegIndex,
  currentLeg,
  distanceToDestination,
}) =>
  useMemo(
    () =>
      buildNavigationTripViewModel({
        itinerary,
        currentLegIndex,
        currentLeg,
        distanceToDestination,
      }),
    [currentLeg, currentLegIndex, distanceToDestination, itinerary]
  );

export default useNavigationTripViewModel;
