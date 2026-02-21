/**
 * Native-specific HomeScreen (iOS/Android)
 * Web platform uses HomeScreen.web.js instead
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Animated, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useTransit } from '../context/TransitContext';
import { MAP_CONFIG, OSM_MAP_STYLE } from '../config/constants';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';
import StopBottomSheet from '../components/StopBottomSheet';
import SheetErrorBoundary from '../components/SheetErrorBoundary';
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
import { getVehicleRouteLabel, resolveVehicleRouteLabel } from '../utils/routeLabel';
import logger from '../utils/logger';
import { useSearchHistory } from '../hooks/useSearchHistory';

// Native map components
import BusMarker from '../components/BusMarker';
import RoutePolyline from '../components/RoutePolyline';
import StopMarker from '../components/StopMarker';
import PulsingSpinner from '../components/PulsingSpinner';

// Trip planning components
import BottomActionBar from '../components/PlanTripFAB';
import TripSearchHeader from '../components/TripSearchHeader';
import TripBottomSheet from '../components/TripBottomSheet';
import MapTapPopup from '../components/MapTapPopup';
import HomeScreenControls from '../components/HomeScreenControls';
import FavoriteStopCard from '../components/FavoriteStopCard';
import Icon from '../components/Icon';


// SVG Icons for native replaced with Lucide Icons
const SearchIcon = ({ size = 20, color = COLORS.textSecondary }) => <Icon name="Search" size={size} color={color} />;
const CenterIcon = ({ size = 20, color = COLORS.textPrimary }) => <Icon name="Map" size={size} color={color} />;
const ROUTE_LABEL_DEBUG = __DEV__ && process.env.EXPO_PUBLIC_ROUTE_LABEL_DEBUG === 'true';

// Helper: convert region {lat, lng, latDelta, lngDelta} to MapLibre camera params
const regionToCamera = (region) => ({
  centerCoordinate: [region.longitude, region.latitude],
  zoomLevel: Math.log2(360 / region.latitudeDelta),
  animationDuration: 500,
});

// Helper: compute bounds from coordinates array [{latitude, longitude}]
const computeBounds = (coords) => {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  coords.forEach(c => {
    minLat = Math.min(minLat, c.latitude);
    maxLat = Math.max(maxLat, c.latitude);
    minLng = Math.min(minLng, c.longitude);
    maxLng = Math.max(maxLng, c.longitude);
  });
  return {
    ne: [maxLng, maxLat],
    sw: [minLng, minLat],
  };
};

const HomeScreen = ({ route }) => {
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
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
    tripMapping,
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
    isRouteDetouring,
  } = useTransit();

  // Wrap mapRef to provide animateToRegion compatibility for hooks
  const compatMapRef = useRef({
    animateToRegion: (region, duration = 500) => {
      cameraRef.current?.setCamera({
        centerCoordinate: [region.longitude, region.latitude],
        zoomLevel: Math.log2(360 / region.latitudeDelta),
        animationDuration: duration,
      });
    },
    fitToCoordinates: (coords, opts = {}) => {
      if (!coords || coords.length === 0) return;
      const bounds = computeBounds(coords);
      const padding = opts.edgePadding || {};
      cameraRef.current?.setCamera({
        bounds: { ne: bounds.ne, sw: bounds.sw },
        padding: {
          paddingTop: padding.top || 50,
          paddingRight: padding.right || 50,
          paddingBottom: padding.bottom || 50,
          paddingLeft: padding.left || 50,
        },
        animationDuration: opts.animated !== false ? 500 : 0,
      });
    },
  });

  const {
    selectedRoutes, hasSelection, handleRouteSelect, centerOnBarrie, isRouteSelected, selectRoute,
  } = useRouteSelection({ routeShapeMapping, shapes, mapRef: compatMapRef, multiSelect: true });
  const [selectedStop, setSelectedStop] = useState(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showStops, setShowStops] = useState(false);
  const [mapRegion, setMapRegion] = useState(MAP_CONFIG.INITIAL_REGION);
  const [userHasInteracted, setUserHasInteracted] = useState(false);

  // Trip planning — shared hook (with native-specific delay enrichment)
  const trip = useTripPlanner({
    routingData,
    isRoutingReady,
    applyDelays: applyDelaysToItineraries,
    onItinerariesReady: (itinerary) => {
      setUserHasInteracted(false);
      fitMapToItinerary(itinerary);
    },
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

  // Reset trip planner when navigating away from this tab
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused && isTripPlanningMode) {
      resetTrip();
    }
  }, [isFocused]);

  // Pulse animation for live indicator
  const pulseAnim = useMapPulseAnimation();

  // Map tap popup
  const {
    mapTapLocation, mapTapAddress, isLoadingAddress,
    handleMapPress: handleMapTapPress, handleDirectionsFrom, handleDirectionsTo, closeMapTapPopup,
    showLocation,
  } = useMapTapPopup({
    enterPlanningMode, setTripFrom, setTripTo,
    onMapTap: () => setSelectedStop(null),
  });

  // Navigation param effects (selected stop/route/coordinate, exit trip planning)
  useMapNavigation({
    route, navigation, stops, mapRef: compatMapRef,
    selectRoute, resetTrip, setSelectedStop, setShowStops,
    hasSelection, showLocation,
  });

  // Search history for recent trips
  const { addToHistory, getHistory } = useSearchHistory();
  const recentTrips = getHistory('trips');

  const handleSelectRecentTrip = (trip) => {
    setTripFrom(trip.from, trip.fromText);
    setTripTo(trip.to, trip.toText);
    searchTrips(trip.from, trip.to);
  };

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
  } = useDisplayedEntities({
    selectedRouteIds: selectedRoutes,
    vehicles, routes, trips, shapes, processedShapes,
    routeShapeMapping, routeStopsMapping, stops,
    showRoutes, showStops, mapRegion,
  });

  // Stable camera default settings — prevent re-centering on every re-render
  const cameraDefaultSettings = useMemo(() => ({
    centerCoordinate: [MAP_CONFIG.INITIAL_REGION.longitude, MAP_CONFIG.INITIAL_REGION.latitude],
    zoomLevel: Math.log2(360 / MAP_CONFIG.INITIAL_REGION.latitudeDelta),
  }), []);

  const getRouteLabel = useCallback((vehicle) => {
    return getVehicleRouteLabel(vehicle, routes, tripMapping);
  }, [routes, tripMapping]);

  useEffect(() => {
    if (!ROUTE_LABEL_DEBUG) return;
    if (!Array.isArray(displayedVehicles) || displayedVehicles.length === 0) return;

    const interesting = displayedVehicles.filter((v) =>
      /^(2|2A|2B|7|7A|7B|12|12A|12B)$/i.test(String(v.routeId || '').trim())
    );
    if (interesting.length === 0) return;

    const lines = interesting.slice(0, 12).map((vehicle) => {
      const resolved = resolveVehicleRouteLabel(vehicle, routes, tripMapping);
      return `${vehicle.id} raw=${vehicle.routeId || '-'} trip=${vehicle.tripId || '-'} map=${resolved.mappedRouteId || '-'} label=${resolved.label} source=${resolved.source}`;
    });

    logger.info('[route-label-debug][native] %s', lines.join(' | '));
  }, [displayedVehicles, routes, tripMapping]);

  // Handle map region change (MapLibre onRegionDidChange)
  const handleRegionChange = (feature) => {
    const { properties, geometry } = feature;
    const [lng, lat] = geometry.coordinates;
    const zoom = properties.zoomLevel;

    // Detect user-initiated map moves (pan/zoom by touch)
    if (properties.isUserInteraction) {
      setUserHasInteracted(true);
    }

    // Reconstruct region-like object for existing code
    const latDelta = 360 / Math.pow(2, zoom);
    const lngDelta = latDelta; // Approximate
    setMapRegion({
      latitude: lat,
      longitude: lng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    });
    setCurrentZoom(Math.round(zoom));
  };

  // Handle map press — MapLibre event format
  const handleMapPress = (e) => {
    const [lng, lat] = e.geometry.coordinates;
    // Convert to react-native-maps compatible format for the hook
    handleMapTapPress({
      nativeEvent: {
        coordinate: { latitude: lat, longitude: lng },
      },
    });
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

  // Handle "Trip from here" from stop bottom sheet
  const handleStopDirectionsFrom = (stopInfo) => {
    setSelectedStop(null);
    enterPlanningMode();
    setTripFrom({ lat: stopInfo.lat, lon: stopInfo.lon }, stopInfo.name || 'Selected stop');
  };

  // Handle "Trip to here" from stop bottom sheet
  const handleStopDirectionsTo = (stopInfo) => {
    setSelectedStop(null);
    enterPlanningMode();
    setTripTo({ lat: stopInfo.lat, lon: stopInfo.lon }, stopInfo.name || 'Selected stop');
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
        const decoded = decodePolyline(leg.legGeometry.points);
        coords.push(...decoded);
      }
      if (leg.intermediateStops) {
        leg.intermediateStops.forEach(stop => {
          if (stop.lat && stop.lon) {
            coords.push({ latitude: stop.lat, longitude: stop.lon });
          }
        });
      }
    });

    if (coords.length > 0) {
      compatMapRef.current.fitToCoordinates(coords, {
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
        <PulsingSpinner size={60} />
        <Text style={styles.loadingText}>Loading transit data...</Text>
      </View>
    );
  }

  if (staticError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load transit data</Text>
        <Text style={styles.errorDetail}>{staticError}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadStaticData} accessibilityRole="button" accessibilityLabel="Retry loading transit data">
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
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        mapStyle={OSM_MAP_STYLE}
        rotateEnabled
        pitchEnabled={false}
        attributionPosition={{ bottom: 8, left: 8 }}
        logoEnabled={false}
        onPress={handleMapPress}
        onRegionDidChange={handleRegionChange}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={cameraDefaultSettings}
        />
        <MapLibreGL.UserLocation visible={true} />

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
              id={`route-${shape.id}`}
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
          <BusMarker key={vehicle.id} vehicle={vehicle} color={getRouteColor(vehicle.routeId)} routeLabel={getRouteLabel(vehicle)} />
        ))}

        {/* Trip planning route overlay */}
        {tripRouteCoordinates.map((tripRoute) => (
          <RoutePolyline
            key={tripRoute.id}
            id={`trip-${tripRoute.id}`}
            coordinates={tripRoute.coordinates}
            color={tripRoute.color}
            strokeWidth={tripRoute.isWalk ? 3 : 5}
            lineDashPattern={tripRoute.isWalk ? [10, 5] : null}
            opacity={1}
          />
        ))}

        {/* Trip planning intermediate stop markers */}
        {intermediateStopMarkers.map((marker) => (
          <MapLibreGL.PointAnnotation
            key={marker.id}
            id={`int-stop-${marker.id}`}
            coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.intermediateStopMarker, { backgroundColor: marker.color }]} />
          </MapLibreGL.PointAnnotation>
        ))}

        {/* Trip planning markers */}
        {tripMarkers.map((marker) => (
          <MapLibreGL.PointAnnotation
            key={marker.id}
            id={`trip-marker-${marker.id}`}
            coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
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
          </MapLibreGL.PointAnnotation>
        ))}

        {/* Boarding and alighting stop markers with labels */}
        {boardingAlightingMarkers.map((marker) => (
          <MapLibreGL.PointAnnotation
            key={marker.id}
            id={`ba-${marker.id}`}
            coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
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
          </MapLibreGL.PointAnnotation>
        ))}

        {/* Real-time bus positions for trip routes */}
        {isTripPreviewMode && tripVehicles.map((vehicle) => (
          <BusMarker key={vehicle.id} vehicle={vehicle} color={getRouteColor(vehicle.routeId)} routeLabel={getRouteLabel(vehicle)} />
        ))}

        {/* Map tap marker - shows where user tapped */}
        {mapTapLocation && (
          <MapLibreGL.PointAnnotation
            id="map-tap-marker"
            coordinate={[mapTapLocation.longitude, mapTapLocation.latitude]}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.mapTapMarker}>
              <View style={styles.mapTapMarkerPin} />
              <View style={styles.mapTapMarkerDot} />
            </View>
          </MapLibreGL.PointAnnotation>
        )}
      </MapLibreGL.MapView>
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
              {isOffline ? 'Offline' : `${vehicles.length} buses live`}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Map Controls (Top Right) */}
      {!isTripPlanningMode && (
        <View style={styles.mapControls}>
          <TouchableOpacity
            style={styles.mapControlButton}
            onPress={centerOnBarrie}
            activeOpacity={0.7}
          >
            <CenterIcon size={18} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapControlButton, showStops && styles.mapControlButtonActive]}
            onPress={() => setShowStops(!showStops)}
            activeOpacity={0.7}
          >
            <Icon name="MapPin" size={18} color={showStops ? COLORS.white : COLORS.textPrimary} fill={showStops ? COLORS.primary : 'none'} />
          </TouchableOpacity>
        </View>
      )}

      {/* Route Filter Panel (Horizontal below search) */}
      {!isTripPlanningMode && (
        <HomeScreenControls
          routes={routes}
          selectedRoutes={selectedRoutes}
          onRouteSelect={handleRouteSelect}
          getRouteColor={getRouteColor}
          isRouteDetouring={isRouteDetouring}
        />
      )}

      {/* Favorite Stop Quick View */}
      {!isTripPlanningMode && (
        <FavoriteStopCard
          onPress={(stop) => {
            setSelectedStop(stop);
            setShowStops(true);
          }}
        />
      )}

      {/* Primary Action Button */}
      {!isTripPlanningMode && (
        <BottomActionBar
          onPlanTrip={enterTripPlanningMode}
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
                addToHistory('trips', {
                  from: tripFromLocation,
                  to: tripToLocation,
                  fromText: tripFromText,
                  toText: tripToText,
                });
                searchTrips(tripFromLocation, tripToLocation);
              }
            }}
          />
          <SheetErrorBoundary fallbackMessage="Trip results failed to load.">
            <TripBottomSheet
              itineraries={itineraries}
              selectedIndex={selectedItineraryIndex}
              onSelectItinerary={setSelectedItineraryIndex}
              onViewDetails={viewTripDetails}
              onStartNavigation={startNavigationDirect}
              isLoading={isTripLoading}
              error={tripError}
              hasSearched={hasTripSearched}
              recentTrips={recentTrips}
              onSelectRecentTrip={handleSelectRecentTrip}
              onRetry={() => {
                if (tripFromLocation && tripToLocation) {
                  searchTrips(tripFromLocation, tripToLocation);
                }
              }}
            />
          </SheetErrorBoundary>
        </>
      )}

      {/* Stop Bottom Sheet - only show when not in trip planning mode */}
      {!isTripPlanningMode && selectedStop && (
        <SheetErrorBoundary fallbackMessage="Stop details failed to load.">
          <StopBottomSheet
            stop={selectedStop}
            onClose={() => setSelectedStop(null)}
            onDirectionsFrom={handleStopDirectionsFrom}
            onDirectionsTo={handleStopDirectionsTo}
          />
        </SheetErrorBoundary>
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

    </View>
  );
};

const STATUS_BAR_OFFSET = Platform.OS === 'android' ? Constants.statusBarHeight : 0;

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
    top: SPACING.sm + STATUS_BAR_OFFSET,
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
  // Map Controls (Right Side)
  mapControls: {
    position: 'absolute',
    bottom: 32,
    left: SPACING.sm,
    flexDirection: 'column',
    gap: SPACING.sm,
    zIndex: 999,
  },
  mapControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.grey200,
    ...SHADOWS.small,
  },
  mapControlButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
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
