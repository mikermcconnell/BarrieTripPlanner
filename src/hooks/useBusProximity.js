/**
 * useBusProximity Hook
 *
 * Matches real-time vehicle positions to the current transit leg's tripId
 * and calculates how many stops away the bus is from the boarding stop.
 * Also tracks user's position during the ride to alert when to get off.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTransit } from '../context/TransitContext';

// Haversine distance calculation in meters
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Threshold for considering arrival at a stop (meters)
const STOP_ARRIVAL_THRESHOLD = 50;

export const useBusProximity = (transitLeg, isActive = true, userLocation = null, isUserOnBoard = false) => {
  const { vehicles, loadVehiclePositions } = useTransit();
  const [proximity, setProximity] = useState({
    vehicle: null,
    stopsAway: null,
    stopsUntilAlighting: null,
    estimatedArrival: null,
    isApproaching: false,
    hasArrived: false,
    isTracking: false,
    shouldGetOff: false,
    nearAlightingStop: false,
  });
  const intervalRef = useRef(null);

  // Find the vehicle matching this transit leg's trip
  const findMatchingVehicle = useCallback(() => {
    if (!transitLeg || !vehicles.length) return null;

    // Try to match by tripId first (most accurate)
    const tripId = transitLeg.tripId;
    if (tripId) {
      const matchedVehicle = vehicles.find((v) => v.tripId === tripId);
      if (matchedVehicle) return matchedVehicle;
    }

    // Fallback: match by routeId and find the best candidate
    const routeId = transitLeg.route?.id || transitLeg.routeId;
    if (routeId) {
      const routeVehicles = vehicles.filter((v) => v.routeId === routeId);

      if (routeVehicles.length === 1) {
        return routeVehicles[0];
      }

      // If multiple vehicles, find the one closest to (but before) the boarding stop
      if (routeVehicles.length > 1 && transitLeg.from) {
        const boardingLat = transitLeg.from.lat;
        const boardingLon = transitLeg.from.lon;

        let bestVehicle = null;
        let bestDistance = Infinity;

        routeVehicles.forEach(v => {
          if (v.coordinate?.latitude && v.coordinate?.longitude) {
            const dist = calculateDistance(
              v.coordinate.latitude,
              v.coordinate.longitude,
              boardingLat,
              boardingLon
            );
            if (dist < bestDistance) {
              bestDistance = dist;
              bestVehicle = v;
            }
          }
        });

        return bestVehicle;
      }
    }

    return null;
  }, [transitLeg, vehicles]);

  // Build the complete stop sequence for this leg
  const getStopSequence = useCallback((leg) => {
    if (!leg) return [];

    const stops = [];

    // Add boarding stop
    if (leg.from) {
      stops.push({
        id: leg.from.stopId || 'boarding',
        name: leg.from.name,
        lat: leg.from.lat,
        lon: leg.from.lon,
        type: 'boarding',
      });
    }

    // Add intermediate stops
    if (leg.intermediateStops) {
      leg.intermediateStops.forEach((stop, idx) => {
        stops.push({
          id: stop.stopId || `intermediate-${idx}`,
          name: stop.name,
          lat: stop.lat,
          lon: stop.lon,
          type: 'intermediate',
        });
      });
    }

    // Add alighting stop
    if (leg.to) {
      stops.push({
        id: leg.to.stopId || 'alighting',
        name: leg.to.name,
        lat: leg.to.lat,
        lon: leg.to.lon,
        type: 'alighting',
      });
    }

    return stops;
  }, []);

  // Calculate how many stops away the vehicle is from boarding stop
  const calculateStopsAwayFromBoarding = useCallback((vehicle, stopSequence) => {
    if (!vehicle || stopSequence.length === 0) return null;

    const vehicleLat = vehicle.coordinate?.latitude;
    const vehicleLon = vehicle.coordinate?.longitude;

    if (!vehicleLat || !vehicleLon) return null;

    // Find which stop the vehicle is closest to
    let closestStopIndex = -1;
    let minDistance = Infinity;

    stopSequence.forEach((stop, index) => {
      const dist = calculateDistance(vehicleLat, vehicleLon, stop.lat, stop.lon);
      if (dist < minDistance) {
        minDistance = dist;
        closestStopIndex = index;
      }
    });

    // Boarding stop is at index 0
    // If vehicle is at or past boarding stop, return 0
    // Otherwise return number of stops until boarding
    if (closestStopIndex <= 0) {
      // Vehicle is at or before boarding stop
      // Estimate based on distance if very close
      if (minDistance < STOP_ARRIVAL_THRESHOLD) {
        return 0; // At the stop
      }
      return Math.max(1, Math.ceil(minDistance / 500)); // Rough estimate: 1 stop per 500m
    }

    // Vehicle has passed the boarding stop - return 0 (arrived or missed)
    return 0;
  }, []);

  // Calculate stops until user should get off (when on board)
  const calculateStopsUntilAlighting = useCallback((userLoc, stopSequence) => {
    if (!userLoc || stopSequence.length < 2) return null;

    const alightingStop = stopSequence[stopSequence.length - 1];

    // Find which stop user is closest to
    let closestStopIndex = 0;
    let minDistance = Infinity;

    stopSequence.forEach((stop, index) => {
      const dist = calculateDistance(userLoc.latitude, userLoc.longitude, stop.lat, stop.lon);
      if (dist < minDistance) {
        minDistance = dist;
        closestStopIndex = index;
      }
    });

    // Calculate remaining stops
    const stopsRemaining = stopSequence.length - 1 - closestStopIndex;

    // Check if near alighting stop
    const distToAlighting = calculateDistance(
      userLoc.latitude,
      userLoc.longitude,
      alightingStop.lat,
      alightingStop.lon
    );

    return {
      stopsRemaining: Math.max(0, stopsRemaining),
      nearAlighting: distToAlighting < STOP_ARRIVAL_THRESHOLD * 2,
      atAlighting: distToAlighting < STOP_ARRIVAL_THRESHOLD,
    };
  }, []);

  // Update proximity state
  const updateProximity = useCallback(() => {
    if (!transitLeg) {
      setProximity({
        vehicle: null,
        stopsAway: null,
        stopsUntilAlighting: null,
        estimatedArrival: null,
        isApproaching: false,
        hasArrived: false,
        isTracking: false,
        shouldGetOff: false,
        nearAlightingStop: false,
      });
      return;
    }

    const stopSequence = getStopSequence(transitLeg);
    const vehicle = findMatchingVehicle();

    // Calculate stops away from boarding (for waiting phase)
    const stopsAway = vehicle
      ? calculateStopsAwayFromBoarding(vehicle, stopSequence)
      : null;

    // Calculate stops until alighting (for on-board phase)
    let stopsUntilAlighting = null;
    let nearAlightingStop = false;
    let shouldGetOff = false;

    if (isUserOnBoard && userLocation) {
      const alightingInfo = calculateStopsUntilAlighting(userLocation, stopSequence);
      if (alightingInfo) {
        stopsUntilAlighting = alightingInfo.stopsRemaining;
        nearAlightingStop = alightingInfo.nearAlighting;
        shouldGetOff = alightingInfo.atAlighting;
      }
    }

    // Estimate arrival time based on stops away (rough: 2 min per stop)
    const estimatedArrival = stopsAway !== null && stopsAway > 0
      ? new Date(Date.now() + stopsAway * 2 * 60 * 1000)
      : null;

    // Determine if bus has arrived at boarding stop
    const hasArrived = stopsAway === 0 || (vehicle && stopsAway !== null && stopsAway <= 0);

    setProximity({
      vehicle,
      stopsAway,
      stopsUntilAlighting,
      estimatedArrival,
      isApproaching: stopsAway !== null && stopsAway > 0 && stopsAway <= 3,
      hasArrived,
      isTracking: !!vehicle,
      shouldGetOff,
      nearAlightingStop,
    });
  }, [
    transitLeg,
    findMatchingVehicle,
    getStopSequence,
    calculateStopsAwayFromBoarding,
    calculateStopsUntilAlighting,
    isUserOnBoard,
    userLocation,
  ]);

  // Set up polling for vehicle updates
  useEffect(() => {
    if (!isActive || !transitLeg) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial update
    updateProximity();

    // Poll for updates every 15 seconds (or 10 seconds if on board for better accuracy)
    const pollInterval = isUserOnBoard ? 10000 : 15000;
    intervalRef.current = setInterval(() => {
      loadVehiclePositions();
      updateProximity();
    }, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, transitLeg, isUserOnBoard, updateProximity, loadVehiclePositions]);

  // Update proximity when vehicles or user location changes
  useEffect(() => {
    if (isActive && transitLeg) {
      updateProximity();
    }
  }, [vehicles, userLocation, isActive, transitLeg, updateProximity]);

  return proximity;
};

export default useBusProximity;
