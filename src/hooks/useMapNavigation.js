/**
 * useMapNavigation Hook
 *
 * Handles navigation parameter effects for the HomeScreen map.
 * Selections update map content and details without moving the camera.
 *
 * Shared between native and web HomeScreens.
 */
import { useEffect, useRef } from 'react';
import { getSelectedAddressFromParams, normalizeSelectedRouteId } from '../utils/mapSelection';

const consumedMapFocusRequests = new Set();
const MAX_CONSUMED_MAP_FOCUS_REQUESTS = 256;

const claimMapFocusRequest = (requestId) => {
  if (consumedMapFocusRequests.has(requestId)) return false;

  consumedMapFocusRequests.add(requestId);
  while (consumedMapFocusRequests.size > MAX_CONSUMED_MAP_FOCUS_REQUESTS) {
    const oldestRequestId = consumedMapFocusRequests.values().next().value;
    consumedMapFocusRequests.delete(oldestRequestId);
  }
  return true;
};

export const __TEST_ONLY__ = {
  claimMapFocusRequest,
  getConsumedMapFocusRequestCount: () => consumedMapFocusRequests.size,
  resetConsumedMapFocusRequests: () => consumedMapFocusRequests.clear(),
};

export const useMapNavigation = ({
  route,
  navigation,
  stops,
  selectRoute,
  resetTrip,
  setSelectedStop,
  setShowStops,
  hasSelection,
  showLocation,
}) => {
  const consumedRouteRequestRef = useRef(null);

  // Handle selected stop from navigation params
  useEffect(() => {
    const selectedStopId = route?.params?.selectedStopId;
    if (!selectedStopId) return;

    const focusRequestId = route?.params?.selectedStopFocusRequestId ||
      `legacy-stop-focus:${selectedStopId}`;
    const stop = stops.find((candidate) => candidate.id === selectedStopId);
    if (!stop) return;

    if (claimMapFocusRequest(focusRequestId)) {
      setSelectedStop(stop);
    }

    navigation.setParams({
      selectedStopId: undefined,
      selectedStopFocusRequestId: undefined,
    });
  }, [
    route?.params?.selectedStopId,
    route?.params?.selectedStopFocusRequestId,
    stops,
    navigation,
  ]);

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
    if (!selectedAddress) return;

    const { coordinate, label } = selectedAddress;
    const focusRequestId = route?.params?.selectedAddressFocusRequestId ||
      `legacy-address-focus:${coordinate.latitude}:${coordinate.longitude}:${label || ''}`;

    if (claimMapFocusRequest(focusRequestId)) {
      setSelectedStop(null);
      showLocation(coordinate, label);
    }

    navigation.setParams({
      selectedCoordinate: undefined,
      selectedAddressLabel: undefined,
      selectedAddressFocusRequestId: undefined,
    });
  }, [
    route?.params?.selectedCoordinate,
    route?.params?.selectedAddressLabel,
    route?.params?.selectedAddressFocusRequestId,
    navigation,
  ]);

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
