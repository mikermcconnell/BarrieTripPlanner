import { useCallback, useEffect } from 'react';
import { collectItineraryViewportCoordinates } from '../utils/itineraryViewport';

export const useTripPreviewViewport = ({
  isFocused,
  isTripPlanningMode,
  fitToCoordinates,
  edgePadding,
  animated,
  onBlurInactive,
}) => {
  const fitMapToItinerary = useCallback((itinerary) => {
    if (typeof fitToCoordinates !== 'function') {
      return false;
    }

    const coordinates = collectItineraryViewportCoordinates(itinerary);
    if (coordinates.length === 0) {
      return false;
    }

    const options = { edgePadding };
    if (typeof animated === 'boolean') {
      options.animated = animated;
    }

    fitToCoordinates(coordinates, options);
    return true;
  }, [animated, edgePadding, fitToCoordinates]);

  useEffect(() => {
    if (!isFocused && isTripPlanningMode) {
      onBlurInactive?.();
    }
  }, [isFocused, isTripPlanningMode, onBlurInactive]);

  return {
    fitMapToItinerary,
  };
};

export default useTripPreviewViewport;
