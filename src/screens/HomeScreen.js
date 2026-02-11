/**
 * Native-specific HomeScreen (iOS/Android)
 * Web platform uses HomeScreen.web.js instead
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MapView, { PROVIDER_GOOGLE, PROVIDER_DEFAULT, Polyline, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTransit } from '../context/TransitContext';
import { MAP_CONFIG, ROUTE_COLORS, SHAPE_PROCESSING } from '../config/constants';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';
import StopBottomSheet from '../components/StopBottomSheet';
import TripErrorDisplay from '../components/TripErrorDisplay';
import { reverseGeocode } from '../services/locationIQService';
import { useTripPlanner } from '../hooks/useTripPlanner';
import { applyDelaysToItineraries } from '../services/tripDelayService';
import { offsetPath } from '../utils/geometryUtils';
import logger from '../utils/logger';

// Native map components
import BusMarker from '../components/BusMarker';
import RoutePolyline from '../components/RoutePolyline';
import StopMarker from '../components/StopMarker';
import DetourPolyline from '../components/DetourPolyline';
import DetourBadge from '../components/DetourBadge';
import DetourDebugPanel from '../components/DetourDebugPanel';

// Trip planning components
import PlanTripFAB from '../components/PlanTripFAB';
import TripSearchHeader from '../components/TripSearchHeader';
import TripBottomSheet from '../components/TripBottomSheet';
import MapTapPopup from '../components/MapTapPopup';
import { CUSTOM_MAP_STYLE } from '../config/mapStyle';
import GlassContainer from '../components/GlassContainer';
import ScaleButton from '../components/ScaleButton';
import HomeScreenControls from '../components/HomeScreenControls';

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

  const [selectedRoutes, setSelectedRoutes] = useState(new Set());
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
    swap: swapTripLocations,
    setFrom: setTripFrom,
    setTo: setTripTo,
    selectItinerary: setSelectedItineraryIndex,
    enterPlanningMode,
    reset: resetTrip,
    useCurrentLocation: useCurrentLocationHook,
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
  } = tripState;

  // Map tap popup state
  const [mapTapLocation, setMapTapLocation] = useState(null);
  const [mapTapAddress, setMapTapAddress] = useState('');
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
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

  // Handle selected stop from navigation params
  useEffect(() => {
    if (route?.params?.selectedStopId) {
      const stop = stops.find((s) => s.id === route.params.selectedStopId);
      if (stop) {
        setSelectedStop(stop);
        mapRef.current?.animateToRegion(
          {
            latitude: stop.latitude,
            longitude: stop.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          500
        );
      }
    }
  }, [route?.params?.selectedStopId, stops]);

  // Handle exit from navigation - reset trip planning mode
  useEffect(() => {
    if (route?.params?.exitTripPlanning) {
      setIsTripPlanningMode(false);
      setTripFromText('');
      setTripToText('');
      setTripFromLocation(null);
      setTripToLocation(null);
      setItineraries([]);
      setSelectedItineraryIndex(0);
      setTripError(null);
      setHasTripSearched(false);
      // Clear the param to prevent re-triggering
      navigation.setParams({ exitTripPlanning: undefined });
    }
  }, [route?.params?.exitTripPlanning, navigation]);

  // Auto-enable stops and zoom to routes when selected
  useEffect(() => {
    if (selectedRoutes.size > 0) {
      setShowStops(true);
      // Zoom to show all selected routes
      zoomToSelectedRoutes(selectedRoutes);
    }
  }, [selectedRoutes]);

  // Center map on Barrie
  const centerOnBarrie = useCallback(() => {
    mapRef.current?.animateToRegion(MAP_CONFIG.INITIAL_REGION, 500);
  }, []);

  // Zoom to show all selected routes bounds
  const zoomToSelectedRoutes = useCallback((routeIds) => {
    if (routeIds.size === 0) return;

    // Collect all coordinates from all shapes for all selected routes
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    let hasCoords = false;

    routeIds.forEach(routeId => {
      const shapeIds = routeShapeMapping[routeId] || [];
      shapeIds.forEach(shapeId => {
        const coords = shapes[shapeId] || [];
        coords.forEach(coord => {
          minLat = Math.min(minLat, coord.latitude);
          maxLat = Math.max(maxLat, coord.latitude);
          minLng = Math.min(minLng, coord.longitude);
          maxLng = Math.max(maxLng, coord.longitude);
          hasCoords = true;
        });
      });
    });

    if (hasCoords && minLat < maxLat && minLng < maxLng) {
      const padding = 0.005;
      mapRef.current?.animateToRegion({
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: (maxLat - minLat) + padding,
        longitudeDelta: (maxLng - minLng) + padding,
      }, 500);
    }
  }, [routeShapeMapping, shapes]);

  // Handle route selection with toggle behavior (multiple selection)
  const handleRouteSelect = useCallback((routeId) => {
    if (routeId === null) {
      // "All" button clicked - clear all selections
      setSelectedRoutes(new Set());
      centerOnBarrie();
    } else {
      setSelectedRoutes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(routeId)) {
          // Route already selected - toggle it off
          newSet.delete(routeId);
          if (newSet.size === 0) {
            centerOnBarrie();
          }
        } else {
          // Add route to selection
          newSet.add(routeId);
        }
        return newSet;
      });
    }
  }, [centerOnBarrie]);

  // Get the route color
  const getRouteColor = useCallback(
    (routeId) => {
      const foundRoute = routes.find((r) => r.id === routeId);
      if (foundRoute?.color) return foundRoute.color;
      return ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
    },
    [routes]
  );

  // Filter vehicles by selected routes
  const displayedVehicles = useMemo(() => {
    return selectedRoutes.size > 0
      ? vehicles.filter((v) => selectedRoutes.has(v.routeId))
      : vehicles;
  }, [selectedRoutes, vehicles]);

  // Get shapes to display (prefer processedShapes for smooth rendering)
  const displayedShapes = useMemo(() => {
    const shapeSource = Object.keys(processedShapes).length > 0 ? processedShapes : shapes;
    const shapesToDisplay = [];

    if (selectedRoutes.size > 0) {
      selectedRoutes.forEach(routeId => {
        const shapeIds = routeShapeMapping[routeId] || [];
        shapeIds.forEach((shapeId) => {
          const coords = shapeSource[shapeId];
          if (coords) {
            shapesToDisplay.push({
              id: shapeId,
              coordinates: coords,
              color: getRouteColor(routeId),
              routeId: routeId,
            });
          }
        });
      });
    } else if (showRoutes) {
      // Pick only the longest shape per route for clean single-line rendering
      Object.keys(routeShapeMapping).forEach((routeId) => {
        const shapeIds = routeShapeMapping[routeId] || [];
        let longestId = null;
        let maxPoints = 0;
        shapeIds.forEach((shapeId) => {
          const coords = shapeSource[shapeId];
          if (coords && coords.length > maxPoints) {
            maxPoints = coords.length;
            longestId = shapeId;
          }
        });
        if (longestId) {
          shapesToDisplay.push({
            id: longestId,
            coordinates: shapeSource[longestId],
            color: getRouteColor(routeId),
            routeId,
          });
        }
      });
    }

    return shapesToDisplay;
  }, [selectedRoutes, showRoutes, routeShapeMapping, shapes, processedShapes, shapeOverlapOffsets, getRouteColor]);

  // Get stops to display - using GTFS stop-route mapping for accuracy
  const displayedStops = useMemo(() => {
    if (!showStops) return [];

    let filteredStops = [];

    // If routes are selected, show only stops that serve those routes (from GTFS data)
    if (selectedRoutes.size > 0) {
      // Combine stop IDs from all selected routes
      const combinedStopIds = new Set();
      selectedRoutes.forEach(routeId => {
        const stopIds = routeStopsMapping[routeId] || [];
        stopIds.forEach(stopId => combinedStopIds.add(stopId));
      });
      filteredStops = stops.filter(stop => combinedStopIds.has(stop.id));
    } else {
      // No route selected - use viewport-based filtering
      // Don't show stops when zoomed out too far
      if (mapRegion.latitudeDelta > 0.05) return [];

      // Calculate viewport bounds with a small buffer
      const buffer = mapRegion.latitudeDelta * 0.1;
      const minLat = mapRegion.latitude - mapRegion.latitudeDelta / 2 - buffer;
      const maxLat = mapRegion.latitude + mapRegion.latitudeDelta / 2 + buffer;
      const minLng = mapRegion.longitude - mapRegion.longitudeDelta / 2 - buffer;
      const maxLng = mapRegion.longitude + mapRegion.longitudeDelta / 2 + buffer;

      // Filter stops by viewport bounds
      filteredStops = stops.filter(stop =>
        stop.latitude >= minLat &&
        stop.latitude <= maxLat &&
        stop.longitude >= minLng &&
        stop.longitude <= maxLng
      );
    }

    // Limit to 150 stops for performance
    return filteredStops.slice(0, 150);
  }, [showStops, mapRegion, stops, selectedRoutes, routeStopsMapping]);

  // Get detours to display for selected routes
  const displayedDetours = useMemo(() => {
    if (!activeDetours || activeDetours.length === 0) return [];

    // If routes are selected, only show detours for those routes
    if (selectedRoutes.size > 0) {
      return activeDetours.filter(detour => selectedRoutes.has(detour.routeId));
    }

    // Otherwise show all active detours
    return activeDetours;
  }, [activeDetours, selectedRoutes]);

  const primaryDisplayedDetour = useMemo(
    () => (displayedDetours.length > 0 ? displayedDetours[0] : null),
    [displayedDetours]
  );

  const detourHistory = useMemo(() => {
    if (!getDetourHistory) return [];
    return getDetourHistory(null, 20);
  }, [getDetourHistory, activeDetours, lastVehicleUpdate]);

  // Check if any selected route has an active detour
  const selectedRoutesHaveDetour = useMemo(() => {
    if (selectedRoutes.size === 0) return false;
    for (const routeId of selectedRoutes) {
      if (hasActiveDetour(routeId)) return true;
    }
    return false;
  }, [selectedRoutes, hasActiveDetour]);

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

  // Map tap handlers
  const handleMapPress = async (event) => {
    const { coordinate } = event.nativeEvent;
    setMapTapLocation(coordinate);
    setMapTapAddress('');
    setIsLoadingAddress(true);
    setSelectedStop(null);

    try {
      const result = await reverseGeocode(coordinate.latitude, coordinate.longitude);
      setMapTapAddress(result?.shortName || 'Selected location');
    } catch {
      setMapTapAddress('Selected location');
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const handleDirectionsFrom = () => {
    if (!mapTapLocation) return;
    enterPlanningMode();
    setTripFrom(
      { lat: mapTapLocation.latitude, lon: mapTapLocation.longitude },
      mapTapAddress || 'Selected location'
    );
    setMapTapLocation(null);
  };

  const handleDirectionsTo = () => {
    if (!mapTapLocation) return;
    enterPlanningMode();
    setTripTo(
      { lat: mapTapLocation.latitude, lon: mapTapLocation.longitude },
      mapTapAddress || 'Selected location'
    );
    setMapTapLocation(null);
  };

  const closeMapTapPopup = () => {
    setMapTapLocation(null);
    setMapTapAddress('');
  };

  const handleTripFromSelect = (location) => {
    setTripFrom({ lat: location.lat, lon: location.lon });
  };

  const handleTripToSelect = (location) => {
    setTripTo({ lat: location.lat, lon: location.lon });
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
        if (tripRouteIds.has(v.routeId) && v.latitude && v.longitude) {
          coords.push({ latitude: v.latitude, longitude: v.longitude });
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

  // Decode polyline string to coordinates
  const decodePolyline = (encoded) => {
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

  // Get trip route coordinates for map display
  const tripRouteCoordinates = useMemo(() => {
    if (!isTripPlanningMode || itineraries.length === 0) return [];

    const selectedItinerary = itineraries[selectedItineraryIndex];
    if (!selectedItinerary) return [];

    const routes = [];
    selectedItinerary.legs.forEach((leg, index) => {
      const coords = [];

      if (leg.legGeometry?.points) {
        // Use encoded polyline if available
        const decoded = decodePolyline(leg.legGeometry.points);
        coords.push(...decoded);
      } else if (leg.mode !== 'WALK' && leg.intermediateStops && leg.intermediateStops.length > 0) {
        // For transit legs without geometry, use boarding -> intermediate stops -> alighting
        if (leg.from) {
          coords.push({ latitude: leg.from.lat, longitude: leg.from.lon });
        }
        leg.intermediateStops.forEach((stop) => {
          if (stop.lat && stop.lon) {
            coords.push({ latitude: stop.lat, longitude: stop.lon });
          }
        });
        if (leg.to) {
          coords.push({ latitude: leg.to.lat, longitude: leg.to.lon });
        }
      } else if (leg.from && leg.to) {
        // Fallback to straight line
        coords.push({ latitude: leg.from.lat, longitude: leg.from.lon });
        coords.push({ latitude: leg.to.lat, longitude: leg.to.lon });
      }

      if (coords.length > 0) {
        routes.push({
          id: `trip-leg-${index}`,
          coordinates: coords,
          color: leg.mode === 'WALK' ? COLORS.grey500 : (leg.route?.color || COLORS.primary),
          isWalk: leg.mode === 'WALK',
        });
      }
    });

    return routes;
  }, [isTripPlanningMode, itineraries, selectedItineraryIndex]);

  // Get trip markers (origin, destination, transfers)
  const tripMarkers = useMemo(() => {
    if (!isTripPlanningMode || itineraries.length === 0) return [];

    const selectedItinerary = itineraries[selectedItineraryIndex];
    if (!selectedItinerary || !selectedItinerary.legs) return [];

    const markers = [];
    const firstLeg = selectedItinerary.legs[0];
    const lastLeg = selectedItinerary.legs[selectedItinerary.legs.length - 1];

    if (firstLeg?.from) {
      markers.push({
        id: 'origin',
        coordinate: { latitude: firstLeg.from.lat, longitude: firstLeg.from.lon },
        type: 'origin',
        title: 'Start',
      });
    }

    if (lastLeg?.to) {
      markers.push({
        id: 'destination',
        coordinate: { latitude: lastLeg.to.lat, longitude: lastLeg.to.lon },
        type: 'destination',
        title: 'End',
      });
    }

    return markers;
  }, [isTripPlanningMode, itineraries, selectedItineraryIndex]);

  // Get intermediate stop markers for trip display
  const intermediateStopMarkers = useMemo(() => {
    if (!isTripPlanningMode || itineraries.length === 0) return [];

    const selectedItinerary = itineraries[selectedItineraryIndex];
    if (!selectedItinerary) return [];

    const stopMarkers = [];
    selectedItinerary.legs.forEach((leg, legIndex) => {
      // Only show intermediate stops for transit legs
      if (leg.mode === 'WALK' || !leg.intermediateStops) return;

      leg.intermediateStops.forEach((stop, stopIndex) => {
        if (stop.lat && stop.lon) {
          stopMarkers.push({
            id: `stop-${legIndex}-${stopIndex}`,
            coordinate: { latitude: stop.lat, longitude: stop.lon },
            name: stop.name,
            color: leg.route?.color || COLORS.primary,
          });
        }
      });
    });

    return stopMarkers;
  }, [isTripPlanningMode, itineraries, selectedItineraryIndex]);

  // Get boarding and alighting stop markers for trip display (with labels)
  const boardingAlightingMarkers = useMemo(() => {
    if (!isTripPlanningMode || itineraries.length === 0) return [];

    const selectedItinerary = itineraries[selectedItineraryIndex];
    if (!selectedItinerary) return [];

    const markers = [];
    selectedItinerary.legs.forEach((leg, legIndex) => {
      // Only show boarding/alighting for transit legs
      if (leg.mode === 'WALK') return;

      const routeColor = leg.route?.color || COLORS.primary;
      const routeName = leg.route?.shortName || '';

      // Boarding stop
      if (leg.from && leg.from.lat && leg.from.lon) {
        markers.push({
          id: `boarding-${legIndex}`,
          coordinate: { latitude: leg.from.lat, longitude: leg.from.lon },
          type: 'boarding',
          stopName: leg.from.name,
          stopCode: leg.from.stopCode || leg.from.stopId,
          routeColor,
          routeName,
        });
      }

      // Alighting stop
      if (leg.to && leg.to.lat && leg.to.lon) {
        markers.push({
          id: `alighting-${legIndex}`,
          coordinate: { latitude: leg.to.lat, longitude: leg.to.lon },
          type: 'alighting',
          stopName: leg.to.name,
          stopCode: leg.to.stopCode || leg.to.stopId,
          routeColor,
          routeName,
        });
      }
    });

    return markers;
  }, [isTripPlanningMode, itineraries, selectedItineraryIndex]);

  // Vehicles belonging to the specific trips in the selected itinerary
  const tripVehicles = useMemo(() => {
    if (!isTripPlanningMode || itineraries.length === 0) return [];
    const selectedItinerary = itineraries[selectedItineraryIndex];
    if (!selectedItinerary) return [];

    // Collect specific trip IDs from transit legs
    const tripIds = new Set();
    selectedItinerary.legs.forEach(leg => {
      if (leg.mode !== 'WALK' && leg.tripId) {
        tripIds.add(leg.tripId);
      }
    });

    if (tripIds.size === 0) return [];

    // Filter by exact trip ID first; fall back to route ID if no matches
    // (GTFS-RT may not always report the same trip ID format)
    const byTripId = vehicles.filter(v => tripIds.has(v.tripId));
    if (byTripId.length > 0) return byTripId;

    // Fallback: filter by route IDs (original behavior)
    const tripRouteIds = new Set();
    selectedItinerary.legs.forEach(leg => {
      if (leg.mode !== 'WALK' && leg.route?.id) {
        tripRouteIds.add(leg.route.id);
      }
    });
    return vehicles.filter(v => tripRouteIds.has(v.routeId));
  }, [isTripPlanningMode, itineraries, selectedItineraryIndex, vehicles]);

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
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
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
          const isSelected = selectedRoutes.has(shape.routeId);
          const hasSelection = selectedRoutes.size > 0;

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

      {/* Status Bar - hide in trip planning mode */}
      {!isTripPlanningMode && (
        <View style={styles.statusBarContainer}>
          <GlassContainer style={styles.statusBar}>
            <View style={styles.statusLeft}>
              <View style={[
                styles.statusDot,
                isLoadingVehicles && styles.statusDotLoading,
                isOffline && styles.statusDotOffline
              ]} />
              <Text style={styles.statusText}>
                {isOffline
                  ? 'Offline mode'
                  : `${vehicles.length} buses • Updated ${formatLastUpdate()}`}
                {usingCachedData && !isOffline && ' (cached)'}
              </Text>
            </View>
          </GlassContainer>
        </View>
      )}

      {/* Glassmorphism Filter Chips */}
      {/* Extracted Controls (Sidebar & Floating Buttons) */}
      {!isTripPlanningMode && (
        <HomeScreenControls
          routes={routes}
          selectedRoutes={selectedRoutes}
          onRouteSelect={handleRouteSelect}
          getRouteColor={getRouteColor}
          showStops={showStops}
          onToggleStops={() => setShowStops(!showStops)}
          showRoutes={showRoutes}
          onToggleRoutes={() => setShowRoutes(!showRoutes)}
          onCenterMap={centerOnBarrie}
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

      {/* Plan Trip FAB - only show when not in trip planning mode */}
      {!isTripPlanningMode && (
        <PlanTripFAB onPress={enterTripPlanningMode} />
      )}

      {/* Trip Planning Mode UI */}
      {isTripPlanningMode && (
        <>
          <TripSearchHeader
            fromText={tripFromText}
            toText={tripToText}
            onFromChange={setTripFromText}
            onToChange={setTripToText}
            onFromSelect={handleTripFromSelect}
            onToSelect={handleTripToSelect}
            onSwap={swapTripLocations}
            onClose={exitTripPlanningMode}
            onUseCurrentLocation={useCurrentLocationForTrip}
            isLoading={isTripLoading}
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
  statusBarContainer: {
    position: 'absolute',
    top: 50,
    left: SPACING.md,
    right: SPACING.md,
    ...SHADOWS.medium,
  },
  statusBar: {
    padding: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: SPACING.sm,
  },
  statusDotLoading: {
    backgroundColor: COLORS.warning,
  },
  statusDotOffline: {
    backgroundColor: COLORS.grey400,
  },
  statusText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  // Detour badge container - positioned below status bar
  detourBadgeContainer: {
    position: 'absolute',
    top: 100,
    left: SPACING.md,
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
