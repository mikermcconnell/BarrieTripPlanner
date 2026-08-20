/**
 * useStopArrivals Hook
 *
 * Fetches and auto-refreshes arrival times for a given stop.
 * Shared between native and web StopBottomSheet components.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useTransitStatic } from '../context/TransitContext';
import { fetchTripUpdates, getArrivalsForStop } from '../services/arrivalService';
import logger from '../utils/logger';

const reportedDestinationFailures = new Set();
const attemptedDestinationRefreshes = new Set();

const getDestinationRefreshKey = (arrival, stopId) =>
  arrival.tripId || `${arrival.routeId || 'missing-route-id'}:${stopId || 'missing-stop-id'}`;

export const useStopArrivals = (stop, options = {}) => {
  const { initialDelayMs = 0 } = options;
  const {
    routes,
    tripMapping,
    isLoadingStatic,
    isRefreshingStatic,
    loadStaticData,
  } = useTransitStatic();
  const [arrivals, setArrivals] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(stop));
  const [error, setError] = useState(null);
  const requestSeqRef = useRef(0);

  const loadArrivals = useCallback(async () => {
    const requestSeq = ++requestSeqRef.current;
    if (!stop) {
      setArrivals([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const tripUpdates = await fetchTripUpdates();
      if (requestSeq !== requestSeqRef.current) return;
      const resolvedArrivals = getArrivalsForStop(tripUpdates, stop.id, routes, tripMapping);
      const unresolvedArrivals = resolvedArrivals.filter(
        (arrival) => arrival.destinationStatus !== 'available'
      );
      const staticRefreshInProgress = Boolean(isLoadingStatic || isRefreshingStatic);

      resolvedArrivals.forEach((arrival) => {
        if (arrival.destinationStatus === 'available') {
          attemptedDestinationRefreshes.delete(getDestinationRefreshKey(arrival, stop.id));
        }
      });

      if (staticRefreshInProgress) {
        unresolvedArrivals.forEach((arrival) => {
          attemptedDestinationRefreshes.add(getDestinationRefreshKey(arrival, stop.id));
        });
      }

      const shouldRefreshStatic = !staticRefreshInProgress && unresolvedArrivals.some(
        (arrival) => !attemptedDestinationRefreshes.has(getDestinationRefreshKey(arrival, stop.id))
      );

      if (shouldRefreshStatic) {
        unresolvedArrivals.forEach((arrival) => {
          attemptedDestinationRefreshes.add(getDestinationRefreshKey(arrival, stop.id));
        });
      }

      const stopArrivals = resolvedArrivals
        .map((arrival) => ({
          ...arrival,
          isDestinationUpdating:
            arrival.destinationStatus !== 'available' &&
            (staticRefreshInProgress || shouldRefreshStatic),
        }));

      stopArrivals.forEach((arrival) => {
        if (arrival.destinationStatus === 'available' || arrival.isDestinationUpdating) {
          return;
        }

        const diagnosticKey = `${arrival.destinationStatus}:${arrival.tripId || 'missing-trip-id'}`;
        if (reportedDestinationFailures.has(diagnosticKey)) return;
        reportedDestinationFailures.add(diagnosticKey);

        logger.error(new Error(
          `Arrival destination unavailable (${arrival.destinationStatus}) for trip ${arrival.tripId || 'missing-trip-id'}, route ${arrival.routeId || 'missing-route-id'}, stop ${stop.id || 'missing-stop-id'}`
        ));
      });

      setArrivals(stopArrivals);

      if (shouldRefreshStatic) {
        void Promise.resolve(loadStaticData()).catch((refreshError) => {
          logger.error('Failed to refresh static data for an unresolved arrival destination:', refreshError);
        });
      }
    } catch (err) {
      if (requestSeq !== requestSeqRef.current) return;
      console.error('Error loading arrivals:', err);
      setError('Unable to load arrival times');
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    stop,
    routes,
    tripMapping,
    isLoadingStatic,
    isRefreshingStatic,
    loadStaticData,
  ]);

  useEffect(() => {
    if (!stop) {
      setArrivals([]);
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);
    const timeout = setTimeout(loadArrivals, Math.max(0, initialDelayMs));

    // Refresh every 30 seconds
    const interval = setInterval(loadArrivals, 30000);
    return () => {
      requestSeqRef.current += 1;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [initialDelayMs, loadArrivals, stop]);

  return { arrivals, isLoading, error, loadArrivals };
};
