/**
 * NavigationScreen
 *
 * Full-screen turn-by-turn navigation experience for transit trips.
 * Features:
 * - Real-time location tracking with follow mode
 * - Walking directions with step-by-step instructions
 * - Bus proximity tracking while waiting
 * - Auto-advance through trip legs
 * - Manual override for step completion
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Text,
  Alert,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Map components - MapLibre
import MapLibreGL from '@maplibre/maplibre-react-native';
import { MAP_CONFIG, OSM_MAP_STYLE, MIN_NAV_ZOOM } from '../config/constants';
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
import PulsingSpinner from '../components/PulsingSpinner';

// Context for route shapes
import { useTransitStatic, useTransitRealtime } from '../context/TransitContext';

// Hooks
import { useNavigationLocation } from '../hooks/useNavigationLocation';
import { useNavigationTripViewModel } from '../hooks/useNavigationTripViewModel';
import { useBusProximity } from '../hooks/useBusProximity';
import { useStepProgress } from '../hooks/useStepProgress';

// Walking enrichment (fetched on navigation start, not during preview)
import { enrichItineraryWithWalking } from '../services/walkingService';
import { recalculateNavigationItinerary } from '../services/navigationRecalculationService';
import * as Haptics from 'expo-haptics';
import logger from '../utils/logger';
import { decodePolyline, findClosestPointIndex, extractShapeSegment } from '../utils/polylineUtils';
import { haversineDistance, pointToPolylineDistance } from '../utils/geometryUtils';
import {
  collectItineraryEndpointCoordinates,
  computeCoordinateBounds,
  computeLegBounds,
} from '../utils/itineraryViewport';
import RoutePolyline from '../components/RoutePolyline';
import Icon from '../components/Icon';
import Svg, { Circle, Path } from 'react-native-svg';

const trackNavigationEvent = (eventName, params) => {
  try {
    const { trackEvent } = require('../services/analyticsService');
    trackEvent(eventName, params);
  } catch {}
};

const NavigationScreen = ({ route }) => {
  const navigation = useNavigation();
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const legZoomedRef = useRef(new Set());
  const legTransitionTimeRef = useRef(0);

  const initialItinerary = route.params?.itinerary;
  const [itinerary, setItinerary] = useState(initialItinerary);

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

  // State
  const [isFollowMode, setIsFollowMode] = useState(false); // Start with trip overview, not following
  const [followMode, setFollowMode] = useState('full-trip'); // 'my-location' | 'full-trip'
  const [hasInitializedMap, setHasInitializedMap] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const offRouteTimerRef = useRef(null);
  const [isHeadingUp, setIsHeadingUp] = useState(false); // Compass/heading-up mode (walking only)
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const [showMissedBusWarning, setShowMissedBusWarning] = useState(false);
  const [isRecalculatingRoute, setIsRecalculatingRoute] = useState(false);
  const staleCheckedRef = useRef(false);
  const missedBusWarningRef = useRef(false);
  const followCameraRef = useRef({
    heading: null,
    lastUpdatedAt: 0,
    latitude: null,
    longitude: null,
  });

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

  // Step progress management (defined first so we can use isUserOnBoard)
  const {
    currentLegIndex,
    currentLeg,
    currentStepIndex,
    currentWalkingStep,
    legStatus,
    transitStatus,
    totalLegs,
    isUserOnBoard,
    navigationState,
    instructionText,
    distanceToDestination,
    hasArrivedAtDestination,
    isNavigationComplete,
    startNavigation,
    advanceStep,
    advanceLeg,
    boardBus,
    alightBus,
    completeLeg,
    resetNavigation,
  } = useStepProgress(itinerary, userLocation, null); // busProximity passed after it's created

  // Haptic feedback — fire once per key per leg
  const hapticFiredRef = useRef({});

  const triggerHapticOnce = async (key, type) => {
    if (hapticFiredRef.current[key]) return;
    hapticFiredRef.current[key] = true;
    try {
      await Haptics.notificationAsync(type);
    } catch (_) {
      // Haptics not available on web — silently ignore
    }
  };

  // Reset haptic tracking when the leg changes
  useEffect(() => {
    hapticFiredRef.current = {};
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

  // Bus proximity tracking with user location and on-board status
  const busProximity = useBusProximity(currentTransitLeg, true, userLocation, isUserOnBoard);

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

  // Fit map to trip bounds on initial load
  useEffect(() => {
    if (!hasInitializedMap && tripBounds && cameraRef.current) {
      cameraRef.current.setCamera({
        bounds: { ne: tripBounds.ne, sw: tripBounds.sw },
        padding: { paddingTop: 100, paddingRight: 50, paddingBottom: 200, paddingLeft: 50 },
        animationDuration: 500,
      });
      setHasInitializedMap(true);
    }
  }, [tripBounds, hasInitializedMap]);

  // Auto-zoom to fit current leg extent on each leg transition (fires once per leg)
  useEffect(() => {
    if (legZoomedRef.current.has(currentLegIndex)) return;
    const bounds = computeLegBounds(currentLeg);
    if (!bounds) return;
    if (!cameraRef.current) return;

    cameraRef.current.setCamera({
      bounds: {
        ne: bounds.ne,
        sw: bounds.sw,
        paddingTop: 100,
        paddingBottom: 300,
        paddingLeft: 50,
        paddingRight: 50,
      },
      animationDuration: 600,
    });

    legZoomedRef.current.add(currentLegIndex);
    legTransitionTimeRef.current = Date.now();
  }, [currentLegIndex, currentLeg]);

  // Start location tracking and navigation on mount
  useEffect(() => {
    const initNavigation = async () => {
      const success = await startTracking();
      if (success) {
        startNavigation();
      } else {
        Alert.alert(
          'Location Required',
          'Navigation requires location access. Please enable location services.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    };
    initNavigation();

    return () => {
      stopTracking();
    };
  }, []);

  // Center map on user location when in follow mode, and apply heading rotation during walking
  // Skip for 2 seconds after a leg transition so the per-leg zoom isn't immediately overridden
  useEffect(() => {
    if ((isFollowMode || followMode === 'my-location') && userLocation && cameraRef.current) {
      if (Date.now() - legTransitionTimeRef.current < 2000) return;

      const now = Date.now();
      const heading = (isHeadingUp && isWalkingLeg && userLocation.heading != null)
        ? userLocation.heading
        : 0;
      const zoom = isHeadingUp && isWalkingLeg ? 17 : MIN_NAV_ZOOM;
      const previousCamera = followCameraRef.current;
      const movedMeters = previousCamera.latitude == null || previousCamera.longitude == null
        ? Infinity
        : haversineDistance(
            previousCamera.latitude,
            previousCamera.longitude,
            userLocation.latitude,
            userLocation.longitude
          );
      const headingDelta = previousCamera.heading == null
        ? Infinity
        : Math.abs((((heading - previousCamera.heading) % 360) + 540) % 360 - 180);
      const minIntervalMs = Platform.OS === 'android' ? 1200 : 500;
      const minMoveMeters = Platform.OS === 'android' ? 12 : 4;
      const minHeadingDelta = 10;

      if (
        now - previousCamera.lastUpdatedAt < minIntervalMs &&
        movedMeters < minMoveMeters &&
        headingDelta < minHeadingDelta
      ) {
        return;
      }

      followCameraRef.current = {
        heading,
        lastUpdatedAt: now,
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      };

      cameraRef.current.setCamera({
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        zoomLevel: zoom,
        heading,
        animationDuration: Platform.OS === 'android' ? 250 : 500,
      });
    }
  }, [userLocation, isFollowMode, followMode, isHeadingUp, isWalkingLeg]);

  // When heading-up is toggled off (or leg is no longer walking), snap heading back to north
  useEffect(() => {
    if (!isHeadingUp || !isWalkingLeg) {
      if (cameraRef.current && (isFollowMode || followMode === 'my-location')) {
        cameraRef.current.setCamera({
          heading: 0,
          animationDuration: 300,
        });
      }
    }
  }, [isHeadingUp, isWalkingLeg]);

  // Handle navigation completion
  useEffect(() => {
    if (isNavigationComplete) {
      try {
        const { trackEvent } = require('../services/analyticsService');
        trackEvent('navigation_completed');
      } catch {}
      try {
        const { maybeRequestReview } = require('../services/reviewService');
        maybeRequestReview();
      } catch {}
      // Set nudge flag for post-trip survey banner on HomeScreen
      AsyncStorage.setItem('@barrie_transit_show_survey_nudge', 'true').catch(() => {});
      Alert.alert(
        'Trip Complete!',
        'You have arrived at your destination.',
        [
          {
            text: 'Done',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    }
  }, [isNavigationComplete, navigation]);

  // Auto-update transit status when bus arrives (board prompt)
  useEffect(() => {
    if (!currentTransitLeg) return;
    if (transitStatus === 'waiting' && busProximity?.hasArrived) {
      // Bus has arrived - the BusProximityCard will show the "I'm on the bus" button
      // No automatic boarding - user must confirm
      triggerHapticOnce('bus-arrived', Haptics.NotificationFeedbackType.Success);
    }
  }, [currentTransitLeg, transitStatus, busProximity?.hasArrived]);

  // Auto-advance when user should get off the bus
  useEffect(() => {
    if (!currentTransitLeg) return;
    if (transitStatus === 'on_board' && busProximity?.shouldGetOff) {
      triggerHapticOnce('alight-soon', Haptics.NotificationFeedbackType.Warning);
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

  // Get route polylines for map
  const routePolylines = useMemo(() => {
    if (!itinerary?.legs) return [];

    const result = [];

    itinerary.legs.forEach((leg, index) => {
      let coordinates = [];
      const isWalk = leg.mode === 'WALK';
      const isTransit = leg.mode === 'BUS' || leg.mode === 'TRANSIT';

      if (leg.legGeometry?.points) {
        coordinates = decodePolyline(leg.legGeometry.points);
      } else if (isTransit && leg.route?.id && leg.from && leg.to) {
        const routeId = leg.route.id;
        const shapeIds = routeShapeMapping[routeId] || [];

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

          if (segment.length > bestLength) {
            bestLength = segment.length;
            bestSegment = segment;
          }
        }

        coordinates = bestSegment.length > 0 ? bestSegment : [
          { latitude: leg.from.lat, longitude: leg.from.lon },
          { latitude: leg.to.lat, longitude: leg.to.lon },
        ];
      } else if (leg.from && leg.to) {
        coordinates = [
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

      const strokeWidth = isCurrentLeg ? 5 : 3;
      const lineDashPattern = isWalk ? [10, 5] : leg.isOnDemand ? [8, 6] : null;
      const opacity = isCompletedLeg ? 0.5 : 1;

      // For the current leg, split at the user's position into completed (grey) and remaining (colored)
      if (isCurrentLeg && userLocation && coordinates.length > 1) {
        const splitIdx = findClosestPointIndex(
          coordinates,
          userLocation.latitude,
          userLocation.longitude
        );

        if (splitIdx > 0 && splitIdx < coordinates.length - 1) {
          // Completed portion: from start up to user position (grey, lower opacity)
          result.push({
            id: `leg-${index}-completed`,
            coordinates: coordinates.slice(0, splitIdx + 1),
            color: '#9E9E9E',
            strokeWidth,
            lineDashPattern,
            opacity: 0.5,
          });
          // Remaining portion: from user position to end (full route color)
          result.push({
            id: `leg-${index}-remaining`,
            coordinates: coordinates.slice(splitIdx),
            color: routeColor,
            strokeWidth,
            lineDashPattern,
            opacity,
          });
          return;
        }
      }

      result.push({
        id: `leg-${index}`,
        coordinates,
        color: routeColor,
        strokeWidth,
        lineDashPattern,
        opacity,
      });
    });

    return result;
  }, [itinerary, currentLegIndex, userLocation, shapes, routeShapeMapping]);

  // Get markers for map
  const markers = useMemo(() => {
    if (!itinerary?.legs) return [];

    const result = [];
    const legs = itinerary.legs;

    // Origin marker
    if (legs[0]?.from) {
      result.push({
        id: 'origin',
        coordinate: [legs[0].from.lon, legs[0].from.lat],
        type: 'origin',
        title: 'Start',
      });
    }

    // Destination marker
    const lastLeg = legs[legs.length - 1];
    if (lastLeg?.to) {
      result.push({
        id: 'destination',
        coordinate: [lastLeg.to.lon, lastLeg.to.lat],
        type: 'destination',
        title: 'End',
      });
    }

    // Current leg destination (for visual guidance)
    if (currentLeg?.to && currentLegIndex < legs.length - 1) {
      result.push({
        id: 'current-destination',
        coordinate: [currentLeg.to.lon, currentLeg.to.lat],
        type: 'waypoint',
        title: currentLeg.to.name,
      });
    }

    // Bus stop marker (boarding point for transit leg)
    if (currentTransitLeg?.from && transitStatus === 'waiting') {
      result.push({
        id: 'bus-stop',
        coordinate: [currentTransitLeg.from.lon, currentTransitLeg.from.lat],
        type: 'bus-stop',
        title: currentTransitLeg.from.name,
      });
    }

    return result;
  }, [itinerary, currentLeg, currentLegIndex, currentTransitLeg, transitStatus]);

  // Get tracked bus marker
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
      coordinate: [
        vehicle.coordinate.longitude,
        vehicle.coordinate.latitude,
      ],
      color: currentTransitLeg.route?.color || COLORS.primary,
      routeShortName: currentTransitLeg.route?.shortName || '?',
      bearing: vehicle.bearing,
    };
  }, [currentTransitLeg, vehicles, busProximity?.vehicle]);

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
      coordinate: [
        vehicle.coordinate.longitude,
        vehicle.coordinate.latitude,
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
      // Build polyline from step geometry
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
      setFollowMode('full-trip');
      setHasInitializedMap(false);
      setItinerary(nextItinerary);
      resetNavigation();
      startNavigation();
    } catch (error) {
      logger.error('Navigation reroute failed:', error);
      trackNavigationEvent('navigation_reroute_failed', {
        code: error?.code || 'UNKNOWN_ERROR',
      });
      Alert.alert('Could Not Recalculate', error.message || 'A new route could not be generated right now.');
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
    navigation.navigate('MapMain', { exitTripPlanning: true });
  };

  // Cancel exit - close modal
  const cancelExit = () => {
    setShowExitModal(false);
  };

  // Toggle follow mode
  const toggleFollowMode = () => {
    setIsFollowMode(!isFollowMode);
    if (!isFollowMode && userLocation) {
      cameraRef.current?.setCamera({
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        zoomLevel: 17,
        animationDuration: 500,
      });
    }
  };

  // Jump to current location (one-time, doesn't enable follow mode)
  const jumpToMyLocation = () => {
    if (userLocation && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        zoomLevel: 17,
        animationDuration: 500,
      });
    }
  };

  // Show full trip overview
  const showTripOverview = () => {
    if (tripBounds && cameraRef.current) {
      setIsFollowMode(false);
      setFollowMode('full-trip');
      cameraRef.current.setCamera({
        bounds: { ne: tripBounds.ne, sw: tripBounds.sw },
        padding: { paddingTop: 100, paddingRight: 50, paddingBottom: 200, paddingLeft: 50 },
        animationDuration: 500,
      });
    }
  };
  const handleBoundsFit = useCallback(() => {}, []);
  void handleBoundsFit;

  // Initial camera settings
  const initialCameraCenter = useMemo(() => {
    if (!itinerary?.legs || itinerary.legs.length === 0) {
      return [MAP_CONFIG.INITIAL_REGION.longitude, MAP_CONFIG.INITIAL_REGION.latitude];
    }
    const first = itinerary.legs[0];
    if (first?.from) return [first.from.lon, first.from.lat];
    return [MAP_CONFIG.INITIAL_REGION.longitude, MAP_CONFIG.INITIAL_REGION.latitude];
  }, [itinerary]);

  return (
    <View style={styles.container}>
      {/* Map */}
      <View
        style={styles.map}
        onTouchStart={() => setIsFollowMode(false)}
      >
        <MapLibreGL.MapView
          ref={mapRef}
          style={styles.map}
          mapStyle={OSM_MAP_STYLE}
          rotateEnabled
          pitchEnabled={false}
          attributionPosition={{ bottom: 8, left: 8 }}
          logoEnabled={false}
        >
          <MapLibreGL.Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: initialCameraCenter,
              zoomLevel: 14,
            }}
          />
          <MapLibreGL.UserLocation visible={true} />

          {/* Route polylines */}
          {routePolylines.map((routeLine) => (
            <RoutePolyline
              key={routeLine.id}
              id={`nav-${routeLine.id}`}
              coordinates={routeLine.coordinates}
              color={routeLine.color}
              strokeWidth={routeLine.strokeWidth}
              lineDashPattern={routeLine.lineDashPattern}
              opacity={routeLine.opacity}
            />
          ))}

          {/* Markers */}
          {markers.map((marker) => (
            <MapLibreGL.PointAnnotation
              key={marker.id}
              id={`nav-marker-${marker.id}`}
              coordinate={marker.coordinate}
            >
              <View
                style={[
                  styles.marker,
                  marker.type === 'origin' && styles.markerOrigin,
                  marker.type === 'destination' && styles.markerDestination,
                  marker.type === 'waypoint' && styles.markerWaypoint,
                  marker.type === 'bus-stop' && styles.markerBusStop,
                ]}
              >
                {marker.type === 'bus-stop' ? (
                  <Icon name="MapPin" size={16} color={COLORS.primary} />
                ) : (
                  <View style={styles.markerInner} />
                )}
              </View>
            </MapLibreGL.PointAnnotation>
          ))}

          {/* Tracked Bus Marker */}
          {trackedBusMarker && (
            <MapLibreGL.PointAnnotation
              id={`nav-${trackedBusMarker.id}`}
              coordinate={trackedBusMarker.coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.busMarkerContainer}>
                <View style={[styles.busMarker, { backgroundColor: trackedBusMarker.color }]}>
                  <Text style={styles.busMarkerText}>{trackedBusMarker.routeShortName}</Text>
                </View>
                <View style={[styles.busMarkerArrow, { borderBottomColor: trackedBusMarker.color }]} />
              </View>
            </MapLibreGL.PointAnnotation>
          )}

          {/* Next Bus Marker (shown during walking legs) */}
          {walkingBusMarker && (
            <MapLibreGL.PointAnnotation
              id={`nav-${walkingBusMarker.id}`}
              coordinate={walkingBusMarker.coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.busMarkerContainer}>
                <View style={[styles.busMarker, { backgroundColor: walkingBusMarker.color }]}>
                  <Text style={styles.busMarkerText}>{walkingBusMarker.routeShortName}</Text>
                </View>
                <View style={[styles.busMarkerArrow, { borderBottomColor: walkingBusMarker.color }]} />
              </View>
            </MapLibreGL.PointAnnotation>
          )}
        </MapLibreGL.MapView>
      </View>

      {/* GPS Acquisition Overlay */}
      {isAcquiringGPS && (
        <View style={styles.gpsOverlay}>
          <View style={styles.gpsCard}>
            <PulsingSpinner size={28} />
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
        {/* Compass / heading-up toggle — only during walking legs */}
        {isWalkingLeg && (
          <TouchableOpacity
            style={[styles.mapControlBtn, isHeadingUp && styles.mapControlBtnActive]}
            onPress={() => setIsHeadingUp(prev => !prev)}
            accessibilityLabel={isHeadingUp ? 'Switch to north-up' : 'Switch to heading-up'}
          >
            <Svg width={22} height={22} viewBox="0 0 22 22">
              <Circle cx={11} cy={11} r={10} stroke={isHeadingUp ? COLORS.white : COLORS.grey400} strokeWidth={1.5} fill="none" />
              {/* North needle (red/white) */}
              <Path
                d="M11 2 L13 11 L11 9 L9 11 Z"
                fill={isHeadingUp ? COLORS.white : COLORS.error}
              />
              {/* South needle (grey) */}
              <Path
                d="M11 20 L9 11 L11 13 L13 11 Z"
                fill={isHeadingUp ? 'rgba(255,255,255,0.5)' : COLORS.grey400}
              />
              {/* Center dot */}
              <Circle cx={11} cy={11} r={1.5} fill={isHeadingUp ? COLORS.white : COLORS.textPrimary} />
            </Svg>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.mapControlBtn, followMode === 'my-location' && styles.mapControlBtnActive]}
          onPress={() => setFollowMode('my-location')}
          accessibilityLabel="Center on my location"
        >
          <Icon name="MapPin" size={20} color={followMode === 'my-location' ? COLORS.white : COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mapControlBtn, followMode === 'full-trip' && styles.mapControlBtnActive]}
          onPress={() => { setFollowMode('full-trip'); showTripOverview(); }}
          accessibilityLabel="Show full trip"
        >
          <Icon name="Map" size={20} color={followMode === 'full-trip' ? COLORS.white : COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Bottom Section */}
      <View style={styles.bottomSection}>
        {/* Destination Banner — only shown during transit legs */}
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

        {/* Walking Instruction Card */}
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
                stopsUntilAlighting={busProximity.stopsUntilAlighting}
                estimatedArrival={busProximity.estimatedArrival}
                isApproaching={busProximity.isApproaching}
                hasArrived={busProximity.hasArrived}
                isTracking={busProximity.isTracking}
                headsign={currentLeg?.headsign}
                isOnBoard={isUserOnBoard}
                nearAlightingStop={busProximity.nearAlightingStop}
                shouldGetOff={busProximity.shouldGetOff}
                onBoardBus={boardBus}
                onAlightBus={alightBus}
                alightingStopName={currentLeg?.to ? `${currentLeg.to.name}${currentLeg.to.stopCode ? ` (#${currentLeg.to.stopCode})` : ''}` : undefined}
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
                  onPress={() => Linking.openURL(`tel:${currentLeg.bookingPhone}`)}
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
          <Icon name="X" size={16} color={COLORS.textPrimary} />
          <Text style={styles.exitNavigationButtonText}>Exit Navigation</Text>
        </TouchableOpacity>

        {/* Progress Bar */}
        <NavigationProgressBar
          legs={itinerary?.legs || []}
          currentLegIndex={currentLegIndex}
        />

        {/* Step Overview Sheet */}
        <StepOverviewSheet
          legs={itinerary?.legs || []}
          currentLegIndex={currentLegIndex}
          onSelectLeg={() => {}}
          onCompleteLeg={completeLeg}
        />
      </View>

      {/* Location Error Overlay */}
      {locationError && (
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <Icon name="MapPin" size={32} color={COLORS.error} />
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
  map: {
    flex: 1,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  exitNavigationButton: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    minHeight: 48,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: COLORS.grey300,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    ...SHADOWS.medium,
  },
  exitNavigationButtonText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  mapControls: {
    position: 'absolute',
    right: 16,
    bottom: 160,
    gap: 8,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  mapControlBtnActive: {
    backgroundColor: COLORS.primary,
  },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  markerOrigin: {
    backgroundColor: COLORS.success,
  },
  markerDestination: {
    backgroundColor: COLORS.error,
  },
  markerWaypoint: {
    backgroundColor: COLORS.warning,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  markerBusStop: {
    backgroundColor: COLORS.secondary,
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  busStopIcon: {
    fontSize: 16,
  },
  markerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white,
  },
  busMarkerContainer: {
    alignItems: 'center',
  },
  busMarker: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.white,
    ...SHADOWS.medium,
  },
  busMarkerText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  busMarkerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    transform: [{ rotate: '180deg' }],
    marginTop: -2,
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
