export const DEFAULT_SELECTED_LOCATION_LABEL = 'Selected location';

let mapFocusRequestSequence = 0;

export const createMapFocusRequestId = () => {
  mapFocusRequestSequence += 1;
  return `map-focus-${Date.now()}-${mapFocusRequestSequence}`;
};

export const buildSelectedStopParams = (stop, focusRequestId = createMapFocusRequestId()) => ({
  selectedStopId: stop?.id,
  selectedStopFocusRequestId: focusRequestId,
});

export const buildSelectedRouteParams = (route) => ({
  selectedRouteId: route?.id,
});

export const buildSelectedAddressParams = (address, focusRequestId = createMapFocusRequestId()) => ({
  selectedCoordinate: {
    latitude: address?.lat,
    longitude: address?.lon,
  },
  selectedAddressLabel:
    address?.shortName || address?.displayName || DEFAULT_SELECTED_LOCATION_LABEL,
  selectedAddressFocusRequestId: focusRequestId,
});

export const normalizeSelectedRouteId = (params) => {
  const selectedRouteId = params?.selectedRouteId;
  if (selectedRouteId === null || selectedRouteId === undefined || selectedRouteId === '') {
    return null;
  }

  return String(selectedRouteId);
};

export const getSelectedAddressFromParams = (params) => {
  const selectedCoordinate = params?.selectedCoordinate;
  if (!selectedCoordinate) return null;

  if (
    typeof selectedCoordinate.latitude !== 'number' ||
    typeof selectedCoordinate.longitude !== 'number'
  ) {
    return null;
  }

  return {
    coordinate: {
      latitude: selectedCoordinate.latitude,
      longitude: selectedCoordinate.longitude,
    },
    label: params?.selectedAddressLabel || DEFAULT_SELECTED_LOCATION_LABEL,
  };
};
