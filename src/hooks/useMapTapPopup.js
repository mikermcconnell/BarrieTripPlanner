/**
 * useMapTapPopup Hook
 *
 * Manages the "tap map to get address" popup state and handlers.
 * Shared between native and web HomeScreens.
 */
import { useState, useCallback } from 'react';
import { reverseGeocode } from '../services/locationIQService';

export const useMapTapPopup = ({
  enterPlanningMode,
  setTripFrom,
  setTripTo,
  onMapTap,
}) => {
  const [mapTapLocation, setMapTapLocation] = useState(null);
  const [mapTapAddress, setMapTapAddress] = useState('');
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);

  // Reverse geocode a map tap coordinate
  const handleMapPress = useCallback(async (event) => {
    const { coordinate } = event.nativeEvent;
    setMapTapLocation(coordinate);
    setMapTapAddress('');
    setIsLoadingAddress(true);

    // Optional side effect (e.g., clear selected stop)
    onMapTap?.();

    try {
      const result = await reverseGeocode(coordinate.latitude, coordinate.longitude);
      setMapTapAddress(result?.shortName || 'Selected location');
    } catch {
      setMapTapAddress('Selected location');
    } finally {
      setIsLoadingAddress(false);
    }
  }, [onMapTap]);

  // Use tapped location as trip origin
  const handleDirectionsFrom = useCallback(() => {
    if (!mapTapLocation) return;
    enterPlanningMode();
    setTripFrom(
      { lat: mapTapLocation.latitude, lon: mapTapLocation.longitude },
      mapTapAddress || 'Selected location'
    );
    setMapTapLocation(null);
    setMapTapAddress('');
  }, [mapTapLocation, mapTapAddress, enterPlanningMode, setTripFrom]);

  // Use tapped location as trip destination
  const handleDirectionsTo = useCallback(() => {
    if (!mapTapLocation) return;
    enterPlanningMode();
    setTripTo(
      { lat: mapTapLocation.latitude, lon: mapTapLocation.longitude },
      mapTapAddress || 'Selected location'
    );
    setMapTapLocation(null);
    setMapTapAddress('');
  }, [mapTapLocation, mapTapAddress, enterPlanningMode, setTripTo]);

  // Show a location popup at a specific coordinate with a label
  // (used by navigation param effects to display a pre-geocoded address)
  const showLocation = useCallback((coordinate, label) => {
    setMapTapLocation({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    });
    setMapTapAddress(label || 'Selected location');
    setIsLoadingAddress(false);
  }, []);

  // Dismiss the popup
  const closeMapTapPopup = useCallback(() => {
    setMapTapLocation(null);
    setMapTapAddress('');
  }, []);

  return {
    mapTapLocation,
    mapTapAddress,
    isLoadingAddress,
    handleMapPress,
    handleDirectionsFrom,
    handleDirectionsTo,
    closeMapTapPopup,
    showLocation,
  };
};
