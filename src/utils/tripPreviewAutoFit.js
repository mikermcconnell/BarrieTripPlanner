export const getTripPreviewAutoFitKey = ({
  itinerary,
  selectedItineraryIndex = 0,
} = {}) => {
  if (!itinerary) return null;

  const legKey = Array.isArray(itinerary.legs)
    ? itinerary.legs
        .map((leg) => leg?.tripId || leg?.route?.id || leg?.route?.shortName || leg?.mode || '')
        .join('|')
    : '';

  return [
    selectedItineraryIndex,
    itinerary.startTime || '',
    itinerary.endTime || '',
    legKey,
  ].join(':');
};

export const shouldAutoFitTripPreview = ({
  isTripPreviewMode,
  selectedItinerary,
  selectedItineraryIndex = 0,
  lastFitKey = null,
  userHasMovedMap = false,
} = {}) => {
  const fitKey = getTripPreviewAutoFitKey({
    itinerary: selectedItinerary,
    selectedItineraryIndex,
  });

  if (!isTripPreviewMode || !fitKey) {
    return { shouldFit: false, fitKey };
  }

  if (lastFitKey === fitKey) {
    return { shouldFit: false, fitKey };
  }

  if (userHasMovedMap && lastFitKey === fitKey) {
    return { shouldFit: false, fitKey };
  }

  return { shouldFit: true, fitKey };
};
