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
import NavigationProgressBar from '../components/navigation/NavigationProgressBar';
import StepOverviewSheet from '../components/navigation/StepOverviewSheet';
import ExitConfirmationModal from '../components/navigation/ExitConfirmationModal';
import DestinationBanner from '../components/navigation/DestinationBanner';
import PulsingSpinner from '../components/PulsingSpinner';

// Context for route shapes
import { useTransitStatic } from '../context/TransitContext';

// Hooks
import { useNavigationLocation } from '../hooks/useNavigationLocation';
import { useBusProximity } from '../hooks/useBusProximity';
import { useStepProgress } from '../hooks/useStepProgress';

// Walking enrichment (fetched on navigation start, not during preview)
import { enrichItineraryWithWalking } from '../services/walkingService';
import logger from '../utils/logger';
import { decodePolyline, findClosestPointIndex, extractShapeSegment } from '../utils/polylineUtils';
import RoutePolyline from '../components/RoutePolyline';


// Helper: compute bounds from coordinates array [{latitude, longitude}]
const computeBounds = (coords) => {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  coords.forEach(c => {
    minLat = Math.min(minLat, c.latitude || c.lat);
    maxLat = Math.max(maxLat, c.latitude || c.lat);
    minLng = Math.min(minLng, c.longitude || c.lon);
    maxLng = Math.max(maxLng, c.longitude || c.lon);
  });
  return {
    ne: [maxLng, maxLat],
    sw: [minLng, minLat],
  };
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

  // Get route shapes from TransitContext
  const { shapes, routeShapeMapping } = useTransitStatic();

  // State
  const [isFollowMode, setIsFollowMode] = useState(false); // Start with trip overview, not following
  const [hasInitializedMap, setHasInitializedMap] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  // Location tracking
  const useWebLocation = useNavigationLocation;
  void useWebLocation;
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

  // Get current transit leg for bus proximity tracking
  const currentTransitLeg = useMemo(() => {
    if (!currentLeg) return null;
    const isTransit = currentLeg.mode === 'BUS' || currentLeg.mode === 'TRANSIT';
    return isTransit ? currentLeg : null;
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
    if (!itinerary?.legs || itinerary.legs.length === 0) return null;

    const points = [];
    itinerary.legs.forEach(leg => {
      if (leg.from) points.push({ latitude: leg.from.lat, longitude: leg.from.lon });
      if (leg.to) points.push({ latitude: leg.to.lat, longitude: leg.to.lon });
    });

    if (points.length === 0) return null;

    const bounds = computeBounds(points);
    return bounds;
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

  // Center map on user location when in follow mode
  useEffect(() => {
    if (isFollowMode && userLocation && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        zoomLevel: 17,
        animationDuration: 500,
      });
    }
  }, [userLocation, isFollowMode]);

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
    }
  }, [currentTransitLeg, transitStatus, busProximity?.hasArrived]);

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

  // Get route polylines for map
  const routePolylines = useMemo(() => {
    if (!itinerary?.legs) return [];

    return itinerary.legs.map((leg, index) => {
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

      return {
        id: `leg-${index}`,
        coordinates,
        color: isCompletedLeg
          ? COLORS.grey400
          : isWalk
          ? COLORS.grey600
          : leg.isOnDemand
          ? (leg.zoneColor || COLORS.primary)
          : (leg.route?.color || COLORS.primary),
        strokeWidth: isCurrentLeg ? 5 : 3,
        lineDashPattern: isWalk ? [10, 5] : leg.isOnDemand ? [8, 6] : null,
        opacity: isCompletedLeg ? 0.5 : 1,
      };
    });
  }, [itinerary, currentLegIndex, shapes, routeShapeMapping]);

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
  const trackedBusMarker = useMemo(() => {
    if (!busProximity?.vehicle?.coordinate) return null;
    if (!currentTransitLeg) return null;

    return {
      id: 'tracked-bus',
      coordinate: [
        busProximity.vehicle.coordinate.longitude,
        busProximity.vehicle.coordinate.latitude,
      ],
      color: currentTransitLeg.route?.color || COLORS.primary,
      routeShortName: currentTransitLeg.route?.shortName || '?',
      bearing: busProximity.vehicle.bearing,
    };
  }, [busProximity?.vehicle, currentTransitLeg]);

  // Bus marker for next transit leg (shown during walking legs)
  const nextBusMarker = useMemo(() => {
    if (!isWalkingLeg || !nextTransitLeg) return null;
    if (!nextTransitBusProximity?.vehicle?.coordinate) return null;

    return {
      id: 'next-bus',
      coordinate: [
        nextTransitBusProximity.vehicle.coordinate.longitude,
        nextTransitBusProximity.vehicle.coordinate.latitude,
      ],
      color: nextTransitLeg.route?.color || COLORS.primary,
      routeShortName: nextTransitLeg.route?.shortName || '?',
      bearing: nextTransitBusProximity.vehicle.bearing,
    };
  }, [isWalkingLeg, nextTransitLeg, nextTransitBusProximity?.vehicle]);

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
      cameraRef.current.setCamera({
        bounds: { ne: tripBounds.ne, sw: tripBounds.sw },
        padding: { paddingTop: 100, paddingRight: 50, paddingBottom: 200, paddingLeft: 50 },
        animationDuration: 500,
      });
    }
  };
  const handleBoundsFit = useCallback(() => {}, []);
  void handleBoundsFit;

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

    if (currentLeg && distanceToDestination) {
      remaining += distanceToDestination;
    }

    for (let i = currentLegIndex + 1; i < itinerary.legs.length; i++) {
      remaining += itinerary.legs[i].distance || 0;
    }

    return remaining;
  }, [itinerary, currentLegIndex, currentLeg, distanceToDestination]);

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
                  <Text style={styles.busStopIcon}>🚏</Text>
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
          {nextBusMarker && (
            <MapLibreGL.PointAnnotation
              id={`nav-${nextBusMarker.id}`}
              coordinate={nextBusMarker.coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.busMarkerContainer}>
                <View style={[styles.busMarker, { backgroundColor: nextBusMarker.color }]}>
                  <Text style={styles.busMarkerText}>{nextBusMarker.routeShortName}</Text>
                </View>
                <View style={[styles.busMarkerArrow, { borderBottomColor: nextBusMarker.color }]} />
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
      />

      {/* Map control buttons */}
      <View style={styles.mapControls}>
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
        {/* Destination Banner */}
        <DestinationBanner
          currentLeg={currentLeg}
          nextTransitLeg={nextTransitLeg}
          distanceRemaining={distanceToDestination}
          totalLegDistance={currentLeg?.distance || 0}
          isLastWalkingLeg={isLastWalkingLeg}
        />

        {/* Walking Instruction Card */}
        {isWalkingLeg && (
          <WalkingInstructionCard
            currentStep={currentWalkingStep}
            onNextStep={advanceLeg}
          />
        )}

        {/* Bus Proximity Card */}
        {isTransitLeg && (
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
          />
        )}

        {/* On-Demand Zone Card */}
        {isOnDemandLeg && (
          <View style={[styles.onDemandCard, { borderLeftColor: currentLeg.zoneColor || COLORS.primary }]}>
            <View style={styles.onDemandCardHeader}>
              <Text style={styles.onDemandCardIcon}>📞</Text>
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
  mapControls: {
    position: 'absolute',
    right: SPACING.md,
    top: 160,
    gap: SPACING.sm,
  },
  mapControlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    ...SHADOWS.medium,
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
});

export default NavigationScreen;
