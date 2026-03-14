/**
 * NavigationScreen (Web Version)
 *
 * Web-compatible turn-by-turn navigation using MapLibre maps.
 * Falls back to browser geolocation API.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from '../utils/logger';

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
import { useNavigationLocation } from '../hooks/useNavigationLocation';
import { useNavigationTripViewModel } from '../hooks/useNavigationTripViewModel';
import { useBusProximity } from '../hooks/useBusProximity';
import { useStepProgress } from '../hooks/useStepProgress';

// Walking enrichment (fetched on navigation start, not during preview)
import { enrichItineraryWithWalking } from '../services/walkingService';
import { recalculateNavigationItinerary } from '../services/navigationRecalculationService';
import { decodePolyline, extractShapeSegment, findClosestPointIndex } from '../utils/polylineUtils';
import { pointToPolylineDistance } from '../utils/geometryUtils';
import { escapeHtml } from '../utils/htmlUtils';
import {
  collectItineraryEndpointCoordinates,
  computeCoordinateBounds,
  computeLegBounds,
} from '../utils/itineraryViewport';

// Context for route shapes
import { useTransitStatic, useTransitRealtime } from '../context/TransitContext';
import Icon from '../components/Icon';
import WebMapView, { WebBusMarker, WebHtmlMarker, WebRoutePolyline } from '../components/WebMapView';

const NAV_FOLLOW_DELTA = 360 / Math.pow(2, MIN_NAV_ZOOM);

const trackNavigationEvent = (eventName, params) => {
  try {
    const { trackEvent } = require('../services/analyticsService');
    trackEvent(eventName, params);
  } catch {}
};

const buildNavMarkerHtml = (type) => {
  const colors = {
    origin: COLORS.success,
    destination: COLORS.error,
    waypoint: COLORS.warning,
    user: COLORS.secondary,
  };
  const size = type === 'waypoint' ? 16 : 24;
  const color = colors[type] || COLORS.primary;

  return `<div style="
    width:${size}px;
    height:${size}px;
    background:${color};
    border:3px solid white;
    border-radius:50%;
    box-shadow:0 2px 6px rgba(0,0,0,0.3);
  "></div>`;
};

const buildBusStopMarkerHtml = () => (
  `<div style="
    width:20px;
    height:20px;
    background:white;
    border:3px solid ${COLORS.primary};
    border-radius:50%;
    box-shadow:0 2px 4px rgba(0,0,0,0.3);
  "></div>`
);

const positionToCoordinate = (position) => ({
  latitude: position[0],
  longitude: position[1],
});

const buildRegionForLocation = (latitude, longitude) => ({
  latitude,
  longitude,
  latitudeDelta: NAV_FOLLOW_DELTA,
  longitudeDelta: NAV_FOLLOW_DELTA,
});

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
  const { shapes, routeShapeMapping, ensureRoutingData, stops } = useTransitStatic();
  const { vehicles, onDemandZones } = useTransitRealtime();

  const mapRef = useRef(null);
  const [isFollowMode, setIsFollowMode] = useState(false); // Start with trip overview
  const [isMapReady, setIsMapReady] = useState(false);
  const [hasInitializedMap, setHasInitializedMap] = useState(false);
  const [jumpToLocationTrigger, setJumpToLocationTrigger] = useState(0);
  const [showOverviewTrigger, setShowOverviewTrigger] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const offRouteTimerRef = useRef(null);
  const [isHeadingUp, setIsHeadingUp] = useState(false); // Compass/heading-up mode (walking only)
  const legZoomedRef = useRef(new Set());
  const legTransitionTimeRef = useRef(0);
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const [showMissedBusWarning, setShowMissedBusWarning] = useState(false);
  const [isRecalculatingRoute, setIsRecalculatingRoute] = useState(false);
  const staleCheckedRef = useRef(false);
  const missedBusWarningRef = useRef(false);

  // Web location tracking
  const {
    location: userLocation,
    error: locationError,
    isTracking,
    startTracking,
    stopTracking,
  } = useNavigationLocation();

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

  useEffect(() => {
    missedBusWarningRef.current = false;
  }, [currentLegIndex]);

  const {
    currentTransitLeg,
    finalDestination,
    isLastWalkingLeg,
    isOnDemandLeg,
    isTransitLeg,
    isWalkingLeg,
    nextLegPreviewText,
    nextTransitLeg,
    totalRemainingDistance,
    transitPeekAheadText,
  } = useNavigationTripViewModel({
    itinerary,
    currentLegIndex,
    currentLeg,
    distanceToDestination,
  });

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
    return computeCoordinateBounds(collectItineraryEndpointCoordinates(itinerary));
  }, [itinerary]);

  // Compute per-leg fit bounds (only when the leg hasn't been zoomed yet)
  const fitToLegBounds = useMemo(() => {
    if (legZoomedRef.current.has(currentLegIndex)) return null;
    return computeLegBounds(currentLeg);
  }, [currentLegIndex, currentLeg]);

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
      const ageMinutes = Math.round((Date.now() - firstLegStart) / 60000);
      logger.warn('Navigation itinerary is stale', {
        ageMinutes,
        firstLegStart,
      });
      trackNavigationEvent('navigation_itinerary_stale', {
        age_minutes: ageMinutes,
      });
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
    if (missedBusWarningRef.current) return;
    missedBusWarningRef.current = true;
    const minutesLate = Math.round((Date.now() - scheduledDeparture) / 60000);
    logger.warn('Navigation missed bus warning triggered', {
      currentLegIndex,
      minutesLate,
      routeId: currentLeg?.route?.id || null,
    });
    trackNavigationEvent('navigation_missed_bus_warning', {
      leg_index: currentLegIndex,
      minutes_late: minutesLate,
      route_id: currentLeg?.route?.id || 'unknown',
    });
    setShowMissedBusWarning(true);
  }, [isTransitLeg, transitStatus, currentLeg, busProximity?.vehicle, currentLegIndex]);

  // Get polylines for the web map
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
            coordinates: coordObjects.slice(0, splitIdx + 1),
            color: '#9E9E9E',
            weight,
            dashArray,
            opacity: 0.5,
          });
          // Remaining portion: from user position to end (full route color)
          result.push({
            id: `leg-${index}-remaining`,
            coordinates: coordObjects.slice(splitIdx),
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
        coordinates: coordObjects,
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
          logger.warn('Navigation off-route warning triggered', {
            currentLegIndex,
            distanceFromRouteMeters: Math.round(dist),
          });
          trackNavigationEvent('navigation_off_route_warning', {
            leg_index: currentLegIndex,
            distance_from_route_m: Math.round(dist),
          });
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
  }, [userLocation, currentLeg, isWalkingLeg, currentLegIndex]);

  // Clear off-route timer on unmount
  useEffect(() => {
    return () => {
      if (offRouteTimerRef.current) {
        clearTimeout(offRouteTimerRef.current);
      }
    };
  }, []);

  const clearOffRouteState = useCallback(() => {
    setIsOffRoute(false);
    if (offRouteTimerRef.current) {
      clearTimeout(offRouteTimerRef.current);
      offRouteTimerRef.current = null;
    }
  }, []);

  const handleRecalculate = useCallback(async () => {
    if (isRecalculatingRoute) return;

    const finalDestinationStop = itinerary?.legs?.[itinerary.legs.length - 1]?.to;
    setIsRecalculatingRoute(true);
    clearOffRouteState();

    try {
      const { itinerary: nextItinerary, routingDiagnostics } = await recalculateNavigationItinerary({
        userLocation,
        destination: finalDestinationStop,
        ensureRoutingData,
        onDemandZones,
        stops,
      });

      logger.info('Navigation reroute applied', routingDiagnostics);
      trackNavigationEvent('navigation_rerouted', {
        routing_source: routingDiagnostics?.source || 'unknown',
        fallback_from: routingDiagnostics?.fallbackFrom || 'none',
        fallback_reason: routingDiagnostics?.fallbackReason || 'none',
      });
      legZoomedRef.current = new Set();
      legTransitionTimeRef.current = 0;
      staleCheckedRef.current = false;
      missedBusWarningRef.current = false;
      setShowStaleWarning(false);
      setShowMissedBusWarning(false);
      setIsFollowMode(false);
      setHasInitializedMap(false);
      setItinerary(nextItinerary);
      resetNavigation();
      startNavigation();
    } catch (error) {
      logger.error('Navigation reroute failed:', error);
      trackNavigationEvent('navigation_reroute_failed', {
        code: error?.code || 'UNKNOWN_ERROR',
      });
      alert(error.message || 'A new route could not be generated right now.');
    } finally {
      setIsRecalculatingRoute(false);
    }
  }, [
    clearOffRouteState,
    ensureRoutingData,
    isRecalculatingRoute,
    itinerary,
    onDemandZones,
    resetNavigation,
    startNavigation,
    stops,
    userLocation,
    currentLegIndex,
  ]);

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

  // Detect touch device for compass button visibility
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // Fit full-trip bounds once when the web map becomes ready.
  useEffect(() => {
    if (!isMapReady || hasInitializedMap || !tripBounds) return;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: tripBounds.minLat, longitude: tripBounds.minLon },
        { latitude: tripBounds.maxLat, longitude: tripBounds.maxLon },
      ],
      { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 } }
    );
    setHasInitializedMap(true);
  }, [hasInitializedMap, isMapReady, tripBounds]);

  // Auto-zoom to the active leg once per leg transition.
  useEffect(() => {
    if (!isMapReady || !fitToLegBounds) return;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: fitToLegBounds.minLat, longitude: fitToLegBounds.minLon },
        { latitude: fitToLegBounds.maxLat, longitude: fitToLegBounds.maxLon },
      ],
      {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        maxZoom: MIN_NAV_ZOOM,
      }
    );
    legZoomedRef.current.add(currentLegIndex);
    legTransitionTimeRef.current = Date.now();
  }, [currentLegIndex, fitToLegBounds, isMapReady]);

  // Follow the user while follow mode is enabled, except right after a leg zoom.
  useEffect(() => {
    if (!isMapReady || !isFollowMode || !userLocation) return;
    if (Date.now() - legTransitionTimeRef.current < 2000) return;
    mapRef.current?.animateToRegion(
      buildRegionForLocation(userLocation.latitude, userLocation.longitude),
      500
    );
  }, [isFollowMode, isMapReady, userLocation]);

  // Jump to current location when requested.
  useEffect(() => {
    if (!isMapReady || !jumpToLocationTrigger || !userLocation) return;
    mapRef.current?.animateToRegion(
      buildRegionForLocation(userLocation.latitude, userLocation.longitude),
      500
    );
  }, [isMapReady, jumpToLocationTrigger, userLocation]);

  // Restore the full trip overview when requested.
  useEffect(() => {
    if (!isMapReady || !showOverviewTrigger || !tripBounds) return;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: tripBounds.minLat, longitude: tripBounds.minLon },
        { latitude: tripBounds.maxLat, longitude: tripBounds.maxLon },
      ],
      { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 } }
    );
  }, [isMapReady, showOverviewTrigger, tripBounds]);

  // Keep north-up / heading-up behavior using the MapLibre map bearing.
  useEffect(() => {
    if (!isMapReady) return;
    if (isHeadingUp && isWalkingLeg && isTouchDevice) {
      mapRef.current?.setBearing(-(userLocation?.heading ?? 0));
      return;
    }
    mapRef.current?.setBearing(0);
  }, [isHeadingUp, isMapReady, isTouchDevice, isWalkingLeg, userLocation?.heading]);

  const initialRegion = userLocation
    ? buildRegionForLocation(userLocation.latitude, userLocation.longitude)
    : MAP_CONFIG.INITIAL_REGION;

  return (
    <View style={styles.container}>
      <WebMapView
        ref={mapRef}
        initialRegion={initialRegion}
        onMapReady={() => setIsMapReady(true)}
      >
        {routePolylines.map((route) => (
          <WebRoutePolyline
            key={route.id}
            coordinates={route.coordinates}
            color={route.color}
            strokeWidth={route.weight}
            dashArray={route.dashArray}
            opacity={route.opacity}
            outlineWidth={0}
            interactive={false}
          />
        ))}

        {markers.map((marker) => (
          <WebHtmlMarker
            key={marker.id}
            coordinate={positionToCoordinate(marker.position)}
            html={buildNavMarkerHtml(marker.type)}
            className={`nav-marker-${marker.type}`}
            zIndexOffset={700}
          />
        ))}

        {userLocation && (
          <WebHtmlMarker
            coordinate={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
            html={buildNavMarkerHtml('user')}
            className="nav-marker-user"
            zIndexOffset={900}
          />
        )}

        {busStopMarker && (
          <WebHtmlMarker
            coordinate={positionToCoordinate(busStopMarker.position)}
            html={buildBusStopMarkerHtml()}
            className="nav-bus-stop-marker"
            zIndexOffset={800}
            popupHtml={busStopMarker.name ? `<strong>${escapeHtml(busStopMarker.name)}</strong>` : null}
          />
        )}

        {trackedBusMarker && (
          <WebBusMarker
            key={trackedBusMarker.id}
            vehicle={{
              id: trackedBusMarker.id,
              routeId: trackedBusMarker.routeShortName,
              label: trackedBusMarker.routeShortName,
              bearing: trackedBusMarker.bearing,
              coordinate: positionToCoordinate(trackedBusMarker.position),
            }}
            color={trackedBusMarker.color}
            routeLabel={trackedBusMarker.routeShortName}
          />
        )}

        {walkingBusMarker && (
          <WebBusMarker
            key={walkingBusMarker.id}
            vehicle={{
              id: walkingBusMarker.id,
              routeId: walkingBusMarker.routeShortName,
              label: walkingBusMarker.routeShortName,
              bearing: walkingBusMarker.bearing,
              coordinate: positionToCoordinate(walkingBusMarker.position),
            }}
            color={walkingBusMarker.color}
            routeLabel={walkingBusMarker.routeShortName}
          />
        )}
      </WebMapView>

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
                <Text style={styles.offRouteRecalcText}>
                  {isRecalculatingRoute ? 'Recalculating...' : 'Recalculate'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={clearOffRouteState}
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

        <TouchableOpacity
          style={styles.exitNavigationButton}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Exit navigation"
        >
          <Text style={styles.exitNavigationButtonIcon}>✕</Text>
          <Text style={styles.exitNavigationButtonText}>Exit Navigation</Text>
        </TouchableOpacity>

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
  exitNavigationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: COLORS.grey300,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.xs,
    ...SHADOWS.medium,
  },
  exitNavigationButtonIcon: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  exitNavigationButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    fontWeight: '700',
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
