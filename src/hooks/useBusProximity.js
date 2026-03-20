/**
 * useBusProximity Hook
 *
 * Matches real-time vehicle positions to the current transit leg's tripId
 * and calculates how many stops away the bus is from the boarding stop.
 * Also tracks user's position during the ride to alert when to get off.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTransitRealtime } from '../context/TransitContext';
import {
  haversineDistance,
  projectPointToPolyline,
  safeHaversineDistance as calculateDistance,
} from '../utils/geometryUtils';
import { decodePolyline } from '../utils/polylineUtils';
import { buildTransitStopSequence, findClosestTransitStopIndex } from '../utils/transitStopUtils';
import {
  evaluateAutoAlightConfidence,
  evaluateAutoBoardConfidence,
} from '../utils/navigationAutoProgress';

// Threshold for considering arrival at a stop (meters)
const STOP_ARRIVAL_THRESHOLD = 50;
const EVIDENCE_GRACE_PERIOD_MS = 4000;
const AUTO_BOARD_MIN_HITS = 2;
const AUTO_BOARD_MIN_MS = 6000;
const AUTO_ALIGHT_MIN_HITS = 2;
const AUTO_ALIGHT_MIN_MS = 5000;

const buildTransitCorridor = (transitLeg, stopSequence) => {
  const geometryPoints = transitLeg?.legGeometry?.points
    ? decodePolyline(transitLeg.legGeometry.points)
    : [];

  if (geometryPoints.length >= 2) {
    return geometryPoints;
  }

  return stopSequence
    .map((stop) => (
      Number.isFinite(stop?.lat) && Number.isFinite(stop?.lon)
        ? { latitude: stop.lat, longitude: stop.lon }
        : null
    ))
    .filter(Boolean);
};

const getProgressAlongPolylineMeters = (polyline, projection) => {
  if (!projection || !Array.isArray(polyline) || polyline.length < 2) return null;

  let distanceMeters = 0;

  for (let i = 0; i < projection.segmentIndex; i += 1) {
    distanceMeters += haversineDistance(
      polyline[i].latitude,
      polyline[i].longitude,
      polyline[i + 1].latitude,
      polyline[i + 1].longitude
    );
  }

  const segmentStart = polyline[projection.segmentIndex];
  if (!segmentStart || !projection.point) return distanceMeters;

  distanceMeters += haversineDistance(
    segmentStart.latitude,
    segmentStart.longitude,
    projection.point.latitude,
    projection.point.longitude
  );

  return distanceMeters;
};

const createEmptyProximity = () => ({
  vehicle: null,
  stopsAway: null,
  stopsUntilAlighting: null,
  estimatedArrival: null,
  isApproaching: false,
  hasArrived: false,
  isTracking: false,
  shouldGetOff: false,
  nearAlightingStop: false,
  matchQuality: 'none',
  locationAccuracy: null,
  userSpeed: null,
  userStopDistance: null,
  userVehicleDistance: null,
  userCorridorDistance: null,
  userCorridorProgress: null,
  vehicleStopDistance: null,
  vehicleCorridorDistance: null,
  vehicleCorridorProgress: null,
  autoBoardConfidence: 0,
  autoAlightConfidence: 0,
  autoBoardReady: false,
  autoAlightReady: false,
});

const updateEvidenceWindow = (ref, isActive, now, minHits, minMs) => {
  const state = ref.current;

  if (isActive) {
    if (state.startedAt == null || now - state.lastSeenAt > EVIDENCE_GRACE_PERIOD_MS) {
      ref.current = {
        startedAt: now,
        hits: 1,
        lastSeenAt: now,
      };
    } else {
      ref.current = {
        startedAt: state.startedAt,
        hits: state.hits + 1,
        lastSeenAt: now,
      };
    }
  } else if (state.startedAt != null && now - state.lastSeenAt > EVIDENCE_GRACE_PERIOD_MS) {
    ref.current = {
      startedAt: null,
      hits: 0,
      lastSeenAt: 0,
    };
  }

  return (
    isActive &&
    ref.current.startedAt != null &&
    ref.current.hits >= minHits &&
    now - ref.current.startedAt >= minMs
  );
};

export const useBusProximity = (transitLeg, isActive = true, userLocation = null, isUserOnBoard = false) => {
  const { vehicles } = useTransitRealtime();
  const [proximity, setProximity] = useState(createEmptyProximity);
  const intervalRef = useRef(null);
  // Monotonic counter: only allow stops count to decrease (prevents GPS jitter bouncing)
  const lastConfirmedStopsRef = useRef(null);
  const previousSnapshotRef = useRef(null);
  const autoBoardEvidenceRef = useRef({ startedAt: null, hits: 0, lastSeenAt: 0 });
  const autoAlightEvidenceRef = useRef({ startedAt: null, hits: 0, lastSeenAt: 0 });

  // Find the vehicle matching this transit leg's trip
  const findMatchingVehicle = useCallback(() => {
    if (!transitLeg || !vehicles.length) return { vehicle: null, matchQuality: 'none' };

    // Try to match by tripId first (most accurate)
    const tripId = transitLeg.tripId;
    if (tripId) {
      const matchedVehicle = vehicles.find((v) => v.tripId === tripId);
      if (matchedVehicle) {
        return { vehicle: matchedVehicle, matchQuality: 'trip_id' };
      }
    }

    // Fallback: match by routeId and find the best candidate
    const routeId = transitLeg.route?.id || transitLeg.routeId;
    if (routeId) {
      const routeVehicles = vehicles.filter((v) => v.routeId === routeId);

      if (routeVehicles.length === 1) {
        return { vehicle: routeVehicles[0], matchQuality: 'route_single' };
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

        return {
          vehicle: bestVehicle,
          matchQuality: bestVehicle ? 'route_nearest' : 'none',
        };
      }
    }

    return { vehicle: null, matchQuality: 'none' };
  }, [transitLeg, vehicles]);

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

    const closestStopIndex = Math.max(
      0,
      findClosestTransitStopIndex(userLoc, stopSequence)
    );

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
      setProximity(createEmptyProximity());
      previousSnapshotRef.current = null;
      return;
    }

    const stopSequence = buildTransitStopSequence(transitLeg);
    const transitCorridor = buildTransitCorridor(transitLeg, stopSequence);
    const { vehicle, matchQuality } = findMatchingVehicle();
    const boardingStop = stopSequence[0] || null;
    const alightingStop = stopSequence[stopSequence.length - 1] || null;
    const locationAccuracy = Number.isFinite(userLocation?.accuracy) ? userLocation.accuracy : null;
    const userSpeed = Number.isFinite(userLocation?.speed) ? userLocation.speed : null;

    // Calculate stops away from boarding (for waiting phase)
    const stopsAway = vehicle
      ? calculateStopsAwayFromBoarding(vehicle, stopSequence)
      : null;

    const userStopDistance =
      userLocation && boardingStop
        ? calculateDistance(userLocation.latitude, userLocation.longitude, boardingStop.lat, boardingStop.lon)
        : null;
    const vehicleStopDistance =
      vehicle && boardingStop
        ? calculateDistance(
            vehicle.coordinate?.latitude,
            vehicle.coordinate?.longitude,
            boardingStop.lat,
            boardingStop.lon
          )
        : null;
    const userVehicleDistance =
      userLocation && vehicle
        ? calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            vehicle.coordinate?.latitude,
            vehicle.coordinate?.longitude
          )
        : null;
    const distanceToAlighting =
      userLocation && alightingStop
        ? calculateDistance(userLocation.latitude, userLocation.longitude, alightingStop.lat, alightingStop.lon)
        : null;
    const userCorridorProjection =
      userLocation && transitCorridor.length >= 2
        ? projectPointToPolyline(
            { latitude: userLocation.latitude, longitude: userLocation.longitude },
            transitCorridor
          )
        : null;
    const vehicleCorridorProjection =
      vehicle && transitCorridor.length >= 2
        ? projectPointToPolyline(
            {
              latitude: vehicle.coordinate?.latitude,
              longitude: vehicle.coordinate?.longitude,
            },
            transitCorridor
          )
        : null;
    const userCorridorDistance = userCorridorProjection?.distanceMeters ?? null;
    const vehicleCorridorDistance = vehicleCorridorProjection?.distanceMeters ?? null;
    const userCorridorProgress = getProgressAlongPolylineMeters(transitCorridor, userCorridorProjection);
    const vehicleCorridorProgress = getProgressAlongPolylineMeters(transitCorridor, vehicleCorridorProjection);

    // Calculate stops until alighting (for on-board phase)
    let stopsUntilAlighting = null;
    let nearAlightingStop = false;
    let shouldGetOff = false;

    if (isUserOnBoard && userLocation) {
      const alightingInfo = calculateStopsUntilAlighting(userLocation, stopSequence);
      if (alightingInfo) {
        const rawStops = alightingInfo.stopsRemaining;
        // Monotonic filter: only accept new count if it's <= last confirmed (no GPS-jitter bouncing upward)
        if (lastConfirmedStopsRef.current === null || rawStops <= lastConfirmedStopsRef.current) {
          stopsUntilAlighting = rawStops;
          lastConfirmedStopsRef.current = rawStops;
        } else {
          // GPS jitter pushed count up — hold the last confirmed lower value
          stopsUntilAlighting = lastConfirmedStopsRef.current;
        }
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

    const now = Date.now();
    const autoBoardEvaluation = evaluateAutoBoardConfidence({
      hasArrived,
      locationAccuracy,
      matchQuality,
      previousSnapshot: previousSnapshotRef.current,
      userCorridorDistance,
      userCorridorProgress,
      userSpeed,
      userStopDistance,
      userVehicleDistance,
      vehicleCorridorDistance,
      vehicleCorridorProgress,
      vehicleStopDistance,
    });
    const autoBoardReady = updateEvidenceWindow(
      autoBoardEvidenceRef,
      autoBoardEvaluation.eligible,
      now,
      AUTO_BOARD_MIN_HITS,
      AUTO_BOARD_MIN_MS
    );

    const autoAlightEvaluation = evaluateAutoAlightConfidence({
      distanceToAlighting,
      locationAccuracy,
      nearAlightingStop,
      previousSnapshot: previousSnapshotRef.current,
      stopsUntilAlighting,
      userCorridorDistance,
      userCorridorProgress,
      userSpeed,
    });
    const autoAlightReady = updateEvidenceWindow(
      autoAlightEvidenceRef,
      autoAlightEvaluation.eligible,
      now,
      AUTO_ALIGHT_MIN_HITS,
      AUTO_ALIGHT_MIN_MS
    );

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
      matchQuality,
      locationAccuracy,
      userSpeed,
      userStopDistance,
      userVehicleDistance,
      userCorridorDistance,
      userCorridorProgress,
      vehicleStopDistance,
      vehicleCorridorDistance,
      vehicleCorridorProgress,
      autoBoardConfidence: autoBoardEvaluation.confidence,
      autoAlightConfidence: autoAlightEvaluation.confidence,
      autoBoardReady,
      autoAlightReady,
    });

    previousSnapshotRef.current = {
      distanceToAlighting,
      userCorridorDistance,
      userCorridorProgress,
      userStopDistance,
      vehicleCorridorProgress,
      vehicleStopDistance,
    };
  }, [
    transitLeg,
    findMatchingVehicle,
    calculateStopsAwayFromBoarding,
    calculateStopsUntilAlighting,
    isUserOnBoard,
    userLocation,
  ]);

  // Reset monotonic counter whenever the transit leg changes (new leg = fresh counter)
  useEffect(() => {
    lastConfirmedStopsRef.current = null;
    previousSnapshotRef.current = null;
    autoBoardEvidenceRef.current = { startedAt: null, hits: 0, lastSeenAt: 0 };
    autoAlightEvidenceRef.current = { startedAt: null, hits: 0, lastSeenAt: 0 };
  }, [transitLeg]);

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
      updateProximity();
    }, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, transitLeg, isUserOnBoard, updateProximity]);

  // Update proximity when vehicles or user location changes
  useEffect(() => {
    if (isActive && transitLeg) {
      updateProximity();
    }
  }, [vehicles, userLocation, isActive, transitLeg, updateProximity]);

  return proximity;
};

export default useBusProximity;
