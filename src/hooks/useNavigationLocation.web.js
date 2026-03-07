import { useState, useEffect, useCallback, useRef } from 'react';
import logger from '../utils/logger';

export const useNavigationLocation = () => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef(null);

  const startTracking = useCallback(async () => {
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return false;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            heading: position.coords.heading,
            accuracy: position.coords.accuracy,
          });

          watchIdRef.current = navigator.geolocation.watchPosition(
            (nextPosition) => {
              setLocation({
                latitude: nextPosition.coords.latitude,
                longitude: nextPosition.coords.longitude,
                heading: nextPosition.coords.heading,
                accuracy: nextPosition.coords.accuracy,
              });
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
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
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
