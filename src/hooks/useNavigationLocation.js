/**
 * useNavigationLocation Hook
 *
 * Continuous high-accuracy location tracking for turn-by-turn navigation.
 * Uses expo-location watchPositionAsync for real-time updates.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import logger from '../utils/logger';
import { haversineDistance } from '../utils/geometryUtils';

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
  const lastLocationRef = useRef(null);

  const buildLocationPayload = useCallback((coords, timestamp) => {
    let speed = Number.isFinite(coords?.speed) && coords.speed >= 0 ? coords.speed : null;
    const previous = lastLocationRef.current;

    if (
      speed == null &&
      previous &&
      Number.isFinite(timestamp) &&
      Number.isFinite(previous.timestamp) &&
      timestamp > previous.timestamp
    ) {
      const elapsedSeconds = (timestamp - previous.timestamp) / 1000;
      if (elapsedSeconds >= 1) {
        const distanceMeters = haversineDistance(
          previous.latitude,
          previous.longitude,
          coords.latitude,
          coords.longitude
        );
        const derivedSpeed = distanceMeters / elapsedSeconds;
        if (Number.isFinite(derivedSpeed) && derivedSpeed >= 0 && derivedSpeed <= 25) {
          speed = derivedSpeed;
        }
      }
    }

    const payload = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      heading: coords.heading,
      accuracy: coords.accuracy,
      speed,
      timestamp,
    };

    lastLocationRef.current = payload;
    return payload;
  }, []);

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

      setLocation(buildLocationPayload(initialLocation.coords, initialLocation.timestamp));

      // Start watching for location updates
      subscriptionRef.current = await Location.watchPositionAsync(
        LOCATION_CONFIG,
        (newLocation) => {
          setLocation(buildLocationPayload(newLocation.coords, newLocation.timestamp));
        }
      );

      setIsTracking(true);
      return true;
    } catch (err) {
      logger.error('Error starting location tracking:', err);
      setError(err.message || 'Failed to start location tracking');
      return false;
    }
  }, [buildLocationPayload]);

  const stopTracking = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    lastLocationRef.current = null;
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
