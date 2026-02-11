/**
 * NavigationScreen (Web Version)
 *
 * Web-compatible turn-by-turn navigation using Leaflet maps.
 * Falls back to browser geolocation API.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import logger from '../utils/logger';
import L from 'leaflet';

import { MAP_CONFIG } from '../config/constants';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

// Navigation components
import NavigationHeader from '../components/navigation/NavigationHeader';
import WalkingInstructionCard from '../components/navigation/WalkingInstructionCard';
import BusProximityCard from '../components/navigation/BusProximityCard';
import NavigationProgressBar from '../components/navigation/NavigationProgressBar';
import StepOverviewSheet from '../components/navigation/StepOverviewSheet';
import ExitConfirmationModal from '../components/navigation/ExitConfirmationModal';

// Hooks
import { useBusProximity } from '../hooks/useBusProximity';
import { useStepProgress } from '../hooks/useStepProgress';

// Walking enrichment (fetched on navigation start, not during preview)
import { enrichItineraryWithWalking } from '../services/walkingService';
import { decodePolyline, extractShapeSegment } from '../utils/polylineUtils';

// Context for route shapes
import { useTransit } from '../context/TransitContext';

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

  // Follow user location when in follow mode
  useEffect(() => {
    if (isFollowMode && userLocation) {
      map.flyTo([userLocation.latitude, userLocation.longitude], 17, {
        duration: 0.5,
      });
    }
  }, [userLocation, isFollowMode, map]);

  // Handle jump to location command
  useEffect(() => {
    if (jumpToLocation && userLocation) {
      map.flyTo([userLocation.latitude, userLocation.longitude], 17, {
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

  const [isFollowMode, setIsFollowMode] = useState(false); // Start with trip overview
  const [hasInitializedMap, setHasInitializedMap] = useState(false);
  const [jumpToLocationTrigger, setJumpToLocationTrigger] = useState(0);
  const [showOverviewTrigger, setShowOverviewTrigger] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);

  // Web location tracking
  const {
    location: userLocation,
    error: locationError,
    isTracking,
    startTracking,
    stopTracking,
  } = useWebLocation();


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
    completeLeg,
    boardBus,
    alightBus,
  } = useStepProgress(itinerary, userLocation, null); // Pass null initially, update below

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

  // Get next transit leg (for bus tracking during walking legs)
  const nextTransitLeg = useMemo(() => {
    if (!itinerary?.legs || !isWalkingLeg) return null;
    for (let i = currentLegIndex + 1; i < itinerary.legs.length; i++) {
      const leg = itinerary.legs[i];
      if (leg.mode === 'BUS' || leg.mode === 'TRANSIT') return leg;
    }
    return null;
  }, [itinerary, currentLegIndex, isWalkingLeg]);

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

  // Get polylines for Leaflet
  const routePolylines = useMemo(() => {
    if (!itinerary?.legs) return [];

    return itinerary.legs.map((leg, index) => {
      let positions = [];
      const isWalk = leg.mode === 'WALK';
      const isTransit = leg.mode === 'BUS' || leg.mode === 'TRANSIT';

      if (leg.legGeometry?.points) {
        // Use encoded polyline if available (walking legs from walkingService)
        positions = decodePolyline(leg.legGeometry.points).map(c => [c.latitude, c.longitude]);
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

        // Convert to Leaflet format [lat, lng]
        positions = bestSegment.length > 0
          ? bestSegment.map(coord => [coord.latitude, coord.longitude])
          : [[leg.from.lat, leg.from.lon], [leg.to.lat, leg.to.lon]];
      } else if (leg.from && leg.to) {
        // Fallback to straight line
        positions = [
          [leg.from.lat, leg.from.lon],
          [leg.to.lat, leg.to.lon],
        ];
      }

      const isCurrentLeg = index === currentLegIndex;
      const isCompletedLeg = index < currentLegIndex;

      return {
        id: `leg-${index}`,
        positions,
        color: isCompletedLeg
          ? COLORS.grey400
          : isWalk
          ? COLORS.grey600
          : (leg.route?.color || COLORS.primary),
        weight: isCurrentLeg ? 5 : 3,
        dashArray: isWalk ? '10, 5' : null,
        opacity: isCompletedLeg ? 0.5 : 1,
      };
    });
  }, [itinerary, currentLegIndex, shapes, routeShapeMapping]);

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
  const trackedBusMarker = useMemo(() => {
    if (!busProximity?.vehicle?.coordinate) return null;
    if (!currentTransitLeg) return null;

    return {
      id: 'tracked-bus',
      position: [
        busProximity.vehicle.coordinate.latitude,
        busProximity.vehicle.coordinate.longitude
      ],
      color: currentTransitLeg.route?.color || COLORS.primary,
      routeShortName: currentTransitLeg.route?.shortName || '?',
      bearing: busProximity.vehicle.bearing,
    };
  }, [busProximity?.vehicle, currentTransitLeg]);

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

  // Bus marker for next transit leg (shown during walking legs)
  const nextBusMarker = useMemo(() => {
    if (!isWalkingLeg || !nextTransitLeg) return null;
    if (!nextTransitBusProximity?.vehicle?.coordinate) return null;

    return {
      id: 'next-bus',
      position: [
        nextTransitBusProximity.vehicle.coordinate.latitude,
        nextTransitBusProximity.vehicle.coordinate.longitude
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

          {/* Next bus marker (shown during walking legs) */}
          {nextBusMarker && (
            <Marker
              position={nextBusMarker.position}
              icon={createBusMarkerIcon(
                nextBusMarker.color,
                nextBusMarker.routeShortName,
                nextBusMarker.bearing
              )}
            />
          )}
        </MapContainer>
      </div>

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
        {isWalkingLeg && (
          <WalkingInstructionCard
            currentStep={currentWalkingStep}
            nextStep={nextWalkingStep}
            distanceRemaining={distanceToDestination}
            totalLegDistance={currentLeg?.distance || 0}
            nextTransitLeg={nextTransitLeg}
          />
        )}

        {isTransitLeg && (
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
          />
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
});

export default NavigationScreen;
