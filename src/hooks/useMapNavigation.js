/**
 * useMapNavigation Hook
 *
 * Handles navigation parameter effects for the HomeScreen map.
 * Responds to selectedStopId, selectedRouteId, selectedCoordinate,
 * and exitTripPlanning navigation params.
 *
 * Shared between native and web HomeScreens.
 */
import { useEffect } from 'react';
import { getSelectedAddressFromParams, normalizeSelectedRouteId } from '../utils/mapSelection';

export const useMapNavigation = ({
  route,
  navigation,
  stops,
  mapRef,
  selectRoute,
  resetTrip,
  setSelectedStop,
  setShowStops,
  hasSelection,
  showLocation,
}) => {
  // Handle selected stop from navigation params
  useEffect(() => {
    if (route?.params?.selectedStopId) {
      const stop = stops.find((s) => s.id === route.params.selectedStopId);
      if (stop) {
        setSelectedStop(stop);
        mapRef.current?.animateToRegion(
          {
            latitude: stop.latitude,
            longitude: stop.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          500
        );
      }
    }
  }, [route?.params?.selectedStopId, stops]);

  // Handle selected route from navigation params
  useEffect(() => {
    const routeId = normalizeSelectedRouteId(route?.params);
    if (!routeId) return;

    selectRoute(routeId);
    setShowStops(true);
    navigation.setParams({ selectedRouteId: undefined });
  }, [route?.params?.selectedRouteId, navigation]);

  // Handle selected address/coordinate from navigation params
  useEffect(() => {
    const selectedAddress = getSelectedAddressFromParams(route?.params);
    if (!selectedAddress) return;
    const { coordinate, label } = selectedAddress;

    setSelectedStop(null);
    showLocation(coordinate, label);

    mapRef.current?.animateToRegion(
      {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      500
    );

    navigation.setParams({
      selectedCoordinate: undefined,
      selectedAddressLabel: undefined,
    });
  }, [route?.params?.selectedCoordinate, route?.params?.selectedAddressLabel, navigation]);

  // Handle exit from navigation - reset trip planning mode
  useEffect(() => {
    if (route?.params?.exitTripPlanning) {
      resetTrip();
      navigation.setParams({ exitTripPlanning: undefined });
    }
  }, [route?.params?.exitTripPlanning, navigation, resetTrip]);

  // Auto-enable stops when routes are selected
  useEffect(() => {
    if (hasSelection) {
      setShowStops(true);
    }
  }, [hasSelection]);
};
