import { useCallback, useEffect } from 'react';
import { collectTripPreviewViewportCoordinates } from '../utils/itineraryViewport';

export const useTripPreviewViewport = ({
  isFocused,
  isTripPlanningMode,
  fitToCoordinates,
  edgePadding,
  animated,
  onBlurInactive,
  resetOnBlur = false,
}) => {
  const fitMapToItinerary = useCallback((itinerary, extraCoordinates = []) => {
    if (typeof fitToCoordinates !== 'function') {
      return false;
    }

    const coordinates = collectTripPreviewViewportCoordinates(itinerary, [
      { id: 'extra-preview-coordinates', coordinates: extraCoordinates },
    ]);
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
    if (resetOnBlur && !isFocused && isTripPlanningMode) {
      onBlurInactive?.();
    }
  }, [isFocused, isTripPlanningMode, onBlurInactive, resetOnBlur]);

  return {
    fitMapToItinerary,
  };
};

export default useTripPreviewViewport;
