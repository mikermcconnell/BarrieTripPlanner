/**
 * useMapNavigation Hook
 *
 * Handles navigation parameter effects for the HomeScreen map.
 * Responds to selectedStopId, selectedRouteId, selectedCoordinate,
 * and exitTripPlanning navigation params.
 *
 * Shared between native and web HomeScreens.
 */
import { useEffect, useRef } from 'react';
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
  const consumedStopRequestRef = useRef(null);
  const consumedRouteRequestRef = useRef(null);
  const consumedAddressRequestRef = useRef(null);

  // Handle selected stop from navigation params
  useEffect(() => {
    const selectedStopId = route?.params?.selectedStopId;
    if (!selectedStopId) {
      consumedStopRequestRef.current = null;
      return;
    }

    if (consumedStopRequestRef.current !== selectedStopId) {
      const stop = stops.find((s) => s.id === selectedStopId);
      if (stop) {
        consumedStopRequestRef.current = selectedStopId;
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
        navigation.setParams({ selectedStopId: undefined });
      }
    }
  }, [route?.params?.selectedStopId, stops, navigation]);

  // Handle selected route from navigation params
  useEffect(() => {
    const routeId = normalizeSelectedRouteId(route?.params);
    if (!routeId) {
      consumedRouteRequestRef.current = null;
      return;
    }
    if (consumedRouteRequestRef.current === routeId) return;

    consumedRouteRequestRef.current = routeId;
    selectRoute(routeId);
    setShowStops(true);
    navigation.setParams({ selectedRouteId: undefined });
  }, [route?.params?.selectedRouteId, navigation]);

  // Handle selected address/coordinate from navigation params
  useEffect(() => {
    const selectedAddress = getSelectedAddressFromParams(route?.params);
    if (!selectedAddress) {
      consumedAddressRequestRef.current = null;
      return;
    }
    const { coordinate, label } = selectedAddress;
    const requestKey = `${coordinate.latitude}:${coordinate.longitude}:${label || ''}`;
    if (consumedAddressRequestRef.current === requestKey) return;

    consumedAddressRequestRef.current = requestKey;
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
