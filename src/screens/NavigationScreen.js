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
import { MAP_CONFIG, OSM_MAP_STYLE } from '../config/constants';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

// Navigation components
import NavigationHeader from '../components/navigation/NavigationHeader';
import WalkingInstructionCard from '../components/navigation/WalkingInstructionCard';
import BusProximityCard from '../components/navigation/BusProximityCard';
import BoardingInstructionCard from '../components/navigation/BoardingInstructionCard';
import StepOverviewSheet from '../components/navigation/StepOverviewSheet';
import ExitConfirmationModal from '../components/navigation/ExitConfirmationModal';
import TransitStopGuideCard from '../components/navigation/TransitStopGuideCard';
import PulsingSpinner from '../components/PulsingSpinner';

// Context for route shapes
import { useTransitStatic, useTransitRealtime } from '../context/TransitContext';
import BusMarker from '../components/BusMarker';

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
  collectItineraryViewportCoordinates,
  computeCoordinateBounds,
  distanceToBoundsMeters,
} from '../utils/itineraryViewport';
import { buildTransitStopProgress } from '../utils/transitStopUtils';
import { buildWalkingLandmarkMarkers } from '../utils/navigationMapMarkers';
import {
  buildCurrentStepBusPreviewLine,
  buildRoutePathsByRouteId,
  getVehicleSnapPath,
} from '../utils/navigationBusPreview';
import RoutePolyline from '../components/RoutePolyline';
import Icon from '../components/Icon';
import TripViewportControls from '../components/TripViewportControls';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const trackNavigationEvent = (eventName, params) => {
  try {
    const { trackEvent } = require('../services/analyticsService');
    trackEvent(eventName, params);
  } catch {}
};

const MAX_NAVIGATION_LOCATION_DISTANCE_FROM_TRIP_METERS = 25000;
const GOOGLE_WALK_BLUE = '#4285F4';
const GOOGLE_WALK_BLUE_DARK = '#1967D2';

const NavigationMarkerGlyph = ({ type, color = COLORS.white }) => {
  switch (type) {
    case 'walk-start':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={6} stroke={color} strokeWidth={2.5} fill="none" />
          <Circle cx={12} cy={12} r={2.5} fill={color} />
        </Svg>
      );
    case 'walk-current':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M12 3V7M12 17V21M3 12H7M17 12H21"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Circle cx={12} cy={12} r={3} fill={color} />
        </Svg>
      );
    case 'walk-target-stop':
    case 'bus-stop':
    case 'transit-next-stop':
    case 'transit-intermediate-stop':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Rect x={5} y={7} width={14} height={8} rx={2} fill={color} />
          <Rect x={7} y={9} width={4} height={3} rx={0.5} fill={COLORS.grey900} />
          <Rect x={13} y={9} width={4} height={3} rx={0.5} fill={COLORS.grey900} />
          <Circle cx={8.5} cy={17.5} r={1.4} fill={color} />
          <Circle cx={15.5} cy={17.5} r={1.4} fill={color} />
        </Svg>
      );
    case 'transit-alight-stop':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M12 20C12 20 17 14.8 17 11.4C17 8.5 14.9 6.5 12 6.5C9.1 6.5 7 8.5 7 11.4C7 14.8 12 20 12 20Z"
            fill={color}
          />
          <Rect x={8.2} y={10.1} width={7.6} height={4.8} rx={1.2} fill={COLORS.white} />
          <Rect x={9.4} y={11.1} width={2.1} height={1.4} rx={0.3} fill={COLORS.error} />
          <Rect x={12.5} y={11.1} width={2.1} height={1.4} rx={0.3} fill={COLORS.error} />
        </Svg>
      );
    case 'walk-target-destination':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M12 20C12 20 17 14.8 17 11.4C17 8.5 14.9 6.5 12 6.5C9.1 6.5 7 8.5 7 11.4C7 14.8 12 20 12 20Z"
            fill={color}
          />
          <Circle cx={12} cy={11.3} r={2} fill={COLORS.error} />
        </Svg>
      );
    default:
      return <View style={styles.markerInner} />;
  }
};

const NavigationScreen = ({ route }) => {
  const navigation = useNavigation();
  const mapRef = useRef(null);
  const cameraRef = useRef(null);

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
  const { shapes, routeShapeMapping, tripMapping, ensureRoutingData, stops } = useTransitStatic();
  const { vehicles, onDemandZones } = useTransitRealtime();

  // State
  const [isFollowMode, setIsFollowMode] = useState(false); // Start with trip overview, not following
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
    location: rawUserLocation,
    error: locationError,
    isTracking,
    startTracking,
    stopTracking,
  } = useNavigationLocation();

  const [isAcquiringGPS, setIsAcquiringGPS] = useState(true);

  useEffect(() => {
    if (rawUserLocation) {
      setIsAcquiringGPS(false);
    }
  }, [rawUserLocation]);

  const tripViewportCoordinates = useMemo(
    () => collectItineraryViewportCoordinates(itinerary),
    [itinerary]
  );
  const tripBounds = useMemo(
    () => computeCoordinateBounds(tripViewportCoordinates),
    [tripViewportCoordinates]
  );

  const routePathsByRouteId = useMemo(() => (
    buildRoutePathsByRouteId({ shapes, routeShapeMapping })
  ), [shapes, routeShapeMapping]);

  const userLocation = useMemo(() => {
    if (!rawUserLocation || !tripBounds) return rawUserLocation;

    const distanceFromTripMeters = distanceToBoundsMeters(tripBounds, rawUserLocation);
    if (distanceFromTripMeters > MAX_NAVIGATION_LOCATION_DISTANCE_FROM_TRIP_METERS) {
      logger.warn('Ignoring implausible navigation location outside trip area', {
        distanceFromTripMeters: Math.round(distanceFromTripMeters),
        latitude: rawUserLocation.latitude,
        longitude: rawUserLocation.longitude,
      });
      return null;
    }

    return rawUserLocation;
  }, [rawUserLocation, tripBounds]);

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

  // Center map on user location when in follow mode, without changing the rider's zoom level.
  useEffect(() => {
    if (isFollowMode && userLocation && cameraRef.current) {
      const now = Date.now();
      const heading = (isHeadingUp && isWalkingLeg && userLocation.heading != null)
        ? userLocation.heading
        : 0;
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
        heading,
        animationDuration: Platform.OS === 'android' ? 250 : 500,
      });
    }
  }, [userLocation, isFollowMode, isHeadingUp, isWalkingLeg]);

  // When heading-up is toggled off (or leg is no longer walking), snap heading back to north
  useEffect(() => {
    if (!isHeadingUp || !isWalkingLeg) {
      if (cameraRef.current && isFollowMode) {
        cameraRef.current.setCamera({
          heading: 0,
          animationDuration: 300,
        });
      }
    }
  }, [isFollowMode, isHeadingUp, isWalkingLeg]);

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
      triggerHapticOnce('bus-arrived', Haptics.NotificationFeedbackType.Success);
    }
  }, [currentTransitLeg, transitStatus, busProximity?.hasArrived]);

  // Auto-advance when sustained high-confidence alighting evidence is present
  useEffect(() => {
    if (!currentTransitLeg) return;
    if (transitStatus === 'on_board' && busProximity?.autoAlightReady) {
      triggerHapticOnce('alight-soon', Haptics.NotificationFeedbackType.Warning);
      // Auto-alight after 3 seconds if user doesn't respond
      const timer = setTimeout(() => {
        alightBus();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentTransitLeg, transitStatus, busProximity?.autoAlightReady, alightBus]);

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

      const isCurrentWalkLeg = isCurrentLeg && isWalk;
      const routeColor = isCompletedLeg
        ? COLORS.grey400
        : isCurrentWalkLeg
        ? GOOGLE_WALK_BLUE
        : isWalk
        ? COLORS.grey500
        : leg.isOnDemand
        ? (leg.zoneColor || COLORS.primary)
        : (leg.route?.color || COLORS.primary);

      const strokeWidth = isCurrentWalkLeg ? 6 : isCurrentLeg ? 7 : 4;
      const lineDashPattern = isCurrentWalkLeg ? null : isWalk ? [10, 5] : leg.isOnDemand ? [8, 6] : null;
      const opacity = isCompletedLeg ? 0.28 : isCurrentLeg ? 1 : 0.62;
      const outlineWidth = isCurrentWalkLeg ? 4 : 2;
      const outlineColor = isCurrentWalkLeg ? COLORS.white : undefined;

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
            color: isCurrentWalkLeg ? '#9BBBF9' : '#9E9E9E',
            strokeWidth,
            lineDashPattern,
            opacity: 0.5,
            outlineWidth,
            outlineColor,
          });
          // Remaining portion: from user position to end (full route color)
          result.push({
            id: `leg-${index}-remaining`,
            coordinates: coordinates.slice(splitIdx),
            color: routeColor,
            strokeWidth,
            lineDashPattern,
            opacity,
            outlineWidth,
            outlineColor,
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
        outlineWidth,
        outlineColor,
      });
    });

    return result;
  }, [itinerary, currentLegIndex, userLocation, shapes, routeShapeMapping]);

  // Get markers for map
  const markers = useMemo(() => {
    if (!itinerary?.legs) return [];

    const result = [];
    const legs = itinerary.legs;

    if (isWalkingLeg && currentLeg?.from && currentLeg?.to) {
      return result;
    }

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
  }, [itinerary, currentLeg, currentLegIndex, currentTransitLeg, transitStatus, isWalkingLeg, userLocation]);

  const walkingLandmarkMarkers = useMemo(() => {
    if (!isWalkingLeg) return [];

    return buildWalkingLandmarkMarkers({
      itinerary,
      currentLeg,
      currentLegIndex,
      nextTransitLeg,
    }).map((marker) => ({
      ...marker,
      coordinate: [marker.longitude, marker.latitude],
    }));
  }, [itinerary, currentLeg, currentLegIndex, isWalkingLeg, nextTransitLeg]);

  const transitStopMarkers = useMemo(() => {
    if (!currentTransitLeg) return [];

    const progress = buildTransitStopProgress(
      currentTransitLeg,
      isUserOnBoard ? busProximity.stopsUntilAlighting : null
    );
    const markers = [];
    const nextStop = progress.nextStop;
    const exitStop = progress.alightingStop;

    if (nextStop) {
      markers.push({
        id: `transit-next-${nextStop.id}`,
        coordinate: [nextStop.lon, nextStop.lat],
        type: nextStop.type === 'alighting' ? 'transit-alight-stop' : 'transit-next-stop',
        title: nextStop.stopCode ? `${nextStop.name} (#${nextStop.stopCode})` : nextStop.name,
        caption: nextStop.type === 'alighting' ? 'Get off next' : 'Next stop',
      });
    }

    if (exitStop && exitStop.id !== nextStop?.id) {
      markers.push({
        id: `transit-exit-${exitStop.id}`,
        coordinate: [exitStop.lon, exitStop.lat],
        type: 'transit-alight-stop',
        title: exitStop.stopCode ? `${exitStop.name} (#${exitStop.stopCode})` : exitStop.name,
        caption: 'Your stop',
      });
    }

    return markers;
  }, [currentTransitLeg, isUserOnBoard, busProximity.stopsUntilAlighting]);

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
      vehicle: {
        ...vehicle,
        routeId: vehicle.routeId || routeId,
        coordinate: {
          latitude: vehicle.coordinate.latitude,
          longitude: vehicle.coordinate.longitude,
        },
      },
      color: currentTransitLeg.route?.color || COLORS.primary,
      routeId,
      routeShortName: currentTransitLeg.route?.shortName || '?',
      bearing: vehicle.bearing,
      snapPath: getVehicleSnapPath({
        ...vehicle,
        routeId: vehicle.routeId || routeId,
      }, routePathsByRouteId),
    };
  }, [currentTransitLeg, vehicles, busProximity?.vehicle, routePathsByRouteId]);

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
      vehicle: {
        ...vehicle,
        routeId: vehicle.routeId || transitLeg.route?.id || transitLeg.routeId,
        coordinate: {
          latitude: vehicle.coordinate.latitude,
          longitude: vehicle.coordinate.longitude,
        },
      },
      color: transitLeg.route?.color || COLORS.primary,
      routeShortName: transitLeg.route?.shortName || '?',
      snapPath: getVehicleSnapPath(
        {
          ...vehicle,
          routeId: vehicle.routeId || transitLeg.route?.id || transitLeg.routeId,
        },
        routePathsByRouteId
      ),
    };
  }, [isWalkingLeg, itinerary, currentLegIndex, nextTransitLeg, vehicles, nextTransitBusProximity?.vehicle]);

  const currentStepBusPreviewLine = useMemo(() => {
    return buildCurrentStepBusPreviewLine({
      isWalkingLeg,
      nextTransitLeg,
      walkingVehicle: walkingBusMarker?.vehicle,
      currentTransitLeg,
      transitVehicle: trackedBusMarker?.vehicle,
      transitStatus,
      shapes,
      tripMapping,
      routePathsByRouteId,
    });
  }, [
    currentTransitLeg,
    isWalkingLeg,
    nextTransitLeg,
    routePathsByRouteId,
    shapes,
    trackedBusMarker,
    transitStatus,
    tripMapping,
    walkingBusMarker,
  ]);

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
      staleCheckedRef.current = false;
      missedBusWarningRef.current = false;
      setShowStaleWarning(false);
      setShowMissedBusWarning(false);
      setIsFollowMode(false);
      setFollowMode('full-trip');
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
        animationDuration: 500,
      });
    }
  };

  // Jump to current location (one-time, doesn't enable follow mode)
  const jumpToMyLocation = () => {
    if (userLocation && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        animationDuration: 500,
      });
    }
  };

  // Show full trip overview
  const showTripOverview = () => {
    if (tripBounds && cameraRef.current && tripViewportCoordinates.length > 0) {
      setIsFollowMode(false);
      cameraRef.current.setCamera({
        bounds: { ne: tripBounds.ne, sw: tripBounds.sw },
        padding: { paddingTop: 100, paddingRight: 50, paddingBottom: 200, paddingLeft: 50 },
        animationDuration: 500,
      });
    }
  };

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
          <MapLibreGL.UserLocation visible={!isWalkingLeg} />

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
              outlineWidth={routeLine.outlineWidth}
              outlineColor={routeLine.outlineColor}
            />
          ))}

          {currentStepBusPreviewLine && (
            <RoutePolyline
              key={currentStepBusPreviewLine.id}
              id={currentStepBusPreviewLine.id}
              coordinates={currentStepBusPreviewLine.coordinates}
              color={currentStepBusPreviewLine.color}
              strokeWidth={3}
              lineDashPattern={[8, 6]}
              opacity={0.7}
              outlineColor={currentStepBusPreviewLine.color}
            />
          )}

          {/* Markers */}
          {markers.map((marker) => (
            <MapLibreGL.MarkerView
              key={marker.id}
              id={`nav-marker-${marker.id}`}
              coordinate={marker.coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View
                collapsable={false}
                style={[
                  styles.marker,
                  marker.type === 'origin' && styles.markerOrigin,
                  marker.type === 'destination' && styles.markerDestination,
                  marker.type === 'waypoint' && styles.markerWaypoint,
                  marker.type === 'bus-stop' && styles.markerBusStop,
                  marker.type === 'walk-start' && styles.markerWalkStart,
                  marker.type === 'walk-target-stop' && styles.markerWalkTargetStop,
                  marker.type === 'walk-target-destination' && styles.markerWalkTargetDestination,
                ]}
              >
                <NavigationMarkerGlyph type={marker.type} />
              </View>
            </MapLibreGL.MarkerView>
          ))}

          {walkingLandmarkMarkers.map((marker) => (
            <MapLibreGL.MarkerView
              key={marker.id}
              id={`nav-marker-${marker.id}`}
              coordinate={marker.coordinate}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View collapsable={false} style={styles.transitStopMarkerContainer}>
                <View
                  style={[
                    styles.mapStopLabelBubble,
                    marker.type === 'walk-start' && styles.mapStopLabelBubbleWalkStart,
                    marker.type !== 'walk-start' && styles.mapStopLabelBubbleWalkTarget,
                  ]}
                >
                  <Text
                    style={[
                      styles.mapStopLabelCaption,
                      marker.type === 'walk-start' && styles.mapStopLabelCaptionWalkStart,
                      marker.type !== 'walk-start' && styles.mapStopLabelCaptionWalkTarget,
                    ]}
                  >
                    {marker.caption}
                  </Text>
                  <Text style={styles.mapStopLabelName} numberOfLines={1}>
                    {marker.title}
                  </Text>
                </View>
                <View
                  style={[
                    styles.marker,
                    marker.type === 'walk-start' && styles.markerWalkStart,
                    marker.type === 'walk-target-stop' && styles.markerWalkTargetStop,
                    marker.type === 'walk-target-destination' && styles.markerWalkTargetDestination,
                  ]}
                >
                  <NavigationMarkerGlyph
                    type={marker.type}
                    color={marker.type === 'walk-target-stop' ? GOOGLE_WALK_BLUE : COLORS.white}
                  />
                </View>
              </View>
            </MapLibreGL.MarkerView>
          ))}

          {transitStopMarkers.map((marker) => (
            <MapLibreGL.MarkerView
              key={marker.id}
              id={`nav-marker-${marker.id}`}
              coordinate={marker.coordinate}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View collapsable={false} style={styles.transitStopMarkerContainer}>
                <View
                  style={[
                    styles.mapStopLabelBubble,
                    marker.type === 'transit-next-stop' && styles.mapStopLabelBubbleNext,
                    marker.type === 'transit-alight-stop' && styles.mapStopLabelBubbleExit,
                  ]}
                >
                  <Text
                    style={[
                      styles.mapStopLabelCaption,
                      marker.type === 'transit-next-stop' && styles.mapStopLabelCaptionNext,
                      marker.type === 'transit-alight-stop' && styles.mapStopLabelCaptionExit,
                    ]}
                  >
                    {marker.caption}
                  </Text>
                  <Text style={styles.mapStopLabelName} numberOfLines={1}>
                    {marker.title}
                  </Text>
                </View>
                <View
                  style={[
                    styles.marker,
                    marker.type === 'transit-next-stop' && styles.markerTransitNextStop,
                    marker.type === 'transit-intermediate-stop' && styles.markerTransitIntermediateStop,
                    marker.type === 'transit-alight-stop' && styles.markerTransitAlightStop,
                  ]}
                >
                  <NavigationMarkerGlyph type={marker.type} />
                </View>
              </View>
            </MapLibreGL.MarkerView>
          ))}

          {isWalkingLeg && userLocation && (
            <MapLibreGL.MarkerView
              id="nav-marker-current-location"
              coordinate={[userLocation.longitude, userLocation.latitude]}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View collapsable={false} style={styles.currentLocationMarkerHalo}>
                <View style={styles.currentLocationMarker}>
                  <View style={styles.currentLocationMarkerCore} />
                </View>
              </View>
            </MapLibreGL.MarkerView>
          )}

          {/* Tracked Bus Marker */}
          {trackedBusMarker && (
            <BusMarker
              key={trackedBusMarker.id}
              vehicle={{
                ...trackedBusMarker.vehicle,
                id: trackedBusMarker.id,
              }}
              color={trackedBusMarker.color}
              routeLabel={trackedBusMarker.routeShortName}
              snapPath={trackedBusMarker.snapPath}
            />
          )}

          {/* Next Bus Marker (shown during walking legs) */}
          {walkingBusMarker && (
            <BusMarker
              key={walkingBusMarker.id}
              vehicle={{
                ...walkingBusMarker.vehicle,
                id: walkingBusMarker.id,
              }}
              color={walkingBusMarker.color}
              routeLabel={walkingBusMarker.routeShortName}
              snapPath={walkingBusMarker.snapPath}
            />
          )}
        </MapLibreGL.MapView>
      </View>

      {/* GPS Acquisition Overlay */}
      {isAcquiringGPS && (
        <View style={styles.gpsOverlay}>
          <View style={styles.gpsCard}>
            <PulsingSpinner size={28} />
            <Text style={styles.gpsText}>Acquiring GPS signal...</Text>
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
        <TripViewportControls
          onToggleFollow={toggleFollowMode}
          isFollowActive={isFollowMode}
          onCenterOnUserLocation={jumpToMyLocation}
          onShowTrip={showTripOverview}
        />
      </View>

      {/* Bottom Section */}
      <View style={styles.bottomSection}>
        {isTransitLeg && !isOnDemandLeg && (
          <TransitStopGuideCard
            leg={currentLeg}
            liveStopsRemaining={busProximity.stopsUntilAlighting}
            isOnBoard={isUserOnBoard}
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
    paddingBottom: Platform.OS === 'ios' ? 14 : 10,
  },
  mapControls: {
    position: 'absolute',
    right: 16,
    bottom: 176,
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
  markerTransitIntermediateStop: {
    backgroundColor: COLORS.info,
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  markerTransitNextStop: {
    backgroundColor: COLORS.secondary,
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  markerTransitAlightStop: {
    backgroundColor: COLORS.error,
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  markerWalkStart: {
    backgroundColor: COLORS.success,
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  markerWalkTargetStop: {
    backgroundColor: COLORS.white,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderColor: GOOGLE_WALK_BLUE,
  },
  markerWalkTargetDestination: {
    backgroundColor: COLORS.error,
    width: 30,
    height: 30,
    borderRadius: 15,
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
  currentLocationMarkerHalo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(66, 133, 244, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GOOGLE_WALK_BLUE,
    borderWidth: 4,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  currentLocationMarkerCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white,
  },
  transitStopMarkerContainer: {
    alignItems: 'center',
  },
  mapStopLabelBubble: {
    maxWidth: 180,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.small,
  },
  mapStopLabelBubbleNext: {
    borderColor: COLORS.secondary,
    backgroundColor: COLORS.secondarySubtle,
  },
  mapStopLabelBubbleExit: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorSubtle,
  },
  mapStopLabelBubbleWalkTarget: {
    borderColor: 'rgba(66, 133, 244, 0.24)',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
  },
  mapStopLabelBubbleWalkStart: {
    borderColor: 'rgba(76, 175, 80, 0.22)',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
  },
  mapStopLabelCaption: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  mapStopLabelCaptionNext: {
    color: COLORS.secondaryDark,
  },
  mapStopLabelCaptionExit: {
    color: COLORS.error,
  },
  mapStopLabelCaptionWalkTarget: {
    color: GOOGLE_WALK_BLUE_DARK,
  },
  mapStopLabelCaptionWalkStart: {
    color: COLORS.primaryDark,
  },
  mapStopLabelName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 2,
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
