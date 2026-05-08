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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Map components - MapLibre
import MapLibreGL from '@maplibre/maplibre-react-native';
import { MAP_CONFIG, OSM_MAP_STYLE } from '../config/constants';
import {
  BUS_APPROACH_LINE_DASH_PATTERN,
  BUS_APPROACH_LINE_OPACITY,
} from '../config/mapLineStyles';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

// Navigation components
import NavigationHeader from '../components/navigation/NavigationHeader';
import WalkingInstructionCard from '../components/navigation/WalkingInstructionCard';
import BusProximityCard from '../components/navigation/BusProximityCard';
import BoardingInstructionCard from '../components/navigation/BoardingInstructionCard';
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
import { useAutoBoardBus } from '../hooks/useAutoBoardBus';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import { buildWalkPaceStatus } from '../utils/walkPaceStatus';

import { recalculateNavigationItinerary } from '../services/navigationRecalculationService';
import * as Haptics from 'expo-haptics';
import logger from '../utils/logger';
import { decodePolyline } from '../utils/polylineUtils';
import { haversineDistance, pointToPolylineDistance } from '../utils/geometryUtils';
import {
  collectItineraryViewportCoordinates,
  computeCoordinateBounds,
  distanceToBoundsMeters,
} from '../utils/itineraryViewport';
import {
  buildCurrentStepBusPreviewLine,
  buildRoutePathsByRouteId,
} from '../utils/navigationBusPreview';
import { buildNavigationMapModel } from '../features/navigation/model/buildNavigationMapModel';
import { buildNavigationRoutePolylines } from '../features/navigation/model/buildNavigationRoutePolylines';
import { buildNavigationVehicleMarkers } from '../features/navigation/model/buildNavigationVehicleMarkers';
import { useNavigationItineraryController } from '../features/navigation/useNavigationItineraryController';
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
        <Icon name="BusStop" size={19} color={color} />
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

const NavigationBusMapMarker = ({ marker }) => {
  if (!marker) return null;

  const vehicle = {
    ...marker.vehicle,
    id: marker.id,
  };

  if (Platform.OS === 'android') {
    return (
      <MapLibreGL.MarkerView
        key={marker.id}
        id={`nav-bus-${marker.id}`}
        coordinate={marker.coordinate}
        anchor={{ x: 0.5, y: 0.5 }}
      >
        <View style={styles.busMarkerContainer}>
          <View
            style={[
              styles.busMarker,
              { backgroundColor: marker.color },
            ]}
          >
            <Text style={styles.busMarkerText} numberOfLines={1}>
              {marker.routeShortName || vehicle.routeId || '?'}
            </Text>
          </View>
          <View
            style={[
              styles.busMarkerArrow,
              { borderBottomColor: marker.color },
            ]}
          />
        </View>
      </MapLibreGL.MarkerView>
    );
  }

  return (
    <BusMarker
      key={marker.id}
      vehicle={vehicle}
      color={marker.color}
      routeLabel={marker.routeShortName}
      snapPath={marker.snapPath}
    />
  );
};

const NavigationScreen = ({ route }) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const mapRef = useRef(null);
  const cameraRef = useRef(null);

  const initialItinerary = route.params?.itinerary;
  const { itinerary, setItinerary } = useNavigationItineraryController({
    initialItinerary,
    navigation,
    trackStart: true,
  });

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
    onBoardPeekAheadText,
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

  const notifyAutoBoardReady = useCallback(() => {
    triggerHapticOnce('auto-board', Haptics.NotificationFeedbackType.Success);
  }, []);

  useAutoBoardBus({
    currentTransitLeg,
    transitStatus,
    busProximity,
    onBoardBus: boardBus,
    onAutoBoardReady: notifyAutoBoardReady,
  });

  // Also track bus for the next transit leg while walking
  const nextTransitBusProximity = useBusProximity(
    isWalkingLeg ? nextTransitLeg : null,
    isWalkingLeg && !!nextTransitLeg,
    userLocation,
    false
  );

  const walkingPaceStatus = useMemo(
    () => buildWalkPaceStatus({
      currentLeg,
      distanceToDestination,
      nextTransitLeg,
      nextTransitProximity: nextTransitBusProximity,
    }),
    [currentLeg, distanceToDestination, nextTransitLeg, nextTransitBusProximity]
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

  const routePolylines = useMemo(
    () =>
      buildNavigationRoutePolylines({
        itinerary,
        currentLegIndex,
        userLocation,
        shapes,
        routeShapeMapping,
      }).map((line) => ({
        ...line,
        strokeWidth: line.width,
        lineDashPattern: line.dashPattern,
      })),
    [itinerary, currentLegIndex, userLocation, shapes, routeShapeMapping]
  );

  const navigationMapModel = useMemo(() => buildNavigationMapModel({
    itinerary,
    currentLeg,
    currentLegIndex,
    isWalkingLeg,
    currentTransitLeg,
    nextTransitLeg,
    nextTransitProximity: nextTransitBusProximity,
    transitStatus,
    isUserOnBoard,
    liveStopsRemaining: busProximity.stopsUntilAlighting,
  }), [
    itinerary,
    currentLeg,
    currentLegIndex,
    isWalkingLeg,
    currentTransitLeg,
    nextTransitLeg,
    nextTransitBusProximity,
    transitStatus,
    isUserOnBoard,
    busProximity.stopsUntilAlighting,
  ]);

  // Get markers for map
  const markers = useMemo(() => {
    const result = [...navigationMapModel.mapMarkers];
    if (navigationMapModel.busStopMarker) {
      result.push(navigationMapModel.busStopMarker);
    }

    return result.map((marker) => ({
      ...marker,
      coordinate: [marker.longitude, marker.latitude],
    }));
  }, [navigationMapModel]);

  const walkingLandmarkMarkers = useMemo(
    () =>
      navigationMapModel.walkingLandmarkMarkers.map((marker) => ({
        ...marker,
        coordinate: [marker.longitude, marker.latitude],
      })),
    [navigationMapModel]
  );

  const transitStopMarkers = useMemo(
    () =>
      navigationMapModel.transitStopMarkers.map((marker) => ({
        ...marker,
        coordinate: [marker.longitude, marker.latitude],
      })),
    [navigationMapModel]
  );

  const navigationVehicleMarkers = useMemo(
    () =>
      buildNavigationVehicleMarkers({
        itinerary,
        currentLegIndex,
        isWalkingLeg,
        currentTransitLeg,
        nextTransitLeg,
        vehicles,
        busProximityVehicle: busProximity?.vehicle,
        nextTransitProximityVehicle: nextTransitBusProximity?.vehicle,
        routePathsByRouteId,
      }),
    [
      itinerary,
      currentLegIndex,
      isWalkingLeg,
      currentTransitLeg,
      nextTransitLeg,
      vehicles,
      busProximity?.vehicle,
      nextTransitBusProximity?.vehicle,
      routePathsByRouteId,
    ]
  );

  const trackedBusMarker = useMemo(
    () =>
      navigationVehicleMarkers.trackedBusMarker
        ? {
            ...navigationVehicleMarkers.trackedBusMarker,
            coordinate: [
              navigationVehicleMarkers.trackedBusMarker.longitude,
              navigationVehicleMarkers.trackedBusMarker.latitude,
            ],
          }
        : null,
    [navigationVehicleMarkers]
  );

  const walkingBusMarker = useMemo(
    () =>
      navigationVehicleMarkers.walkingBusMarker
        ? {
            ...navigationVehicleMarkers.walkingBusMarker,
            coordinate: [
              navigationVehicleMarkers.walkingBusMarker.longitude,
              navigationVehicleMarkers.walkingBusMarker.latitude,
            ],
          }
        : null,
    [navigationVehicleMarkers]
  );

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

  const handleMapRegionWillChange = useCallback((feature) => {
    if (feature?.properties?.isUserInteraction) {
      setIsFollowMode(false);
    }
  }, []);

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
          scrollEnabled
          rotateEnabled
          compassEnabled={false}
          pitchEnabled={false}
          onRegionWillChange={handleMapRegionWillChange}
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
              lineDashPattern={BUS_APPROACH_LINE_DASH_PATTERN}
              opacity={BUS_APPROACH_LINE_OPACITY}
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
                    styles.mapStopLabelBubbleWalkingLandmark,
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
                  <Text style={[styles.mapStopLabelName, styles.mapStopLabelNameWalkingLandmark]} numberOfLines={2}>
                    {marker.title}
                  </Text>
                  {marker.detail ? (
                    <Text style={styles.mapStopLabelDetail} numberOfLines={1}>
                      {marker.detail}
                    </Text>
                  ) : null}
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
                {marker.showLabel !== false && (
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
                )}
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
            <NavigationBusMapMarker marker={trackedBusMarker} />
          )}

          {/* Next Bus Marker (shown during walking legs) */}
          {walkingBusMarker && (
            <NavigationBusMapMarker marker={walkingBusMarker} />
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
        walkingPaceLevel={walkingPaceStatus?.level || 'on_pace'}
      />

      {/* Map control buttons */}
      <View style={[
        styles.mapControls,
        { bottom: addSafeBottomPadding(176, bottomInset) },
      ]}>
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
      <View style={[
        styles.bottomSection,
        { paddingBottom: addSafeBottomPadding(10, bottomInset) },
      ]} pointerEvents="box-none">
        {isTransitLeg && !isOnDemandLeg && transitStatus !== 'waiting' && (
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
            distanceToDestination={distanceToDestination}
            isLastStep={currentStepIndex === (currentLeg?.steps || []).length - 1}
            onNextLeg={advanceLeg}
            currentStepIndex={currentStepIndex}
            totalSteps={(currentLeg?.steps || []).length}
            nextLegPreview={nextLegPreviewText}
            nextTransitLeg={nextTransitLeg}
            nextTransitProximity={nextTransitBusProximity}
            onFindNextTrip={handleRecalculate}
            paceStatus={walkingPaceStatus}
          />
        )}

        {/* Bus Proximity Card / Boarding Instruction Card */}
        {isTransitLeg && !isOnDemandLeg && (
          <>
            {transitStatus === 'waiting' && !busProximity.hasArrived ? (
              <BoardingInstructionCard
                leg={currentLeg}
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
                nextLegPreview={onBoardPeekAheadText}
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
  mapStopLabelBubbleWalkingLandmark: {
    maxWidth: 240,
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
  mapStopLabelNameWalkingLandmark: {
    lineHeight: 16,
  },
  mapStopLabelDetail: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: '700',
    color: GOOGLE_WALK_BLUE_DARK,
    marginTop: 4,
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
