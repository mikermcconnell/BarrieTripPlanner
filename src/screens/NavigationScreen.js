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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

// Map components - platform specific
import MapView, { Polyline, Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import { CUSTOM_MAP_STYLE } from '../config/mapStyle';
import { MAP_CONFIG } from '../config/constants';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

// Navigation components
import NavigationHeader from '../components/navigation/NavigationHeader';
import WalkingInstructionCard from '../components/navigation/WalkingInstructionCard';
import BusProximityCard from '../components/navigation/BusProximityCard';
import NavigationProgressBar from '../components/navigation/NavigationProgressBar';
import StepOverviewSheet from '../components/navigation/StepOverviewSheet';
import ExitConfirmationModal from '../components/navigation/ExitConfirmationModal';

// Context for route shapes
import { useTransit } from '../context/TransitContext';

// Hooks
import { useNavigationLocation } from '../hooks/useNavigationLocation';
import { useBusProximity } from '../hooks/useBusProximity';
import { useStepProgress } from '../hooks/useStepProgress';

// Walking enrichment (fetched on navigation start, not during preview)
import { enrichItineraryWithWalking } from '../services/walkingService';

// Decode polyline helper
const decodePolyline = (encoded) => {
  if (!encoded) return [];
  const coords = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
};

// Calculate distance between two points (meters)
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
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

// Find the index of the closest point in a shape to a given location
const findClosestPointIndex = (shapeCoords, lat, lon) => {
  let minDist = Infinity;
  let closestIdx = 0;

  shapeCoords.forEach((coord, idx) => {
    const dist = haversineDistance(lat, lon, coord.latitude, coord.longitude);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = idx;
    }
  });

  return closestIdx;
};

// Extract a segment of a shape between two points
const extractShapeSegment = (shapeCoords, fromLat, fromLon, toLat, toLon) => {
  if (!shapeCoords || shapeCoords.length === 0) return [];

  const startIdx = findClosestPointIndex(shapeCoords, fromLat, fromLon);
  const endIdx = findClosestPointIndex(shapeCoords, toLat, toLon);

  // Handle both directions (shape might be in reverse order)
  if (startIdx <= endIdx) {
    return shapeCoords.slice(startIdx, endIdx + 1);
  } else {
    // Reverse direction - take from end to start and reverse
    return shapeCoords.slice(endIdx, startIdx + 1).reverse();
  }
};

const NavigationScreen = ({ route }) => {
  const navigation = useNavigation();
  const mapRef = useRef(null);

  // Enrich itinerary with real walking directions on mount
  const [itinerary, setItinerary] = useState(route.params.itinerary);
  useEffect(() => {
    let cancelled = false;
    enrichItineraryWithWalking(route.params.itinerary)
      .then(enriched => {
        if (!cancelled) {
          logger.log('Walking directions enriched for navigation');
          setItinerary(enriched);
        }
      })
      .catch(() => {}); // Keep using estimate-based itinerary
    return () => { cancelled = true; };
  }, []);

  // Get route shapes from TransitContext
  const { shapes, routeShapeMapping } = useTransit();

  // State
  const [isFollowMode, setIsFollowMode] = useState(false); // Start with trip overview, not following
  const [hasInitializedMap, setHasInitializedMap] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  // Location tracking
  const {
    location: userLocation,
    error: locationError,
    isTracking,
    startTracking,
    stopTracking,
  } = useNavigationLocation();

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

  // Get next transit leg (for bus tracking during walking legs)
  const nextTransitLeg = useMemo(() => {
    if (!itinerary?.legs || !isWalkingLeg) return null;
    for (let i = currentLegIndex + 1; i < itinerary.legs.length; i++) {
      const leg = itinerary.legs[i];
      if (leg.mode === 'BUS' || leg.mode === 'TRANSIT') return leg;
    }
    return null;
  }, [itinerary, currentLegIndex, isWalkingLeg]);

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

    // Add padding to bounds
    const latPadding = (maxLat - minLat) * 0.15;
    const lonPadding = (maxLon - minLon) * 0.15;

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max(0.01, (maxLat - minLat) + latPadding),
      longitudeDelta: Math.max(0.01, (maxLon - minLon) + lonPadding),
    };
  }, [itinerary]);

  // Fit map to trip bounds on initial load
  useEffect(() => {
    if (!hasInitializedMap && tripBounds && mapRef.current) {
      mapRef.current.animateToRegion(tripBounds, 500);
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
    if (isFollowMode && userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 500);
    }
  }, [userLocation, isFollowMode]);

  // Handle navigation completion
  useEffect(() => {
    if (isNavigationComplete) {
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
        // Use encoded polyline if available (walking legs from walkingService)
        coordinates = decodePolyline(leg.legGeometry.points);
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

        coordinates = bestSegment.length > 0 ? bestSegment : [
          { latitude: leg.from.lat, longitude: leg.from.lon },
          { latitude: leg.to.lat, longitude: leg.to.lon },
        ];
      } else if (leg.from && leg.to) {
        // Fallback to straight line
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
          : (leg.route?.color || COLORS.primary),
        strokeWidth: isCurrentLeg ? 5 : 3,
        lineDashPattern: isWalk ? [10, 5] : null,
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
        coordinate: { latitude: legs[0].from.lat, longitude: legs[0].from.lon },
        type: 'origin',
        title: 'Start',
      });
    }

    // Destination marker
    const lastLeg = legs[legs.length - 1];
    if (lastLeg?.to) {
      result.push({
        id: 'destination',
        coordinate: { latitude: lastLeg.to.lat, longitude: lastLeg.to.lon },
        type: 'destination',
        title: 'End',
      });
    }

    // Current leg destination (for visual guidance)
    if (currentLeg?.to && currentLegIndex < legs.length - 1) {
      result.push({
        id: 'current-destination',
        coordinate: { latitude: currentLeg.to.lat, longitude: currentLeg.to.lon },
        type: 'waypoint',
        title: currentLeg.to.name,
      });
    }

    // Bus stop marker (boarding point for transit leg)
    if (currentTransitLeg?.from && transitStatus === 'waiting') {
      result.push({
        id: 'bus-stop',
        coordinate: { latitude: currentTransitLeg.from.lat, longitude: currentTransitLeg.from.lon },
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
      coordinate: {
        latitude: busProximity.vehicle.coordinate.latitude,
        longitude: busProximity.vehicle.coordinate.longitude,
      },
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
      coordinate: {
        latitude: nextTransitBusProximity.vehicle.coordinate.latitude,
        longitude: nextTransitBusProximity.vehicle.coordinate.longitude,
      },
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
    // Navigate back to MapMain (home screen) and reset trip planning mode
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
      mapRef.current?.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 500);
    }
  };

  // Jump to current location (one-time, doesn't enable follow mode)
  const jumpToMyLocation = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 500);
    }
  };

  // Show full trip overview
  const showTripOverview = () => {
    if (tripBounds && mapRef.current) {
      setIsFollowMode(false);
      mapRef.current.animateToRegion(tripBounds, 500);
    }
  };

  // Get next walking step for preview
  const nextWalkingStep = useMemo(() => {
    if (!currentLeg || currentLeg.mode !== 'WALK') return null;
    const steps = currentLeg.steps || [];
    return steps[currentStepIndex + 1] || null;
  }, [currentLeg, currentStepIndex]);


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

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={tripBounds || MAP_CONFIG.INITIAL_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        rotateEnabled
        pitchEnabled={false}
        customMapStyle={CUSTOM_MAP_STYLE}
        onPanDrag={() => setIsFollowMode(false)}
      >
        {/* Route polylines */}
        {routePolylines.map((route) => (
          <Polyline
            key={route.id}
            coordinates={route.coordinates}
            strokeColor={route.color}
            strokeWidth={route.strokeWidth}
            lineDashPattern={route.lineDashPattern}
            strokeOpacity={route.opacity}
          />
        ))}

        {/* Markers */}
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            title={marker.title}
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
          </Marker>
        ))}

        {/* Tracked Bus Marker */}
        {trackedBusMarker && (
          <Marker
            key={trackedBusMarker.id}
            coordinate={trackedBusMarker.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.busMarkerContainer}>
              <View style={[styles.busMarker, { backgroundColor: trackedBusMarker.color }]}>
                <Text style={styles.busMarkerText}>{trackedBusMarker.routeShortName}</Text>
              </View>
              <View style={[styles.busMarkerArrow, { borderBottomColor: trackedBusMarker.color }]} />
            </View>
          </Marker>
        )}

        {/* Next Bus Marker (shown during walking legs) */}
        {nextBusMarker && (
          <Marker
            key={nextBusMarker.id}
            coordinate={nextBusMarker.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.busMarkerContainer}>
              <View style={[styles.busMarker, { backgroundColor: nextBusMarker.color }]}>
                <Text style={styles.busMarkerText}>{nextBusMarker.routeShortName}</Text>
              </View>
              <View style={[styles.busMarkerArrow, { borderBottomColor: nextBusMarker.color }]} />
            </View>
          </Marker>
        )}
      </MapView>

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
        {/* Walking Instruction Card */}
        {isWalkingLeg && (
          <WalkingInstructionCard
            currentStep={currentWalkingStep}
            nextStep={nextWalkingStep}
            distanceRemaining={distanceToDestination}
            totalLegDistance={currentLeg?.distance || 0}
            nextTransitLeg={nextTransitLeg}
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
            alightingStopName={currentLeg?.to?.name}
            scheduledDeparture={currentLeg?.startTime}
            isRealtime={currentLeg?.isRealtime || false}
            delaySeconds={currentLeg?.delaySeconds || 0}
          />
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
