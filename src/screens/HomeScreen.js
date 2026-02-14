/**
 * Native-specific HomeScreen (iOS/Android)
 * Web platform uses HomeScreen.web.js instead
 */
import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MapView, { PROVIDER_DEFAULT, Polyline, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTransit } from '../context/TransitContext';
import { MAP_CONFIG } from '../config/constants';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';
import StopBottomSheet from '../components/StopBottomSheet';
import TripErrorDisplay from '../components/TripErrorDisplay';
import { useTripPlanner } from '../hooks/useTripPlanner';
import { useRouteSelection } from '../hooks/useRouteSelection';
import { useTripVisualization } from '../hooks/useTripVisualization';
import { useMapTapPopup } from '../hooks/useMapTapPopup';
import { useMapPulseAnimation } from '../hooks/useMapPulseAnimation';
import { useMapNavigation } from '../hooks/useMapNavigation';
import { useDisplayedEntities } from '../hooks/useDisplayedEntities';
import { applyDelaysToItineraries } from '../services/tripDelayService';
import { decodePolyline } from '../utils/polylineUtils';
import logger from '../utils/logger';

// Native map components
import BusMarker from '../components/BusMarker';
import RoutePolyline from '../components/RoutePolyline';
import StopMarker from '../components/StopMarker';
import DetourPolyline from '../components/DetourPolyline';
import DetourBadge from '../components/DetourBadge';
import DetourDebugPanel from '../components/DetourDebugPanel';

// Trip planning components
import BottomActionBar from '../components/PlanTripFAB';
import TripSearchHeader from '../components/TripSearchHeader';
import TripBottomSheet from '../components/TripBottomSheet';
import MapTapPopup from '../components/MapTapPopup';
import { CUSTOM_MAP_STYLE } from '../config/mapStyle';
import HomeScreenControls from '../components/HomeScreenControls';
import Svg, { Path } from 'react-native-svg';

// SVG Icons for native (must use react-native-svg, not DOM <svg>)
const SearchIcon = ({ size = 20, color = COLORS.textSecondary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"
      fill={color}
    />
  </Svg>
);

const CenterIcon = ({ size = 20, color = COLORS.textPrimary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8ZM20.94 11C20.48 6.83 17.17 3.52 13 3.06V1H11V3.06C6.83 3.52 3.52 6.83 3.06 11H1V13H3.06C3.52 17.17 6.83 20.48 11 20.94V23H13V20.94C17.17 20.48 20.48 17.17 20.94 13H23V11H20.94ZM12 19C8.13 19 5 15.87 5 12C5 8.13 8.13 5 12 5C15.87 5 19 8.13 19 12C19 15.87 15.87 19 12 19Z"
      fill={color}
    />
  </Svg>
);

const HomeScreen = ({ route }) => {
  const mapRef = useRef(null);
  const navigation = useNavigation();
  const {
    routes,
    stops,
    shapes,
    processedShapes,
    shapeOverlapOffsets,
    routeShapeMapping,
    routeStopsMapping,
    trips,
    vehicles,
    isLoadingStatic,
    isLoadingVehicles,
    staticError,
    lastVehicleUpdate,
    loadStaticData,
    isOffline,
    usingCachedData,
    routingData,
    isRoutingReady,
    activeDetours,
    getDetoursForRoute,
    getDetourHistory,
    hasActiveDetour,
  } = useTransit();

  const {
    selectedRoutes, hasSelection, handleRouteSelect, centerOnBarrie, isRouteSelected, selectRoute,
  } = useRouteSelection({ routeShapeMapping, shapes, mapRef, multiSelect: true });
  const [selectedStop, setSelectedStop] = useState(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showStops, setShowStops] = useState(false);
  const [mapRegion, setMapRegion] = useState(MAP_CONFIG.INITIAL_REGION);

  // Trip planning — shared hook (with native-specific delay enrichment)
  const trip = useTripPlanner({
    routingData,
    isRoutingReady,
    applyDelays: applyDelaysToItineraries,
    onItinerariesReady: (itinerary) => fitMapToItinerary(itinerary),
  });
  const {
    state: tripState,
    searchTrips,
    searchFromAddress,
    searchToAddress,
    selectFromSuggestion,
    selectToSuggestion,
    swap: swapTripLocations,
    setFrom: setTripFrom,
    setTo: setTripTo,
    selectItinerary: setSelectedItineraryIndex,
    enterPlanningMode,
    reset: resetTrip,
    useCurrentLocation: useCurrentLocationHook,
    setTimeMode,
    setSelectedTime,
  } = trip;
  const {
    isTripPlanningMode,
    from: tripFromLocation,
    to: tripToLocation,
    fromText: tripFromText,
    toText: tripToText,
    itineraries,
    selectedIndex: selectedItineraryIndex,
    isLoading: isTripLoading,
    error: tripError,
    hasSearched: hasTripSearched,
    timeMode,
    selectedTime,
  } = tripState;

  const {
    tripRouteCoordinates, tripMarkers, intermediateStopMarkers,
    boardingAlightingMarkers, tripVehicles,
  } = useTripVisualization({ isTripPlanningMode, itineraries, selectedItineraryIndex, vehicles });

  // Pulse animation for live indicator
  const pulseAnim = useMapPulseAnimation();

  // Map tap popup
  const {
    mapTapLocation, mapTapAddress, isLoadingAddress,
    handleMapPress, handleDirectionsFrom, handleDirectionsTo, closeMapTapPopup,
    showLocation,
  } = useMapTapPopup({
    enterPlanningMode, setTripFrom, setTripTo,
    onMapTap: () => setSelectedStop(null),
  });

  // Navigation param effects (selected stop/route/coordinate, exit trip planning)
  useMapNavigation({
    route, navigation, stops, mapRef,
    selectRoute, resetTrip, setSelectedStop, setShowStops,
    hasSelection, showLocation,
  });

  const [showDetourDebugPanel, setShowDetourDebugPanel] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(() =>
    Math.round(Math.log(360 / MAP_CONFIG.INITIAL_REGION.latitudeDelta) / Math.LN2)
  );

  // Zoom-dependent polyline weight
  const getPolylineWeight = useCallback((routeId) => {
    let base;
    if (currentZoom <= 11) base = 2;
    else if (currentZoom <= 13) base = 3;
    else if (currentZoom <= 15) base = 4;
    else base = 5;

    if (selectedRoutes.has(routeId)) base += 1;
    return base;
  }, [currentZoom, selectedRoutes]);

  // Displayed entities (vehicles, shapes, stops, detours) based on selection
  const {
    getRouteColor, displayedVehicles, displayedShapes, displayedStops,
    displayedDetours, primaryDisplayedDetour, detourHistory, selectedRoutesHaveDetour,
  } = useDisplayedEntities({
    selectedRouteIds: selectedRoutes,
    vehicles, routes, trips, shapes, processedShapes,
    routeShapeMapping, routeStopsMapping, stops,
    showRoutes, showStops, mapRegion,
    activeDetours, getDetourHistory, hasActiveDetour, lastVehicleUpdate,
  });

  // Handle map region change
  const handleRegionChange = (region) => {
    setMapRegion(region);
    const zoom = Math.round(Math.log(360 / region.latitudeDelta) / Math.LN2);
    setCurrentZoom(zoom);
  };

  // Handle stop press
  const handleStopPress = (stop) => {
    setSelectedStop(stop);
  };

  // Format last update time
  const formatLastUpdate = () => {
    if (!lastVehicleUpdate) return 'Never';
    const now = new Date();
    const diff = Math.floor((now - lastVehicleUpdate) / 1000);
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  // Trip planning functions (thin wrappers around useTripPlanner hook)
  const enterTripPlanningMode = () => {
    enterPlanningMode();
    setSelectedStop(null);
  };

  const exitTripPlanningMode = () => {
    resetTrip();
  };


  const useCurrentLocationForTrip = () => {
    useCurrentLocationHook(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Location permission required');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: loc.coords.latitude, lon: loc.coords.longitude };
    });
  };

  const fitMapToItinerary = (itinerary) => {
    if (!itinerary || !itinerary.legs) return;

    const coords = [];
    itinerary.legs.forEach(leg => {
      if (leg.from) coords.push({ latitude: leg.from.lat, longitude: leg.from.lon });
      if (leg.to) coords.push({ latitude: leg.to.lat, longitude: leg.to.lon });
      if (leg.legGeometry?.points) {
        // Decode polyline if available
        const decoded = decodePolyline(leg.legGeometry.points);
        coords.push(...decoded);
      }
      // Include intermediate stops in bounds calculation
      if (leg.intermediateStops) {
        leg.intermediateStops.forEach(stop => {
          if (stop.lat && stop.lon) {
            coords.push({ latitude: stop.lat, longitude: stop.lon });
          }
        });
      }
    });

    // Include real-time vehicle positions for trip routes
    const tripRouteIds = new Set();
    itinerary.legs.forEach(leg => {
      if (leg.mode !== 'WALK' && leg.route?.id) {
        tripRouteIds.add(leg.route.id);
      }
    });
    if (tripRouteIds.size > 0) {
      vehicles.forEach(v => {
        if (
          tripRouteIds.has(v.routeId) &&
          v.coordinate?.latitude &&
          v.coordinate?.longitude
        ) {
          coords.push({
            latitude: v.coordinate.latitude,
            longitude: v.coordinate.longitude,
          });
        }
      });
    }

    if (coords.length > 0) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 150, right: 50, bottom: 200, left: 50 },
        animated: true,
      });
    }
  };


  const viewTripDetails = (itinerary) => {
    navigation.navigate('TripDetails', { itinerary });
  };

  // Start navigation directly from preview (skip details screen)
  const startNavigationDirect = (itinerary) => {
    if (!itinerary || !itinerary.legs || itinerary.legs.length === 0) {
      logger.warn('Cannot start navigation: No route data available');
      return;
    }
    navigation.navigate('Navigation', { itinerary });
  };


  if (isLoadingStatic) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading transit data...</Text>
      </View>
    );
  }

  if (staticError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load transit data</Text>
        <Text style={styles.errorDetail}>{staticError}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadStaticData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Check if we're in trip preview mode (showing a selected trip on map)
  const isTripPreviewMode = isTripPlanningMode && itineraries.length > 0;

  // Render native map
  const renderMap = () => {
    return (
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={MAP_CONFIG.INITIAL_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
        rotateEnabled
        pitchEnabled={false}
        onRegionChangeComplete={handleRegionChange}
        onPress={handleMapPress}
        customMapStyle={CUSTOM_MAP_STYLE}
      >
        {/* Regular transit routes - hide when previewing a trip */}
        {!isTripPreviewMode && displayedShapes.map((shape) => {
          const isSelected = isRouteSelected(shape.routeId);

          // Visual hierarchy: selected = full, others ghost
          const opacity = hasSelection ? (isSelected ? 1.0 : 0.15) : 0.85;
          const outlineW = hasSelection
            ? (isSelected ? (currentZoom >= 14 ? 2 : 1.5) : 0)
            : (currentZoom >= 14 ? 1 : 0.5);

          return (
            <RoutePolyline
              key={shape.id}
              coordinates={shape.coordinates}
              color={shape.color}
              strokeWidth={getPolylineWeight(shape.routeId)}
              opacity={opacity}
              outlineWidth={outlineW}
            />
          );
        })}
        {/* Regular stops - hide when previewing a trip */}
        {!isTripPreviewMode && displayedStops.map((stop) => (
          <StopMarker
            key={stop.id}
            stop={stop}
            onPress={handleStopPress}
            isSelected={selectedStop?.id === stop.id}
          />
        ))}
        {/* Vehicles - hide when previewing a trip */}
        {!isTripPreviewMode && displayedVehicles.map((vehicle) => (
          <BusMarker key={vehicle.id} vehicle={vehicle} color={getRouteColor(vehicle.routeId)} />
        ))}

        {/* Detour polylines - hide when previewing a trip */}
        {!isTripPreviewMode && displayedDetours.map((detour) => (
          <DetourPolyline
            key={detour.id}
            coordinates={detour.polyline}
          />
        ))}

        {/* Trip planning route overlay */}
        {tripRouteCoordinates.map((route) => (
          <Polyline
            key={route.id}
            coordinates={route.coordinates}
            strokeColor={route.color}
            strokeWidth={route.isWalk ? 3 : 5}
            lineDashPattern={route.isWalk ? [10, 5] : null}
          />
        ))}

        {/* Trip planning intermediate stop markers */}
        {intermediateStopMarkers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            title={marker.name}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.intermediateStopMarker, { backgroundColor: marker.color }]} />
          </Marker>
        ))}

        {/* Trip planning markers */}
        {tripMarkers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            title={marker.title}
          >
            <View style={[
              styles.tripMarker,
              marker.type === 'origin' ? styles.tripMarkerOrigin : styles.tripMarkerDestination
            ]}>
              <View style={[
                styles.tripMarkerInner,
                marker.type === 'origin' ? styles.tripMarkerInnerOrigin : styles.tripMarkerInnerDestination
              ]} />
            </View>
          </Marker>
        ))}

        {/* Boarding and alighting stop markers with labels */}
        {boardingAlightingMarkers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.stopLabelContainer}>
              <View style={[styles.stopLabelBubble, { borderColor: marker.routeColor }]}>
                <Text style={[styles.stopLabelType, { color: marker.routeColor }]}>
                  {marker.type === 'boarding' ? '🚏 Board' : '🚏 Exit'} {marker.routeName ? `Route ${marker.routeName}` : ''}
                </Text>
                <Text style={styles.stopLabelName} numberOfLines={1}>
                  #{marker.stopCode} - {marker.stopName}
                </Text>
              </View>
              <View style={[styles.stopLabelPointer, { borderTopColor: marker.routeColor }]} />
            </View>
          </Marker>
        ))}

        {/* Real-time bus positions for trip routes */}
        {isTripPreviewMode && tripVehicles.map((vehicle) => (
          <BusMarker key={vehicle.id} vehicle={vehicle} color={getRouteColor(vehicle.routeId)} />
        ))}

        {/* Map tap marker - shows where user tapped */}
        {mapTapLocation && (
          <Marker
            coordinate={mapTapLocation}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.mapTapMarker}>
              <View style={styles.mapTapMarkerPin} />
              <View style={styles.mapTapMarkerDot} />
            </View>
          </Marker>
        )}
      </MapView>
    );
  };

  return (
    <View style={styles.container}>
      {renderMap()}

      {/* Search Bar Header - hide in trip planning mode */}
      {!isTripPlanningMode && (
        <TouchableOpacity
          style={styles.searchBar}
          onPress={() => navigation.navigate('Search')}
          activeOpacity={0.85}
        >
          <SearchIcon size={18} color={COLORS.grey500} />
          <Text style={styles.searchBarPlaceholder}>Search stops, routes & addresses</Text>
          <View style={styles.statusBadgeLive}>
            <Animated.View style={[styles.statusDotLive, { opacity: pulseAnim }]} />
            <Text style={styles.statusTextLive}>
              {isOffline ? 'Offline' : `${vehicles.length} live`}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Center Map Button - top right */}
      {!isTripPlanningMode && (
        <TouchableOpacity
          style={styles.centerButton}
          onPress={centerOnBarrie}
          activeOpacity={0.7}
        >
          <CenterIcon size={18} color={COLORS.textPrimary} />
        </TouchableOpacity>
      )}

      {/* Route Filter Panel */}
      {!isTripPlanningMode && (
        <HomeScreenControls
          routes={routes}
          selectedRoutes={selectedRoutes}
          onRouteSelect={handleRouteSelect}
          getRouteColor={getRouteColor}
        />
      )}

      {/* Detour Badge - show when selected routes have active detours */}
      {!isTripPlanningMode && selectedRoutesHaveDetour && (
        <View style={styles.detourBadgeContainer}>
          <DetourBadge
            detourCount={displayedDetours.length}
            confidenceLevel={primaryDisplayedDetour?.confidenceLevel}
            confidenceScore={primaryDisplayedDetour?.confidenceScore}
            segmentLabel={primaryDisplayedDetour?.segmentLabel}
            firstDetectedAt={primaryDisplayedDetour?.firstDetectedAt}
            lastSeenAt={primaryDisplayedDetour?.lastSeenAt}
            officialAlert={primaryDisplayedDetour?.officialAlert}
          />
        </View>
      )}

      {/* Bottom Action Bar - Stops toggle + Plan Trip */}
      {!isTripPlanningMode && (
        <BottomActionBar
          onPlanTrip={enterTripPlanningMode}
          showStops={showStops}
          onToggleStops={() => setShowStops(!showStops)}
        />
      )}

      {/* Trip Planning Mode UI */}
      {isTripPlanningMode && (
        <>
          <TripSearchHeader
            fromText={tripFromText}
            toText={tripToText}
            onFromChange={searchFromAddress}
            onToChange={searchToAddress}
            onFromSelect={selectFromSuggestion}
            onToSelect={selectToSuggestion}
            onSwap={swapTripLocations}
            onClose={exitTripPlanningMode}
            onUseCurrentLocation={useCurrentLocationForTrip}
            isLoading={isTripLoading}
            timeMode={timeMode}
            selectedTime={selectedTime}
            onTimeModeChange={setTimeMode}
            onSelectedTimeChange={setSelectedTime}
            onSearch={() => {
              if (tripFromLocation && tripToLocation) {
                searchTrips(tripFromLocation, tripToLocation);
              }
            }}
          />
          <TripBottomSheet
            itineraries={itineraries}
            selectedIndex={selectedItineraryIndex}
            onSelectItinerary={setSelectedItineraryIndex}
            onViewDetails={viewTripDetails}
            onStartNavigation={startNavigationDirect}
            isLoading={isTripLoading}
            error={tripError}
            hasSearched={hasTripSearched}
            onRetry={() => {
              if (tripFromLocation && tripToLocation) {
                searchTrips(tripFromLocation, tripToLocation);
              }
            }}
          />
        </>
      )}

      {/* Stop Bottom Sheet - only show when not in trip planning mode */}
      {!isTripPlanningMode && selectedStop && (
        <StopBottomSheet stop={selectedStop} onClose={() => setSelectedStop(null)} />
      )}

      {/* Map Tap Popup - for choosing directions from/to a tapped location */}
      <MapTapPopup
        visible={!!mapTapLocation}
        coordinate={mapTapLocation}
        address={mapTapAddress}
        isLoading={isLoadingAddress}
        onDirectionsFrom={handleDirectionsFrom}
        onDirectionsTo={handleDirectionsTo}
        onClose={closeMapTapPopup}
      />

      {/* Dev-only Detour Debug Panel */}
      {__DEV__ && (
        <DetourDebugPanel
          visible={showDetourDebugPanel}
          onClose={() => setShowDetourDebugPanel(false)}
          activeDetours={displayedDetours}
          detourHistory={detourHistory}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
  },
  errorText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.error,
    marginBottom: SPACING.sm,
  },
  errorDetail: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.round, // Pill-shaped per design spec
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  // Search Bar Header
  searchBar: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    right: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: SPACING.sm + 2,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.sm,
    gap: SPACING.sm,
    zIndex: 1000,
    ...SHADOWS.medium,
  },
  searchBarPlaceholder: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  statusBadgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successSubtle,
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    gap: 5,
  },
  statusDotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  statusTextLive: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: '700',
    color: COLORS.success,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // Center Map Button
  centerButton: {
    position: 'absolute',
    top: 64,
    right: SPACING.sm,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    borderWidth: 1,
    borderColor: COLORS.grey200,
    ...SHADOWS.small,
  },
  // Detour badge container - positioned below search bar, right of filter panel
  detourBadgeContainer: {
    position: 'absolute',
    top: 72,
    left: 80,
    right: SPACING.md,
    zIndex: 997,
  },
  // Trip planning markers
  tripMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
    ...SHADOWS.medium,
  },
  tripMarkerOrigin: {
    backgroundColor: COLORS.success,
  },
  tripMarkerDestination: {
    backgroundColor: COLORS.error,
  },
  tripMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tripMarkerInnerOrigin: {
    backgroundColor: COLORS.white,
  },
  tripMarkerInnerDestination: {
    backgroundColor: COLORS.white,
  },
  // Intermediate stop markers (small circles)
  intermediateStopMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  // Stop label markers (boarding/alighting)
  stopLabelContainer: {
    alignItems: 'center',
  },
  stopLabelBubble: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 2,
    maxWidth: 180,
    ...SHADOWS.small,
  },
  stopLabelType: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
  },
  stopLabelName: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  stopLabelPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  // Map tap marker (dropped pin style)
  mapTapMarker: {
    alignItems: 'center',
  },
  mapTapMarkerPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.white,
    ...SHADOWS.medium,
  },
  mapTapMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: -4,
    opacity: 0.5,
  },
});

export default HomeScreen;
