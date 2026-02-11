export const DEFAULT_SELECTED_LOCATION_LABEL = 'Selected location';

export const buildSelectedStopParams = (stop) => ({
  selectedStopId: stop?.id,
});

export const buildSelectedRouteParams = (route) => ({
  selectedRouteId: route?.id,
});

export const buildSelectedAddressParams = (address) => ({
  selectedCoordinate: {
    latitude: address?.lat,
    longitude: address?.lon,
  },
  selectedAddressLabel:
    address?.shortName || address?.displayName || DEFAULT_SELECTED_LOCATION_LABEL,
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
