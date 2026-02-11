/**
 * useNavigationLocation Hook
 *
 * Continuous high-accuracy location tracking for turn-by-turn navigation.
 * Uses expo-location watchPositionAsync for real-time updates.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

const LOCATION_CONFIG = {
  accuracy: Location.Accuracy.High,
  distanceInterval: 10, // Update every 10 meters
  timeInterval: 3000, // Or every 3 seconds
};

export const useNavigationLocation = () => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const subscriptionRef = useRef(null);

  const startTracking = useCallback(async () => {
    setError(null);

    try {
      // Request permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission is required for navigation');
        return false;
      }

      // Get initial location immediately
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: initialLocation.coords.latitude,
        longitude: initialLocation.coords.longitude,
        heading: initialLocation.coords.heading,
        accuracy: initialLocation.coords.accuracy,
        timestamp: initialLocation.timestamp,
      });

      // Start watching for location updates
      subscriptionRef.current = await Location.watchPositionAsync(
        LOCATION_CONFIG,
        (newLocation) => {
          setLocation({
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
            heading: newLocation.coords.heading,
            accuracy: newLocation.coords.accuracy,
            timestamp: newLocation.timestamp,
          });
        }
      );

      setIsTracking(true);
      return true;
    } catch (err) {
      console.error('Error starting location tracking:', err);
      setError(err.message || 'Failed to start location tracking');
      return false;
    }
  }, []);

  const stopTracking = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    setIsTracking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }
    };
  }, []);

  return {
    location,
    error,
    isTracking,
    startTracking,
    stopTracking,
  };
};

export default useNavigationLocation;
