import { useCallback, useEffect, useRef } from 'react';
import { collectItineraryViewportCoordinates } from '../utils/itineraryViewport';

export const useTripPreviewViewport = ({
  isFocused,
  isTripPlanningMode,
  itineraries,
  selectedItineraryIndex,
  fitToCoordinates,
  edgePadding,
  animated,
  onBlurInactive,
}) => {
  const tripZoomedRef = useRef(false);

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

  useEffect(() => {
    tripZoomedRef.current = false;
  }, [selectedItineraryIndex, itineraries]);

  useEffect(() => {
    if (!isTripPlanningMode || itineraries.length === 0) {
      tripZoomedRef.current = false;
      return;
    }

    if (tripZoomedRef.current) {
      return;
    }

    const itinerary = itineraries[selectedItineraryIndex];
    if (itinerary && fitMapToItinerary(itinerary)) {
      tripZoomedRef.current = true;
    }
  }, [fitMapToItinerary, isTripPlanningMode, itineraries, selectedItineraryIndex]);

  return {
    fitMapToItinerary,
    resetTripPreviewZoom: () => {
      tripZoomedRef.current = false;
    },
  };
};

export default useTripPreviewViewport;
