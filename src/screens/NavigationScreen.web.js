/**
 * NavigationScreen (Web Version)
 *
 * Web-compatible turn-by-turn navigation using Leaflet maps.
 * Falls back to browser geolocation API.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import logger from '../utils/logger';
import L from 'leaflet';

import { MAP_CONFIG, MIN_NAV_ZOOM } from '../config/constants';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

// Navigation components
import NavigationHeader from '../components/navigation/NavigationHeader';
import WalkingInstructionCard from '../components/navigation/WalkingInstructionCard';
import BusProximityCard from '../components/navigation/BusProximityCard';
import BoardingInstructionCard from '../components/navigation/BoardingInstructionCard';
import NavigationProgressBar from '../components/navigation/NavigationProgressBar';
import StepOverviewSheet from '../components/navigation/StepOverviewSheet';
import ExitConfirmationModal from '../components/navigation/ExitConfirmationModal';
import DestinationBanner from '../components/navigation/DestinationBanner';

// Hooks
import { useBusProximity } from '../hooks/useBusProximity';
import { useStepProgress } from '../hooks/useStepProgress';

// Walking enrichment (fetched on navigation start, not during preview)
import { enrichItineraryWithWalking } from '../services/walkingService';
import { decodePolyline, extractShapeSegment, findClosestPointIndex } from '../utils/polylineUtils';
import { pointToPolylineDistance } from '../utils/geometryUtils';

// Context for route shapes
import { useTransitStatic, useTransitRealtime } from '../context/TransitContext';
import Icon from '../components/Icon';

// Inject Leaflet CSS
if (typeof document !== 'undefined' && !document.getElementById('leaflet-css-nav')) {
  const link = document.createElement('link');
  link.id = 'leaflet-css-nav';
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  document.head.appendChild(link);
}

// Create marker icons
const createMarkerIcon = (type) => {
  const colors = {
    origin: COLORS.success,
    destination: COLORS.error,
    waypoint: COLORS.warning,
    user: COLORS.secondary,
  };
  const size = type === 'waypoint' ? 16 : 24;
  const color = colors[type] || COLORS.primary;

  return L.divIcon({
    className: 'nav-marker',
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Create bus marker icon
const createBusMarkerIcon = (color, routeShortName, bearing) => {
  const rotation = bearing || 0;
  return L.divIcon({
    className: 'bus-marker',
    html: `<div style="
      width: 36px;
      height: 36px;
      background: ${color || COLORS.primary};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      color: white;
      transform: rotate(${rotation}deg);
    ">${routeShortName || '🚌'}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

// Create bus stop marker icon
const createBusStopMarkerIcon = () => {
  return L.divIcon({
    className: 'bus-stop-marker',
    html: `<div style="
      width: 20px;
      height: 20px;
      background: white;
      border: 3px solid ${COLORS.primary};
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

// Map controller component
const MapController = ({
  userLocation,
  isFollowMode,
  tripBounds,
  shouldFitBounds,
  onBoundsFit,
  jumpToLocation,
  showOverview,
  onMapReady,
  fitToLegBounds,
  legTransitionTimeRef,
}) => {
  const map = useMap();

  // Expose map instance on mount
  useEffect(() => {
    if (onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  // Fit to trip bounds on initial load
  useEffect(() => {
    if (shouldFitBounds && tripBounds) {
      map.fitBounds([
        [tripBounds.minLat, tripBounds.minLon],
        [tripBounds.maxLat, tripBounds.maxLon],
      ], { padding: [50, 50] });
      onBoundsFit();
    }
  }, [shouldFitBounds, tripBounds, map, onBoundsFit]);

  // Auto-zoom to current leg bounds on each leg transition (fires once per leg)
  useEffect(() => {
    if (!fitToLegBounds) return;
    map.fitBounds(
      [fitToLegBounds.sw, fitToLegBounds.ne],
      { padding: [50, 50], maxZoom: MIN_NAV_ZOOM }
    );
  }, [fitToLegBounds, map]);

  // Follow user location when in follow mode
  // Skip for 2 seconds after a leg transition so the per-leg zoom isn't immediately overridden
  useEffect(() => {
    if (isFollowMode && userLocation) {
      if (legTransitionTimeRef && Date.now() - legTransitionTimeRef.current < 2000) return;
      map.flyTo([userLocation.latitude, userLocation.longitude], MIN_NAV_ZOOM, {
        duration: 0.5,
      });
    }
  }, [userLocation, isFollowMode, map, legTransitionTimeRef]);

  // Handle jump to location command
  useEffect(() => {
    if (jumpToLocation && userLocation) {
      map.flyTo([userLocation.latitude, userLocation.longitude], MIN_NAV_ZOOM, {
        duration: 0.5,
      });
    }
  }, [jumpToLocation, userLocation, map]);

  // Handle show overview command
  useEffect(() => {
    if (showOverview && tripBounds) {
      map.fitBounds([
        [tripBounds.minLat, tripBounds.minLon],
        [tripBounds.maxLat, tripBounds.maxLon],
      ], { padding: [50, 50] });
    }
  }, [showOverview, tripBounds, map]);

  return null;
};

// Web geolocation hook
const useWebLocation = () => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef(null);

  const startTracking = useCallback(async () => {
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
            (pos) => {
              setLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                heading: pos.coords.heading,
                accuracy: pos.coords.accuracy,
              });
            },
            (err) => {
              logger.warn('Location watch error:', err);
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
        (err) => {
          setError(err.message);
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

const NavigationScreen = ({ route }) => {
  const navigation = useNavigation();

  const initialItinerary = route.params?.itinerary;
  const [itinerary, setItinerary] = useState(initialItinerary);

  // Guard + enrich: if no itinerary, go back; otherwise fetch walking directions
  useEffect(() => {
    if (!initialItinerary) {
      navigation.goBack();
      return;
    }

    let cancelled = false;
    enrichItineraryWithWalking(initialItinerary)
      .then(enriched => {
        if (!cancelled) {
          logger.log('Walking directions enriched for navigation');
          setItinerary(enriched);
        }
      })
      .catch(() => {}); // Keep using estimate-based itinerary
    return () => { cancelled = true; };
  }, [initialItinerary, navigation]);

  if (!itinerary) return null;

  // Get route shapes and realtime vehicles from TransitContext
  const { shapes, routeShapeMapping } = useTransitStatic();
  const { vehicles } = useTransitRealtime();

  const [isFollowMode, setIsFollowMode] = useState(false); // Start with trip overview
  const [hasInitializedMap, setHasInitializedMap] = useState(false);
  const [jumpToLocationTrigger, setJumpToLocationTrigger] = useState(0);
  const [showOverviewTrigger, setShowOverviewTrigger] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const offRouteTimerRef = useRef(null);
  const [isHeadingUp, setIsHeadingUp] = useState(false); // Compass/heading-up mode (walking only)
  const legZoomedRef = useRef(new Set());
  const legTransitionTimeRef = useRef(0);
  const mapInstanceRef = useRef(null); // Holds the Leaflet map instance
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const [showMissedBusWarning, setShowMissedBusWarning] = useState(false);
  const staleCheckedRef = useRef(false);

  // Web location tracking
  const {
    location: userLocation,
    error: locationError,
    isTracking,
    startTracking,
    stopTracking,
  } = useWebLocation();

  const [isAcquiringGPS, setIsAcquiringGPS] = useState(true);

  useEffect(() => {
    if (userLocation) {
      setIsAcquiringGPS(false);
    }
  }, [userLocation]);

  // Step progress hook (need isUserOnBoard before busProximity)
  const {
    currentLegIndex,
    currentLeg,
    currentStepIndex,
    currentWalkingStep,
    totalLegs,
    navigationState,
    instructionText,
    distanceToDestination,
    isNavigationComplete,
    isUserOnBoard,
    transitStatus,
    startNavigation,
    advanceStep,
    advanceLeg,
    completeLeg,
    boardBus,
    alightBus,
    resetNavigation,
  } = useStepProgress(itinerary, userLocation, null); // Pass null initially, update below
  void resetNavigation;

  // Get current transit leg
  const currentTransitLeg = useMemo(() => {
    if (!currentLeg) return null;
    if (currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT') {
      return currentLeg;
    }
    return null;
  }, [currentLeg]);

  const isWalkingLeg = currentLeg?.mode === 'WALK';
  const isTransitLeg = currentLeg?.mode === 'BUS' || currentLeg?.mode === 'TRANSIT';
  const isOnDemandLeg = currentLeg?.isOnDemand === true;

  // Get next transit leg (for bus tracking during walking legs)
  const nextTransitLeg = useMemo(() => {
    if (!itinerary?.legs || !isWalkingLeg) return null;
    for (let i = currentLegIndex + 1; i < itinerary.legs.length; i++) {
      const leg = itinerary.legs[i];
      if (leg.mode === 'BUS' || leg.mode === 'TRANSIT') return leg;
    }
    return null;
  }, [itinerary, currentLegIndex, isWalkingLeg]);

  const isLastWalkingLeg = useMemo(() => {
    if (!isWalkingLeg || !itinerary?.legs) return false;
    for (let i = currentLegIndex + 1; i < itinerary.legs.length; i++) {
      if (itinerary.legs[i].mode === 'BUS' || itinerary.legs[i].mode === 'TRANSIT') return false;
    }
    return true;
  }, [isWalkingLeg, itinerary, currentLegIndex]);

  // Peek-ahead text for the next transit leg (shown in WalkingInstructionCard)
  const nextLegPreviewText = useMemo(() => {
    if (!itinerary?.legs || !isWalkingLeg) return null;
    let nextLeg = null;
    for (let i = currentLegIndex + 1; i < itinerary.legs.length; i++) {
      const leg = itinerary.legs[i];
      if (leg.mode === 'BUS' || leg.mode === 'TRANSIT') {
        nextLeg = leg;
        break;
      }
    }
    if (!nextLeg) return null;
    const routeName = nextLeg.route?.shortName || nextLeg.routeShortName || '';
    const stopName = nextLeg.from?.name || '';
    const stopCode = nextLeg.from?.stopCode;
    const stopLabel = stopCode ? `${stopName} (#${stopCode})` : stopName;
    const timeStr = nextLeg.startTime
      ? new Date(nextLeg.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : null;
    const parts = [`Then board Route ${routeName}`, stopLabel && `at ${stopLabel}`, timeStr && `at ${timeStr}`];
    return parts.filter(Boolean).join(' ');
  }, [itinerary, currentLegIndex, isWalkingLeg]);

  // Peek-ahead text for the leg after the current transit leg (shown in BusProximityCard/BoardingInstructionCard)
  const transitPeekAheadText = useMemo(() => {
    if (!itinerary?.legs || !isTransitLeg) return null;
    const nextLegIndex = currentLegIndex + 1;
    if (nextLegIndex >= itinerary.legs.length) return null;
    const nextLeg = itinerary.legs[nextLegIndex];
    if (!nextLeg) return null;

    if (nextLeg.mode === 'WALK') {
      const durationMin = nextLeg.duration ? Math.ceil(nextLeg.duration / 60) : null;
      const durationStr = durationMin ? `${durationMin} min` : '';
      // Check if there is a transit leg after the walk
      const legAfterWalk = itinerary.legs[nextLegIndex + 1];
      if (legAfterWalk && (legAfterWalk.mode === 'BUS' || legAfterWalk.mode === 'TRANSIT')) {
        const routeName = legAfterWalk.route?.shortName || legAfterWalk.routeShortName || '';
        const stopName = legAfterWalk.from?.name || '';
        const stopCode = legAfterWalk.from?.stopCode;
        const stopLabel = stopCode ? `${stopName} (#${stopCode})` : stopName;
        const parts = [
          `Next: Walk${durationStr ? ` ${durationStr}` : ''}`,
          stopLabel && `to ${stopLabel}`,
          routeName && `for Route ${routeName}`,
        ];
        return parts.filter(Boolean).join(' ');
      }
      // Walk to destination
      const destName = nextLeg.to?.name || 'your destination';
      return `Next: Walk${durationStr ? ` ${durationStr}` : ''} to ${destName}`;
    }

    return null;
  }, [itinerary, currentLegIndex, isTransitLeg]);

  // Bus proximity tracking with user location and on-board state
  const busProximity = useBusProximity(
    currentTransitLeg,
    !!currentTransitLeg,
    userLocation,
    isUserOnBoard
  );

  // Also track bus for the next transit leg while walking
  const nextTransitBusProximity = useBusProximity(
    isWalkingLeg ? nextTransitLeg : null,
    isWalkingLeg && !!nextTransitLeg,
    userLocation,
    false
  );

  // Calculate trip bounds for initial map view
  const tripBounds = useMemo(() => {
    if (!itinerary?.legs || itinerary.legs.length === 0) return null;

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    itinerary.legs.forEach(leg => {
      if (leg.from) {
        minLat = Math.min(minLat, leg.from.lat);
        maxLat = Math.max(maxLat, leg.from.lat);
        minLon = Math.min(minLon, leg.from.lon);
        maxLon = Math.max(maxLon, leg.from.lon);
      }
      if (leg.to) {
        minLat = Math.min(minLat, leg.to.lat);
        maxLat = Math.max(maxLat, leg.to.lat);
        minLon = Math.min(minLon, leg.to.lon);
        maxLon = Math.max(maxLon, leg.to.lon);
      }
    });

    return { minLat, maxLat, minLon, maxLon };
  }, [itinerary]);

  // Compute per-leg fit bounds (only when the leg hasn't been zoomed yet)
  const fitToLegBounds = useMemo(() => {
    if (legZoomedRef.current.has(currentLegIndex)) return null;
    if (!currentLeg?.from || !currentLeg?.to) return null;

    const fromLat = currentLeg.from.lat;
    const fromLon = currentLeg.from.lon;
    const toLat = currentLeg.to.lat;
    const toLon = currentLeg.to.lon;

    return {
      ne: [Math.max(fromLat, toLat), Math.max(fromLon, toLon)],
      sw: [Math.min(fromLat, toLat), Math.min(fromLon, toLon)],
    };
  }, [currentLegIndex, currentLeg]);

  // Record leg transition time and mark leg as zoomed when fitToLegBounds resolves
  useEffect(() => {
    if (!fitToLegBounds) return;
    legZoomedRef.current.add(currentLegIndex);
    legTransitionTimeRef.current = Date.now();
  }, [fitToLegBounds, currentLegIndex]);

  // Track navigation start
  useEffect(() => {
    if (initialItinerary) {
      try {
        const { trackEvent } = require('../services/analyticsService');
        trackEvent('navigation_started', {
          leg_count: initialItinerary.legs?.length || 0,
        });
      } catch {}
    }
  }, []);

  // Start tracking on mount
  useEffect(() => {
    const initNavigation = async () => {
      const success = await startTracking();
      if (success) {
        startNavigation();
      } else {
        alert('Location access is required for navigation. Please enable location services.');
      }
    };
    initNavigation();

    return () => stopTracking();
  }, []);

  // Handle completion
  useEffect(() => {
    if (isNavigationComplete) {
      try {
        const { trackEvent } = require('../services/analyticsService');
        trackEvent('navigation_completed');
      } catch {}
      // Set nudge flag for post-trip survey banner on HomeScreen
      AsyncStorage.setItem('@barrie_transit_show_survey_nudge', 'true').catch(() => {});
      alert('You have arrived at your destination!');
      navigation.goBack();
    }
  }, [isNavigationComplete, navigation]);

  // Auto-advance when user should get off the bus
  useEffect(() => {
    if (!currentTransitLeg) return;
    if (transitStatus === 'on_board' && busProximity?.shouldGetOff) {
      // Auto-alight after 3 seconds if user doesn't respond
      const timer = setTimeout(() => {
        alightBus();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentTransitLeg, transitStatus, busProximity?.shouldGetOff, alightBus]);

  // Stale itinerary check: warn if trip was planned more than 30 minutes ago
  useEffect(() => {
    if (staleCheckedRef.current) return;
    staleCheckedRef.current = true;
    const firstLegStart = itinerary?.legs?.[0]?.startTime;
    if (firstLegStart && Date.now() - firstLegStart > 30 * 60 * 1000) {
      setShowStaleWarning(true);
    }
  }, [itinerary]);

  // Missed bus detection: warn if >5 min past scheduled departure with no tracked vehicle
  useEffect(() => {
    if (!isTransitLeg) return;
    if (transitStatus !== 'waiting') return;
    const scheduledDeparture = currentLeg?.startTime;
    if (!scheduledDeparture) return;
    if (Date.now() <= scheduledDeparture + 5 * 60 * 1000) return;
    if (busProximity?.vehicle) return;
    setShowMissedBusWarning(true);
  }, [isTransitLeg, transitStatus, currentLeg, busProximity?.vehicle]);

  // Get polylines for Leaflet
  const routePolylines = useMemo(() => {
    if (!itinerary?.legs) return [];

    const result = [];

    itinerary.legs.forEach((leg, index) => {
      let coordObjects = []; // {latitude, longitude} objects for split calculation
      const isWalk = leg.mode === 'WALK';
      const isTransit = leg.mode === 'BUS' || leg.mode === 'TRANSIT';

      if (leg.legGeometry?.points) {
        // Use encoded polyline if available (walking legs from walkingService)
        coordObjects = decodePolyline(leg.legGeometry.points);
      } else if (isTransit && leg.route?.id && leg.from && leg.to) {
        // For transit legs, use actual GTFS route shape
        const routeId = leg.route.id;
        const shapeIds = routeShapeMapping[routeId] || [];

        // Try each shape and find the best match
        let bestSegment = [];
        let bestLength = 0;

        for (const shapeId of shapeIds) {
          const shapeCoords = shapes[shapeId] || [];
          if (shapeCoords.length === 0) continue;

          const segment = extractShapeSegment(
            shapeCoords,
            leg.from.lat,
            leg.from.lon,
            leg.to.lat,
            leg.to.lon
          );

          // Use the segment with the most points (likely the correct direction)
          if (segment.length > bestLength) {
            bestLength = segment.length;
            bestSegment = segment;
          }
        }

        coordObjects = bestSegment.length > 0
          ? bestSegment
          : [
              { latitude: leg.from.lat, longitude: leg.from.lon },
              { latitude: leg.to.lat, longitude: leg.to.lon },
            ];
      } else if (leg.from && leg.to) {
        // Fallback to straight line
        coordObjects = [
          { latitude: leg.from.lat, longitude: leg.from.lon },
          { latitude: leg.to.lat, longitude: leg.to.lon },
        ];
      }

      const isCurrentLeg = index === currentLegIndex;
      const isCompletedLeg = index < currentLegIndex;

      const routeColor = isCompletedLeg
        ? COLORS.grey400
        : isWalk
        ? COLORS.grey600
        : leg.isOnDemand
        ? (leg.zoneColor || COLORS.primary)
        : (leg.route?.color || COLORS.primary);

      const weight = isCurrentLeg ? 5 : 3;
      const dashArray = isWalk ? '10, 5' : leg.isOnDemand ? '8, 6' : null;
      const opacity = isCompletedLeg ? 0.5 : 1;

      // For the current leg, split at the user's position into completed (grey) and remaining (colored)
      if (isCurrentLeg && userLocation && coordObjects.length > 1) {
        const splitIdx = findClosestPointIndex(
          coordObjects,
          userLocation.latitude,
          userLocation.longitude
        );

        if (splitIdx > 0 && splitIdx < coordObjects.length - 1) {
          // Completed portion: from start up to user position (grey, lower opacity)
          result.push({
            id: `leg-${index}-completed`,
            positions: coordObjects.slice(0, splitIdx + 1).map(c => [c.latitude, c.longitude]),
            color: '#9E9E9E',
            weight,
            dashArray,
            opacity: 0.5,
          });
          // Remaining portion: from user position to end (full route color)
          result.push({
            id: `leg-${index}-remaining`,
            positions: coordObjects.slice(splitIdx).map(c => [c.latitude, c.longitude]),
            color: routeColor,
            weight,
            dashArray,
            opacity,
          });
          return;
        }
      }

      result.push({
        id: `leg-${index}`,
        positions: coordObjects.map(c => [c.latitude, c.longitude]),
        color: routeColor,
        weight,
        dashArray,
        opacity,
      });
    });

    return result;
  }, [itinerary, currentLegIndex, userLocation, shapes, routeShapeMapping]);

  // Get markers
  const markers = useMemo(() => {
    if (!itinerary?.legs) return [];

    const result = [];
    const legs = itinerary.legs;

    if (legs[0]?.from) {
      result.push({
        id: 'origin',
        position: [legs[0].from.lat, legs[0].from.lon],
        type: 'origin',
      });
    }

    const lastLeg = legs[legs.length - 1];
    if (lastLeg?.to) {
      result.push({
        id: 'destination',
        position: [lastLeg.to.lat, lastLeg.to.lon],
        type: 'destination',
      });
    }

    if (currentLeg?.to && currentLegIndex < legs.length - 1) {
      result.push({
        id: 'current-destination',
        position: [currentLeg.to.lat, currentLeg.to.lon],
        type: 'waypoint',
      });
    }

    return result;
  }, [itinerary, currentLeg, currentLegIndex]);

  // Tracked bus marker (when tracking a bus)
  // Uses direct vehicle context lookup as primary (immediate), with useBusProximity as fallback.
  const trackedBusMarker = useMemo(() => {
    if (!currentTransitLeg) return null;

    const tripId = currentTransitLeg.tripId;
    const routeId = currentTransitLeg.route?.id || currentTransitLeg.routeId;
    let vehicle = null;

    if (tripId) {
      vehicle = vehicles.find(v => v.tripId === tripId);
    }
    if (!vehicle && routeId) {
      const routeVehicles = vehicles.filter(v => v.routeId === routeId);
      vehicle = routeVehicles[0] || null;
    }

    if (!vehicle && busProximity?.vehicle) {
      vehicle = busProximity.vehicle;
    }

    if (!vehicle?.coordinate) return null;

    return {
      id: 'tracked-bus',
      position: [
        vehicle.coordinate.latitude,
        vehicle.coordinate.longitude
      ],
      color: currentTransitLeg.route?.color || COLORS.primary,
      routeShortName: currentTransitLeg.route?.shortName || '?',
      bearing: vehicle.bearing,
    };
  }, [currentTransitLeg, vehicles, busProximity?.vehicle]);

  // Bus stop marker (boarding stop when waiting)
  const busStopMarker = useMemo(() => {
    if (!currentTransitLeg?.from) return null;
    if (isUserOnBoard) return null; // Don't show boarding stop when on board

    return {
      id: 'bus-stop',
      position: [currentTransitLeg.from.lat, currentTransitLeg.from.lon],
      name: currentTransitLeg.from.name,
    };
  }, [currentTransitLeg, isUserOnBoard]);

  // Bus marker shown during walking legs — looks forward (next transit) then backward (previous)
  const walkingBusMarker = useMemo(() => {
    if (!isWalkingLeg || !itinerary?.legs) return null;

    // Find nearest transit leg: forward first, then backward
    let transitLeg = nextTransitLeg;
    if (!transitLeg) {
      for (let i = currentLegIndex - 1; i >= 0; i--) {
        const leg = itinerary.legs[i];
        if (leg.mode === 'BUS' || leg.mode === 'TRANSIT') { transitLeg = leg; break; }
      }
    }
    if (!transitLeg) return null;

    const tripId = transitLeg.tripId;
    const routeId = transitLeg.route?.id || transitLeg.routeId;
    let vehicle = null;

    if (tripId) {
      vehicle = vehicles.find(v => v.tripId === tripId);
    }
    if (!vehicle && routeId) {
      const routeVehicles = vehicles.filter(v => v.routeId === routeId);
      vehicle = routeVehicles[0] || null;
    }

    if (!vehicle && nextTransitBusProximity?.vehicle) {
      vehicle = nextTransitBusProximity.vehicle;
    }

    if (!vehicle?.coordinate) return null;

    return {
      id: 'walking-bus',
      position: [
        vehicle.coordinate.latitude,
        vehicle.coordinate.longitude,
      ],
      color: transitLeg.route?.color || COLORS.primary,
      routeShortName: transitLeg.route?.shortName || '?',
      bearing: vehicle.bearing,
    };
  }, [isWalkingLeg, itinerary, currentLegIndex, nextTransitLeg, vehicles, nextTransitBusProximity?.vehicle]);

  // Off-route detection: watch user location vs walking leg polyline
  useEffect(() => {
    if (!isWalkingLeg || !userLocation || !currentLeg) {
      if (offRouteTimerRef.current) {
        clearTimeout(offRouteTimerRef.current);
        offRouteTimerRef.current = null;
      }
      setIsOffRoute(false);
      return;
    }

    // Get the walking leg polyline
    let polyline = [];
    if (currentLeg.legGeometry?.points) {
      polyline = decodePolyline(currentLeg.legGeometry.points);
    } else if (currentLeg.steps && currentLeg.steps.length > 0) {
      currentLeg.steps.forEach(step => {
        if (step.lat != null && step.lon != null) {
          polyline.push({ latitude: step.lat, longitude: step.lon });
        }
      });
    }

    if (polyline.length < 2) {
      return;
    }

    const userPoint = { latitude: userLocation.latitude, longitude: userLocation.longitude };
    const dist = pointToPolylineDistance(userPoint, polyline);

    if (dist > 50) {
      // User is more than 50m from the route — start 30-second timer if not already running
      if (!offRouteTimerRef.current) {
        offRouteTimerRef.current = setTimeout(() => {
          setIsOffRoute(true);
          offRouteTimerRef.current = null;
        }, 30000);
      }
    } else {
      // Back on route — clear timer and reset
      if (offRouteTimerRef.current) {
        clearTimeout(offRouteTimerRef.current);
        offRouteTimerRef.current = null;
      }
      setIsOffRoute(false);
    }
  }, [userLocation, currentLeg, isWalkingLeg]);

  // Clear off-route timer on unmount
  useEffect(() => {
    return () => {
      if (offRouteTimerRef.current) {
        clearTimeout(offRouteTimerRef.current);
      }
    };
  }, []);

  // Dismiss off-route banner and log recalculate intent
  const handleRecalculate = () => {
    // TODO: Implement actual re-routing from current position to leg destination
    // This would fetch new walking directions from userLocation to currentLeg.to
    logger.log('Off-route recalculate requested — rerouting not yet implemented');
    setIsOffRoute(false);
    if (offRouteTimerRef.current) {
      clearTimeout(offRouteTimerRef.current);
      offRouteTimerRef.current = null;
    }
  };

  // Close navigation - show confirmation modal
  const handleClose = () => {
    setShowExitModal(true);
  };

  // Confirm exit - navigate back to Home
  const confirmExit = () => {
    setShowExitModal(false);
    stopTracking();
    // Navigate back to MapMain (home screen) and reset trip planning mode
    navigation.navigate('MapMain', { exitTripPlanning: true });
  };

  // Cancel exit - close modal
  const cancelExit = () => {
    setShowExitModal(false);
  };

  const toggleFollowMode = () => {
    setIsFollowMode(!isFollowMode);
  };

  // Jump to current location (one-time, doesn't enable follow mode)
  const jumpToMyLocation = useCallback(() => {
    setJumpToLocationTrigger(prev => prev + 1);
  }, []);

  // Show full trip overview
  const showTripOverview = useCallback(() => {
    setIsFollowMode(false);
    setShowOverviewTrigger(prev => prev + 1);
  }, []);

  // Handle initial bounds fit
  const handleBoundsFit = useCallback(() => {
    setHasInitializedMap(true);
  }, []);

  // Store Leaflet map instance for CSS transform access
  const handleMapReady = useCallback((mapInstance) => {
    mapInstanceRef.current = mapInstance;
  }, []);

  // Detect touch device for compass button visibility
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // Apply CSS rotation to Leaflet map container for heading-up mode (walking only, touch only)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const container = mapInstanceRef.current.getContainer();
    if (!container) return;

    if (isHeadingUp && isWalkingLeg && isTouchDevice) {
      const heading = userLocation?.heading ?? 0;
      container.style.transform = `rotate(-${heading}deg)`;
      container.style.transformOrigin = 'center center';
    } else {
      container.style.transform = '';
      container.style.transformOrigin = '';
    }
  }, [isHeadingUp, isWalkingLeg, userLocation?.heading, isTouchDevice]);

  // When switching off heading-up or leaving walking leg, ensure rotation is cleared
  useEffect(() => {
    if (!isHeadingUp || !isWalkingLeg) {
      if (mapInstanceRef.current) {
        const container = mapInstanceRef.current.getContainer();
        if (container) {
          container.style.transform = '';
          container.style.transformOrigin = '';
        }
      }
    }
  }, [isHeadingUp, isWalkingLeg]);

  // Get final destination name for header
  const finalDestination = useMemo(() => {
    if (!itinerary?.legs) return 'Destination';
    const lastLeg = itinerary.legs[itinerary.legs.length - 1];
    return lastLeg?.to?.name || 'Destination';
  }, [itinerary]);

  // Calculate total remaining distance across all legs
  const totalRemainingDistance = useMemo(() => {
    if (!itinerary?.legs) return 0;

    let remaining = 0;

    // Add remaining distance in current leg
    if (currentLeg && distanceToDestination) {
      remaining += distanceToDestination;
    }

    // Add distance from all subsequent legs
    for (let i = currentLegIndex + 1; i < itinerary.legs.length; i++) {
      remaining += itinerary.legs[i].distance || 0;
    }

    return remaining;
  }, [itinerary, currentLegIndex, currentLeg, distanceToDestination]);

  const initialCenter = userLocation
    ? [userLocation.latitude, userLocation.longitude]
    : [MAP_CONFIG.INITIAL_REGION.latitude, MAP_CONFIG.INITIAL_REGION.longitude];

  return (
    <View style={styles.container}>
      {/* Leaflet Map */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        <MapContainer
          center={initialCenter}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://stadiamaps.com/">Stadia Maps</a>'
            url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
          />
          <MapController
            userLocation={userLocation}
            isFollowMode={isFollowMode}
            tripBounds={tripBounds}
            shouldFitBounds={!hasInitializedMap && !!tripBounds}
            onBoundsFit={handleBoundsFit}
            jumpToLocation={jumpToLocationTrigger}
            showOverview={showOverviewTrigger}
            fitToLegBounds={fitToLegBounds}
            legTransitionTimeRef={legTransitionTimeRef}
            onMapReady={handleMapReady}
          />

          {/* Route polylines */}
          {routePolylines.map((route) => (
            <Polyline
              key={route.id}
              positions={route.positions}
              color={route.color}
              weight={route.weight}
              dashArray={route.dashArray}
              opacity={route.opacity}
            />
          ))}

          {/* Markers */}
          {markers.map((marker) => (
            <Marker
              key={marker.id}
              position={marker.position}
              icon={createMarkerIcon(marker.type)}
            />
          ))}

          {/* User location marker */}
          {userLocation && (
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={createMarkerIcon('user')}
            />
          )}

          {/* Bus stop marker (boarding stop) */}
          {busStopMarker && (
            <Marker
              position={busStopMarker.position}
              icon={createBusStopMarkerIcon()}
            />
          )}

          {/* Tracked bus marker */}
          {trackedBusMarker && (
            <Marker
              position={trackedBusMarker.position}
              icon={createBusMarkerIcon(
                trackedBusMarker.color,
                trackedBusMarker.routeShortName,
                trackedBusMarker.bearing
              )}
            />
          )}

          {/* Bus marker (shown during walking legs) */}
          {walkingBusMarker && (
            <Marker
              position={walkingBusMarker.position}
              icon={createBusMarkerIcon(
                walkingBusMarker.color,
                walkingBusMarker.routeShortName,
                walkingBusMarker.bearing
              )}
            />
          )}
        </MapContainer>
      </div>

      {/* GPS Acquisition Overlay */}
      {isAcquiringGPS && (
        <View style={styles.gpsOverlay}>
          <View style={styles.gpsCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.gpsText}>Acquiring GPS signal...</Text>
            <Text style={styles.gpsSubtext}>Move to an open area for better signal</Text>
          </View>
        </View>
      )}

      {/* Navigation Header */}
      <NavigationHeader
        instruction={instructionText}
        navigationState={navigationState}
        currentLegIndex={currentLegIndex}
        totalLegs={totalLegs}
        onClose={handleClose}
        destinationName={finalDestination}
        totalDistanceRemaining={totalRemainingDistance}
        currentMode={currentLeg?.mode || 'WALK'}
        scheduledArrivalTime={itinerary?.legs?.[itinerary.legs.length - 1]?.endTime || null}
        delaySeconds={currentLeg?.delaySeconds || 0}
        isRealtime={currentLeg?.isRealtime || false}
      />

      {/* Map control buttons */}
      <View style={styles.mapControls}>
        {/* Compass heading-up toggle — only on touch devices during walking legs */}
        {isWalkingLeg && isTouchDevice && (
          <TouchableOpacity
            style={[styles.mapControlButton, isHeadingUp && styles.mapControlButtonActive]}
            onPress={() => setIsHeadingUp(prev => !prev)}
            accessibilityLabel={isHeadingUp ? 'Switch to north-up' : 'Switch to heading-up'}
          >
            <Text style={styles.mapControlIcon}>🧭</Text>
            <Text style={[styles.mapControlLabel, isHeadingUp && styles.mapControlLabelActive]}>
              {isHeadingUp ? 'Heading Up' : 'North Up'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Jump to my location button */}
        <TouchableOpacity
          style={[styles.mapControlButton, isFollowMode && styles.mapControlButtonActive]}
          onPress={isFollowMode ? toggleFollowMode : jumpToMyLocation}
        >
          <Text style={styles.mapControlIcon}>{isFollowMode ? '📍' : '📍'}</Text>
          <Text style={[styles.mapControlLabel, isFollowMode && styles.mapControlLabelActive]}>
            {isFollowMode ? 'Following' : 'My Location'}
          </Text>
        </TouchableOpacity>

        {/* Show trip overview button */}
        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={showTripOverview}
        >
          <Text style={styles.mapControlIcon}>🗺️</Text>
          <Text style={styles.mapControlLabel}>Full Trip</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Section */}
      <View style={styles.bottomSection}>
        {/* Destination Banner — only shown during non-walking legs */}
        {!isWalkingLeg && (
          <DestinationBanner
            currentLeg={currentLeg}
            nextTransitLeg={nextTransitLeg}
            distanceRemaining={distanceToDestination}
            totalLegDistance={currentLeg?.distance || 0}
            isLastWalkingLeg={isLastWalkingLeg}
          />
        )}

        {/* Off-Route Warning Banner */}
        {isOffRoute && (
          <View style={styles.offRouteBanner}>
            <Text style={styles.offRouteBannerText}>You appear to be off-route</Text>
            <View style={styles.offRouteBannerButtons}>
              <TouchableOpacity onPress={handleRecalculate} style={styles.offRouteRecalcButton}>
                <Text style={styles.offRouteRecalcText}>Recalculate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setIsOffRoute(false);
                  if (offRouteTimerRef.current) {
                    clearTimeout(offRouteTimerRef.current);
                    offRouteTimerRef.current = null;
                  }
                }}
                style={styles.offRouteDismissButton}
              >
                <Text style={styles.offRouteDismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Stale itinerary warning banner */}
        {showStaleWarning && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningBannerText}>
              This trip was planned a while ago. Times may have changed.
            </Text>
            <View style={styles.warningBannerActions}>
              <TouchableOpacity
                style={styles.warningBannerButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.warningBannerButtonText}>Re-plan trip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.warningBannerDismiss}
                onPress={() => setShowStaleWarning(false)}
              >
                <Text style={styles.warningBannerDismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Missed bus warning banner */}
        {showMissedBusWarning && (
          <View style={styles.missedBusBanner}>
            <Text style={styles.warningBannerText}>
              Your bus may have departed. Search for the next trip?
            </Text>
            <View style={styles.warningBannerActions}>
              <TouchableOpacity
                style={styles.missedBusBannerButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.warningBannerButtonText}>Re-plan trip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.warningBannerDismiss}
                onPress={() => setShowMissedBusWarning(false)}
              >
                <Text style={styles.warningBannerDismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isWalkingLeg && (
          <WalkingInstructionCard
            currentStep={currentWalkingStep}
            onNextStep={advanceStep}
            destinationName={currentLeg?.to?.name}
            currentLeg={currentLeg}
            isLastStep={currentStepIndex === (currentLeg?.steps || []).length - 1}
            onNextLeg={advanceLeg}
            currentStepIndex={currentStepIndex}
            totalSteps={(currentLeg?.steps || []).length}
            nextLegPreview={nextLegPreviewText}
          />
        )}

        {/* Bus Proximity Card / Boarding Instruction Card */}
        {isTransitLeg && !isOnDemandLeg && (
          <>
            {transitStatus === 'waiting' && !busProximity.hasArrived ? (
              <BoardingInstructionCard
                routeShortName={currentLeg?.route?.shortName}
                routeColor={currentLeg?.route?.color}
                headsign={currentLeg?.headsign}
                stopName={currentLeg?.from?.name}
                stopCode={currentLeg?.from?.stopCode}
                scheduledDeparture={currentLeg?.startTime}
                delaySeconds={currentLeg?.delaySeconds || 0}
                isRealtime={currentLeg?.isRealtime || false}
                peekAheadText={transitPeekAheadText}
              />
            ) : (
              <BusProximityCard
                routeShortName={currentLeg?.route?.shortName}
                routeColor={currentLeg?.route?.color}
                stopsAway={busProximity.stopsAway}
                estimatedArrival={busProximity.estimatedArrival}
                isApproaching={busProximity.isApproaching}
                hasArrived={busProximity.hasArrived}
                isTracking={busProximity.isTracking}
                headsign={currentLeg?.headsign}
                isOnBoard={isUserOnBoard}
                stopsUntilAlighting={busProximity.stopsUntilAlighting}
                nearAlightingStop={busProximity.nearAlightingStop}
                shouldGetOff={busProximity.shouldGetOff}
                onBoardBus={boardBus}
                onAlightBus={alightBus}
                alightingStopName={currentLeg?.to?.name}
                scheduledDeparture={currentLeg?.startTime}
                isRealtime={currentLeg?.isRealtime || false}
                delaySeconds={currentLeg?.delaySeconds || 0}
                nextLegPreview={transitPeekAheadText}
              />
            )}
          </>
        )}

        {/* On-Demand Zone Card */}
        {isOnDemandLeg && (
          <View style={[styles.onDemandCard, { borderLeftColor: currentLeg.zoneColor || COLORS.primary }]}>
            <View style={styles.onDemandCardHeader}>
              <Icon name="Phone" size={28} color={COLORS.primary} style={{ marginRight: SPACING.sm }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.onDemandCardTitle}>
                  {currentLeg.zoneName || 'On-Demand Zone'}
                </Text>
                <Text style={styles.onDemandCardSubtitle}>
                  Call to book your ride
                </Text>
              </View>
            </View>
            {currentLeg.to?.name && (
              <Text style={styles.onDemandCardDetail}>
                Your driver will take you to {currentLeg.to.name}
              </Text>
            )}
            <View style={styles.onDemandCardActions}>
              {currentLeg.bookingPhone && (
                <TouchableOpacity
                  style={[styles.onDemandPhoneButton, { backgroundColor: currentLeg.zoneColor || COLORS.primary }]}
                  onPress={() => {
                    if (typeof window !== 'undefined') {
                      window.open(`tel:${currentLeg.bookingPhone}`, '_self');
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${currentLeg.bookingPhone} to book ride`}
                >
                  <Text style={styles.onDemandPhoneButtonText}>
                    Call {currentLeg.bookingPhone}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.onDemandCompleteButton}
                onPress={completeLeg}
                accessibilityRole="button"
                accessibilityLabel="Mark on-demand ride as complete"
              >
                <Text style={styles.onDemandCompleteButtonText}>Ride Complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <NavigationProgressBar
          legs={itinerary?.legs || []}
          currentLegIndex={currentLegIndex}
        />

        <StepOverviewSheet
          legs={itinerary?.legs || []}
          currentLegIndex={currentLegIndex}
          onSelectLeg={() => {}}
          onCompleteLeg={completeLeg}
        />
      </View>

      {/* Location Error */}
      {locationError && (
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <Text style={styles.errorIcon}>📍</Text>
            <Text style={styles.errorTitle}>Location Unavailable</Text>
            <Text style={styles.errorText}>{locationError}</Text>
            <TouchableOpacity
              style={styles.errorButton}
              onPress={startTracking}
            >
              <Text style={styles.errorButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Exit Confirmation Modal */}
      <ExitConfirmationModal
        visible={showExitModal}
        onCancel={cancelExit}
        onConfirm={confirmExit}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  mapControls: {
    position: 'absolute',
    right: SPACING.md,
    top: 160,
    gap: SPACING.sm,
    zIndex: 1000,
  },
  mapControlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    ...SHADOWS.medium,
    marginBottom: SPACING.sm,
  },
  mapControlButtonActive: {
    backgroundColor: COLORS.primary,
  },
  mapControlIcon: {
    fontSize: 16,
    marginRight: SPACING.xs,
  },
  mapControlLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  mapControlLabelActive: {
    color: COLORS.white,
  },
  onDemandCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderLeftWidth: 4,
    ...SHADOWS.medium,
  },
  onDemandCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  onDemandCardIcon: {
    fontSize: 28,
    marginRight: SPACING.sm,
  },
  onDemandCardTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  onDemandCardSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  onDemandCardDetail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  onDemandCardActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  onDemandPhoneButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  onDemandPhoneButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  onDemandCompleteButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.grey200,
  },
  onDemandCompleteButtonText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  warningBanner: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.warningSubtle,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    ...SHADOWS.small,
  },
  missedBusBanner: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.errorSubtle,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
    ...SHADOWS.small,
  },
  warningBannerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    fontWeight: '500',
    marginBottom: SPACING.sm,
  },
  warningBannerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  warningBannerButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.warning,
  },
  missedBusBannerButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.error,
  },
  warningBannerButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  warningBannerDismiss: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.grey200,
  },
  warningBannerDismissText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  gpsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  gpsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    maxWidth: 280,
    ...SHADOWS.large,
  },
  gpsText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  gpsSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    zIndex: 100,
  },
  errorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    maxWidth: 300,
    ...SHADOWS.large,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  errorTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  errorButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
  },
  errorButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  offRouteBanner: {
    backgroundColor: COLORS.warningSubtle,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.small,
  },
  offRouteBannerText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  offRouteBannerButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  offRouteRecalcButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.warning,
    alignItems: 'center',
  },
  offRouteRecalcText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  offRouteDismissButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.grey200,
    alignItems: 'center',
  },
  offRouteDismissText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
});

export default NavigationScreen;
