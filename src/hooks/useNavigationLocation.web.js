import { useState, useEffect, useCallback, useRef } from 'react';
import logger from '../utils/logger';
import { haversineDistance } from '../utils/geometryUtils';

export const useNavigationLocation = () => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef(null);
  const lastLocationRef = useRef(null);

  const buildLocationPayload = useCallback((coords, timestamp = Date.now()) => {
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

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return false;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation(buildLocationPayload(position.coords, position.timestamp));

          watchIdRef.current = navigator.geolocation.watchPosition(
            (nextPosition) => {
              setLocation(buildLocationPayload(nextPosition.coords, nextPosition.timestamp));
            },
            (watchError) => {
              logger.warn('Location watch error:', watchError);
            },
            {
              enableHighAccuracy: true,
              maximumAge: 10000,
              timeout: 5000,
            }
          );

          setIsTracking(true);
          resolve(true);
        },
        (positionError) => {
          setError(positionError.message);
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
        }
      );
    });
  }, [buildLocationPayload]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    lastLocationRef.current = null;
    setIsTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { location, error, isTracking, startTracking, stopTracking };
};

export default useNavigationLocation;
