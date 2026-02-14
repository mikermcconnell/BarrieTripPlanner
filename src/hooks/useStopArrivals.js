/**
 * useStopArrivals Hook
 *
 * Fetches and auto-refreshes arrival times for a given stop.
 * Shared between native and web StopBottomSheet components.
 */
import { useState, useCallback, useEffect } from 'react';
import { useTransit } from '../context/TransitContext';
import { fetchTripUpdates, getArrivalsForStop } from '../services/arrivalService';

export const useStopArrivals = (stop) => {
  const { routes, tripMapping } = useTransit();
  const [arrivals, setArrivals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadArrivals = useCallback(async () => {
    if (!stop) return;

    setIsLoading(true);
    setError(null);

    try {
      const tripUpdates = await fetchTripUpdates();
      const stopArrivals = getArrivalsForStop(tripUpdates, stop.id, routes, tripMapping);
      setArrivals(stopArrivals);
    } catch (err) {
      console.error('Error loading arrivals:', err);
      setError('Unable to load arrival times');
    } finally {
      setIsLoading(false);
    }
  }, [stop, routes, tripMapping]);

  useEffect(() => {
    loadArrivals();

    // Refresh every 30 seconds
    const interval = setInterval(loadArrivals, 30000);
    return () => clearInterval(interval);
  }, [loadArrivals]);

  return { arrivals, isLoading, error, loadArrivals };
};
