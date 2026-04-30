/**
 * Native-specific HomeScreen (iOS/Android)
 * Web platform uses HomeScreen.web.js instead
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Animated, Platform, InteractionManager } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTransitStatic, useTransitRealtime } from '../context/TransitContext';
import { useAuth } from '../context/AuthContext';
import { ANIMATION, MAP_CONFIG, OSM_MAP_STYLE, PERFORMANCE_BUDGETS } from '../config/constants';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, FONT_FAMILIES } from '../config/theme';
import StopBottomSheet from '../components/StopBottomSheet';
import SheetErrorBoundary from '../components/SheetErrorBoundary';
import { useTripPlanner } from '../hooks/useTripPlanner';
import { useRouteSelection } from '../hooks/useRouteSelection';
import { useTripVisualization } from '../hooks/useTripVisualization';
import { useMapTapPopup } from '../hooks/useMapTapPopup';
import { useMapPulseAnimation } from '../hooks/useMapPulseAnimation';
import { useMapNavigation } from '../hooks/useMapNavigation';
import { useDisplayedEntities } from '../hooks/useDisplayedEntities';
import { useTripPreviewViewport } from '../hooks/useTripPreviewViewport';
import { applyDelaysToItineraries } from '../services/tripDelayService';
import { getVehicleRouteDirectionLabel, getVehicleRouteLabel, resolveVehicleRouteLabel } from '../utils/routeLabel';
import { pointToPolylineDistance, projectPointToPolyline } from '../utils/geometryUtils';
import { shouldKeepHiddenRouteShapeLayerMounted, shouldRenderRouteShape } from '../utils/detourFocusUtils';
import { routeIsDetouring } from '../utils/routeDetourMatching';
import logger from '../utils/logger';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useDetourOverlays } from '../hooks/useDetourOverlays';
import { useZoneOverlays } from '../hooks/useZoneOverlays';
import ZoneOverlay from '../components/ZoneOverlay';
import ZoneInfoSheet from '../components/ZoneInfoSheet';

// Native map components
import BusMarker from '../components/BusMarker';
import BusDirectionArrow from '../components/BusDirectionArrow';
import RoutePolyline from '../components/RoutePolyline';
import DetourOverlay from '../components/DetourOverlay';
import PulsingSpinner from '../components/PulsingSpinner';
import LoadingSkeleton from '../components/LoadingSkeleton';

// Trip planning components
import BottomActionBar from '../components/PlanTripFAB';
import TripSearchHeader from '../components/TripSearchHeader';
import TripBottomSheet from '../components/TripBottomSheet';
import MapTapPopup from '../components/MapTapPopup';
import HomeScreenControls from '../components/HomeScreenControls';
import RouteFilterSheet from '../components/RouteFilterSheet';
import FavoriteStopCard from '../components/FavoriteStopCard';
import Icon from '../components/Icon';
import TripViewportControls from '../components/TripViewportControls';
import SurveyNudgeBanner from '../components/survey/SurveyNudgeBanner';
import AddressAutocomplete from '../components/AddressAutocomplete';
import DetourAlertStrip from '../components/DetourAlertStrip';
import DetourDetailsSheet from '../components/DetourDetailsSheet';
import MapViewModeToggle from '../components/MapViewModeToggle';
import DetourMapLegend from '../components/DetourMapLegend';
import { deriveAffectedStopDetailsForDetour } from '../hooks/useAffectedStops';
import StatusBadge from '../components/StatusBadge';
import SystemHealthBanner from '../components/SystemHealthBanner';
import SystemHealthChip from '../components/SystemHealthChip';
import useRoutePanel from '../hooks/useRoutePanel';
import { getTransitLoadingState } from '../utils/systemHealthUI';
import { startTripToDestination } from '../features/trip-planning/startTripToDestination';
import { selectStopTripDestination } from '../features/trip-planning/selectStopTripDestination';
import { getForegroundDeviceLocation } from '../utils/currentLocation';
import { useAnimatedBusPosition } from '../hooks/useAnimatedBusPosition';


// SVG Icons for native replaced with Lucide Icons
const SearchIcon = ({ size = 20, color = COLORS.textSecondary }) => <Icon name="Search" size={size} color={color} />;
const CenterIcon = ({ size = 20, color = COLORS.textPrimary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3V6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Path d="M12 18V21" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Path d="M3 12H6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Path d="M18 12H21" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Circle cx="12" cy="12" r="4.5" stroke={color} strokeWidth={2} />
    <Circle cx="12" cy="12" r="1.5" fill={color} />
  </Svg>
);
const ROUTE_LABEL_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_ROUTE_LABEL_DEBUG === 'true';
const PERF_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_PERF_DEBUG === 'true';
const MAP_LAYER_INDEX = {
  ROUTES: 100,
  REGULAR_STOPS_BORDER: 700,
  REGULAR_STOPS_FILL: 701,
  TRIP_ROUTES: 760,
  BUS_APPROACH_LINES: 770,
};

const getPerfNow = () => (
  typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
    ? global.performance.now()
    : Date.now()
);

const normalizeBearing = (bearing) => {
  const numericBearing = Number(bearing);
  return Number.isFinite(numericBearing)
    ? ((numericBearing % 360) + 360) % 360
    : null;
};

const getVehicleDirectionBearing = (vehicle, snapPath) => {
  const directBearing = normalizeBearing(vehicle?.bearing);
  if (directBearing !== null) {
    return directBearing;
  }

  const coordinate = vehicle?.coordinate;
  if (
    !Array.isArray(snapPath) ||
    snapPath.length < 2 ||
    !Number.isFinite(coordinate?.latitude) ||
    !Number.isFinite(coordinate?.longitude)
  ) {
    return null;
  }

  const projection = projectPointToPolyline(coordinate, snapPath);
  if (
    !projection ||
    projection.distanceMeters > ANIMATION.BUS_ROUTE_SNAP_MAX_DISTANCE_M ||
    !Number.isFinite(projection.bearing)
  ) {
    return null;
  }

  return normalizeBearing(projection.bearing);
};

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

const hasMeaningfulRegionChange = (prevRegion, nextRegion) => {
  if (!prevRegion || !nextRegion) return true;

  const latThreshold = Math.max(nextRegion.latitudeDelta * 0.04, 0.0005);
  const lngThreshold = Math.max(nextRegion.longitudeDelta * 0.04, 0.0005);
  const deltaThreshold = Math.max(nextRegion.latitudeDelta * 0.08, 0.0007);

  return (
    Math.abs(prevRegion.latitude - nextRegion.latitude) > latThreshold ||
    Math.abs(prevRegion.longitude - nextRegion.longitude) > lngThreshold ||
    Math.abs(prevRegion.latitudeDelta - nextRegion.latitudeDelta) > deltaThreshold ||
    Math.abs(prevRegion.longitudeDelta - nextRegion.longitudeDelta) > deltaThreshold
  );
};

const MAP_REGION_STATE_THROTTLE_MS = 220;
const MAP_ZOOM_RENDER_STEP = 0.25;

const getRenderZoom = (zoom) => (
  Number.isFinite(zoom)
    ? Math.round(zoom / MAP_ZOOM_RENDER_STEP) * MAP_ZOOM_RENDER_STEP
    : zoom
);

const getSelectedRouteLabelThreshold = (selectedRouteCount) => (
  selectedRouteCount === 1 ? 13.4 : 13.6
);

const getBaseRouteVisual = ({ shape, currentZoom }) => ({
  routeOpacity:
    shape.visualType === 'shared_trunk'
      ? 0.34
      : shape.visualType === 'family'
        ? 0.42
        : currentZoom >= 13.8
          ? 0.52
          : 0.38,
  routeStrokeWidth:
    shape.visualType === 'shared_trunk'
      ? 2.2
      : currentZoom >= 14.2
        ? 3
        : 2.4,
  routeColor: shape.color,
  outlineWidth: shape.visualType === 'shared_trunk' ? 0 : currentZoom >= 14.2 ? 1 : 0.5,
  showRouteLabel: false,
  showArrows: false,
});

const getRouteVisualState = ({
  shape,
  isSelected,
  hasSelection,
  isDetouring,
  isDetourView,
  hasDetourFocus,
  isFocusedDetour,
  currentZoom,
  selectedRouteCount,
}) => {
  if (hasDetourFocus) {
    return {
      routeOpacity: isFocusedDetour ? 0.98 : isDetouring ? 0.2 : 0.1,
      routeStrokeWidth: isFocusedDetour ? 5 : 2,
      routeColor: isFocusedDetour ? shape.color : COLORS.grey400,
      outlineWidth: isFocusedDetour ? (currentZoom >= 14.2 ? 2.5 : 1.5) : 0,
      showRouteLabel: false,
      showArrows: false,
    };
  }

  if (isDetourView && !hasSelection) {
    return {
      routeOpacity: isDetouring ? 0.82 : 0.18,
      routeStrokeWidth: isDetouring ? 4 : 2,
      routeColor: isDetouring ? shape.color : COLORS.grey400,
      outlineWidth: isDetouring ? (currentZoom >= 14.2 ? 1.5 : 1) : 0,
      showRouteLabel: false,
      showArrows: false,
    };
  }

  if (hasSelection) {
    const showRouteLabel =
      isSelected &&
      selectedRouteCount <= 2 &&
      currentZoom >= getSelectedRouteLabelThreshold(selectedRouteCount);

    return {
      routeOpacity: isSelected ? 1 : 0.3,
      routeStrokeWidth: isSelected ? 4 : 2,
      routeColor: shape.color,
      outlineWidth: isSelected ? (currentZoom >= 14.2 ? 2 : 1.5) : 0,
      showRouteLabel,
      showArrows: isSelected && currentZoom >= 14 && selectedRouteCount === 1,
    };
  }

  return getBaseRouteVisual({ shape, currentZoom });
};

const HomeMapRoutesLayer = React.memo(({
  isTripPreviewMode,
  displayedShapes,
  isRouteSelected,
  hasSelection,
  selectedRouteCount,
  currentZoom,
  activeDetourRouteIds,
  hasDetourFocus,
  focusedDetourRouteId,
  isDetourView,
  routeShortNameMap,
  detourOverlays,
  handleDetourOverlayPress,
  zoneOverlays,
  handleZonePress,
}) => {
  if (isTripPreviewMode) {
    return null;
  }

  return (
    <>
      {displayedShapes.map((shape) => {
        const isSelected = isRouteSelected(shape.routeId);
        const isDetouring = routeIsDetouring(shape.routeId, activeDetourRouteIds);
        const isFocusedDetour = hasDetourFocus && focusedDetourRouteId === shape.routeId;
        const shouldRenderShape = shouldRenderRouteShape({
          routeId: shape.routeId,
          activeDetourRouteIds,
          isDetourView,
          hasDetourFocus,
          focusedDetourRouteId,
        });

        if (!shouldRenderShape) {
          if (shouldKeepHiddenRouteShapeLayerMounted({
            routeId: shape.routeId,
            activeDetourRouteIds,
            isDetourView,
          })) {
            return (
              <RoutePolyline
                key={shape.id}
                id={`route-${shape.id}`}
                coordinates={shape.coordinates}
                color={shape.color}
                strokeWidth={1}
                opacity={0}
                outlineWidth={0}
                showArrows={false}
                routeLabel={null}
                layerIndex={MAP_LAYER_INDEX.ROUTES}
              />
            );
          }
          return null;
        }

        const routeVisual = getRouteVisualState({
          shape,
          isSelected,
          hasSelection,
          isDetouring,
          isDetourView,
          hasDetourFocus,
          isFocusedDetour,
          currentZoom,
          selectedRouteCount,
        });

        return (
          <RoutePolyline
            key={shape.id}
            id={`route-${shape.id}`}
            coordinates={shape.coordinates}
            color={routeVisual.routeColor}
            strokeWidth={routeVisual.routeStrokeWidth}
            opacity={routeVisual.routeOpacity}
            outlineWidth={routeVisual.outlineWidth}
            showArrows={routeVisual.showArrows}
            routeLabel={routeVisual.showRouteLabel ? (routeShortNameMap.get(shape.routeId) || null) : null}
            layerIndex={MAP_LAYER_INDEX.ROUTES}
          />
        );
      })}
      {detourOverlays.map((overlay) => (
        <DetourOverlay
          key={`detour-${overlay.routeId}`}
          {...overlay}
          renderMode="geometry"
          onPress={() => handleDetourOverlayPress?.(overlay.routeId)}
        />
      ))}
      {zoneOverlays.map((zone) => (
        <ZoneOverlay
          key={`zone-${zone.id}`}
          id={zone.id}
          coordinates={zone.coordinates}
          color={zone.color}
          onPress={handleZonePress}
        />
      ))}
    </>
  );
});

const HomeMapStopsLayer = React.memo(({
  isTripPreviewMode,
  displayedStopsLength,
  stopsGeoJson,
  handleStopLayerPress,
}) => {
  if (isTripPreviewMode || displayedStopsLength === 0) {
    return null;
  }

  return (
    <MapLibreGL.ShapeSource
      id="home-stops-source"
      shape={stopsGeoJson}
      onPress={handleStopLayerPress}
      hitbox={{ width: 20, height: 20 }}
    >
      <MapLibreGL.CircleLayer
        id="home-stops-border"
        layerIndex={MAP_LAYER_INDEX.REGULAR_STOPS_BORDER}
        style={{
          circleRadius: ['case', ['==', ['get', 'isSelected'], 1], 9, 6],
          circleColor: COLORS.white,
        }}
      />
      <MapLibreGL.CircleLayer
        id="home-stops-fill"
        layerIndex={MAP_LAYER_INDEX.REGULAR_STOPS_FILL}
        aboveLayerID="home-stops-border"
        style={{
          circleRadius: ['case', ['==', ['get', 'isSelected'], 1], 6, 4],
          circleColor: [
            'case',
            ['==', ['get', 'isClosed'], 1],
            COLORS.error,
            ['==', ['get', 'isSelected'], 1],
            COLORS.accent,
            COLORS.primary,
          ],
        }}
      />
    </MapLibreGL.ShapeSource>
  );
});

const HomeMapTopStopsOverlay = React.memo(({
  isTripPreviewMode,
  visible,
  displayedStops,
  selectedStopId,
}) => {
  if (isTripPreviewMode || !visible || !Array.isArray(displayedStops) || displayedStops.length === 0) {
    return null;
  }

  return displayedStops
    .filter((stop) => Number.isFinite(stop?.latitude) && Number.isFinite(stop?.longitude))
    .map((stop, index) => {
      const isSelected = selectedStopId != null && stop.id === selectedStopId;
      const isClosed = Boolean(stop.isClosed);
      return (
        <MapLibreGL.MarkerView
          key={`top-stop-${stop.id ?? 'stop'}-${index}`}
          id={`top-stop-${stop.id ?? 'stop'}-${index}`}
          coordinate={[stop.longitude, stop.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View
            collapsable={false}
            pointerEvents="none"
            style={[
              styles.topStopMarkerFrame,
              isSelected && styles.topStopMarkerFrameSelected,
            ]}
          >
            <View style={[
              styles.topStopMarkerOuter,
              isClosed && styles.topStopMarkerOuterClosed,
              isSelected && styles.topStopMarkerOuterSelected,
            ]}>
              {isClosed ? (
                <Text style={styles.topStopMarkerClosedText}>!</Text>
              ) : (
                <View style={[
                  styles.topStopMarkerInner,
                  isSelected && styles.topStopMarkerInnerSelected,
                ]} />
              )}
            </View>
          </View>
        </MapLibreGL.MarkerView>
      );
    });
});

const AndroidLiveBusMarker = React.memo(({
  vehicle,
  markerColor,
  dimmed,
  routeLabel,
  routeDirectionLabel,
  snapPath,
}) => {
  const { latitude, longitude, bearing } = useAnimatedBusPosition(vehicle, { snapPath });
  const markerWidth = routeLabel.length >= 3 ? 42 : routeLabel.length === 2 ? 36 : 30;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return (
    <MapLibreGL.MarkerView
      key={vehicle.id}
      id={`home-bus-${vehicle.id}`}
      coordinate={[longitude, latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View
        collapsable={false}
        style={styles.androidBusMarkerFrame}
      >
        <BusDirectionArrow
          bearing={bearing}
          size={44}
          topOffset={-5}
          arrowWidth={8}
          arrowHeight={16}
          color={markerColor}
          dimmed={dimmed}
        />
        <View
          style={[
            styles.androidBusMarker,
            dimmed && styles.androidBusMarkerDimmed,
            {
              backgroundColor: markerColor,
              width: markerWidth,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={styles.androidBusMarkerLabel}
          >
            {routeLabel}
          </Text>
          {routeDirectionLabel ? (
            <Text style={styles.androidBusMarkerDirectionLabel}>
              {routeDirectionLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </MapLibreGL.MarkerView>
  );
});

const HomeMapVehiclesLayer = React.memo(({
  isTripPreviewMode,
  displayedVehicles,
  activeDetourRouteIds,
  hasDetourFocus,
  focusedDetourRouteId,
  isDetourView,
  hasSelection,
  getRouteColor,
  getRouteLabel,
  getVehicleSnapPath,
}) => {
  if (isTripPreviewMode) {
    return null;
  }

  // Android emulators degrade badly with a large fleet of rich MarkerView instances.
  // Use a minimal MarkerView on the always-on home fleet: no JS animation hook,
  // just a plain badge plus a lightweight direction chevron.
  if (Platform.OS === 'android') {
    return displayedVehicles.map((vehicle) => {
      const isDetouring = routeIsDetouring(vehicle.routeId, activeDetourRouteIds);
      const isFocusedDetour = hasDetourFocus && focusedDetourRouteId === vehicle.routeId;
      const dimmed = hasDetourFocus
        ? !isFocusedDetour
        : isDetourView && !hasSelection
          ? !isDetouring
          : false;
      const markerColor = dimmed ? COLORS.grey400 : getRouteColor(vehicle.routeId);
      const snapPath = getVehicleSnapPath(vehicle);
      const routeLabel = String(getRouteLabel(vehicle) || vehicle.routeId || '?');

      return (
        <AndroidLiveBusMarker
          key={vehicle.id}
          vehicle={vehicle}
          markerColor={markerColor}
          dimmed={dimmed}
          routeLabel={routeLabel}
          routeDirectionLabel={getVehicleRouteDirectionLabel(vehicle, routeLabel)}
          snapPath={snapPath}
        />
      );
    });
  }

  return displayedVehicles.map((vehicle) => {
    const isDetouring = routeIsDetouring(vehicle.routeId, activeDetourRouteIds);
    const isFocusedDetour = hasDetourFocus && focusedDetourRouteId === vehicle.routeId;
    const dimmed = hasDetourFocus
      ? !isFocusedDetour
      : isDetourView && !hasSelection
        ? !isDetouring
        : false;
    const markerColor = dimmed ? COLORS.grey400 : getRouteColor(vehicle.routeId);

    return (
      <BusMarker
        key={vehicle.id}
        vehicle={vehicle}
        color={markerColor}
        routeLabel={getRouteLabel(vehicle)}
        routeDirectionLabel={getVehicleRouteDirectionLabel(vehicle, getRouteLabel(vehicle))}
        snapPath={getVehicleSnapPath(vehicle)}
        dimmed={dimmed}
      />
    );
  });
});

const HomeMapTripPreviewLayer = React.memo(({
  tripRouteCoordinates,
  tripEndpointMarkers,
  busApproachLines,
  intermediateStopMarkers,
  tripMarkers,
  boardingAlightingMarkers,
  isTripPreviewMode,
  tripVehicles,
  getRouteColor,
  getRouteLabel,
  getVehicleSnapPath,
}) => (
  <>
    {tripRouteCoordinates.map((tripRoute) => (
      <RoutePolyline
        key={tripRoute.id}
        id={`trip-${tripRoute.id}`}
        coordinates={tripRoute.coordinates}
        color={tripRoute.color}
        strokeWidth={tripRoute.isWalk ? 4 : tripRoute.isOnDemand ? 4 : 5}
        lineDashPattern={tripRoute.isWalk ? [2, 8] : tripRoute.isOnDemand ? [12, 6] : null}
        opacity={tripRoute.isWalk ? 0.9 : 1}
        outlineColor={tripRoute.isWalk ? tripRoute.color : undefined}
        routeLabel={tripRoute.routeLabel}
        layerIndex={MAP_LAYER_INDEX.TRIP_ROUTES}
      />
    ))}

    {tripEndpointMarkers.map((marker) => (
      <MapLibreGL.PointAnnotation
        key={marker.id}
        id={`trip-endpoint-${marker.id}`}
        coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
        anchor={{ x: 0.5, y: 0.5 }}
      >
        <View
          style={[
            styles.tripEndpointMarker,
            marker.type === 'originLocation'
              ? styles.tripEndpointMarkerOrigin
              : styles.tripEndpointMarkerDestination,
          ]}
        >
          <Icon
            name={marker.type === 'originLocation' ? 'User' : 'MapPin'}
            size={11}
            color={marker.type === 'originLocation' ? COLORS.success : COLORS.error}
          />
        </View>
      </MapLibreGL.PointAnnotation>
    ))}

    {busApproachLines.map((line) => (
      <RoutePolyline
        key={line.id}
        id={line.id}
        coordinates={line.coordinates}
        color={line.color}
        strokeWidth={3}
        lineDashPattern={[8, 6]}
        opacity={0.7}
        outlineColor={line.color}
        layerIndex={MAP_LAYER_INDEX.BUS_APPROACH_LINES}
      />
    ))}

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

    {tripMarkers.map((marker) => (
      <MapLibreGL.MarkerView
        key={marker.id}
        coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
      >
        <View style={styles.tripMarkerLabelContainer}>
          {marker.stopName && (
            <View style={[
              styles.tripMarkerLabel,
              marker.type === 'origin' ? styles.tripMarkerLabelOrigin : styles.tripMarkerLabelDest,
            ]}>
              <Text style={styles.tripMarkerLabelName} numberOfLines={1}>
                {marker.stopCode ? `#${marker.stopCode} - ` : ''}{marker.stopName}
              </Text>
              {marker.walkDistance != null && (
                <Text style={styles.tripMarkerLabelWalk}>
                  {marker.walkDistance >= 1000
                    ? `${(marker.walkDistance / 1000).toFixed(1)} km walk`
                    : `${marker.walkDistance} m walk`}
                  {marker.type === 'origin' ? ' from start' : ' to destination'}
                </Text>
              )}
            </View>
          )}
          {marker.stopName && (
            <View style={[
              styles.tripMarkerConnector,
              marker.type === 'origin' ? styles.tripMarkerConnectorOrigin : styles.tripMarkerConnectorDest,
            ]} />
          )}
          <View style={[
            styles.tripMarker,
            marker.type === 'origin' ? styles.tripMarkerOrigin : styles.tripMarkerDestination,
          ]}>
            <View style={[
              styles.tripMarkerInner,
              marker.type === 'origin' ? styles.tripMarkerInnerOrigin : styles.tripMarkerInnerDestination,
            ]} />
          </View>
        </View>
      </MapLibreGL.MarkerView>
    ))}

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
              {marker.type === 'boarding' ? 'Board' : 'Exit'} {marker.routeName ? `Route ${marker.routeName}` : ''}
            </Text>
            <Text style={styles.stopLabelName} numberOfLines={1}>
              #{marker.stopCode} - {marker.stopName}
            </Text>
          </View>
          <View style={[styles.stopLabelPointer, { borderTopColor: marker.routeColor }]} />
        </View>
      </MapLibreGL.PointAnnotation>
    ))}

    {isTripPreviewMode && tripVehicles.map((vehicle) => (
      <BusMarker
        key={vehicle.id}
        vehicle={vehicle}
        color={getRouteColor(vehicle.routeId)}
        routeLabel={getRouteLabel(vehicle)}
        snapPath={getVehicleSnapPath(vehicle)}
      />
    ))}
  </>
));

const HomeMapView = React.memo(({
  mapRef,
  cameraRef,
  cameraDefaultSettings,
  handleMapPress,
  handleRegionWillChange,
  handleRegionChange,
  isTripPreviewMode,
  displayedShapes,
  isRouteSelected,
  hasSelection,
  selectedRouteCount,
  currentZoom,
  activeDetourRouteIds,
  hasDetourFocus,
  focusedDetourRouteId,
  isDetourView,
  routeShortNameMap,
  detourOverlays,
  handleDetourOverlayPress,
  zoneOverlays,
  handleZonePress,
  displayedStopsLength,
  displayedStops,
  selectedStopId,
  stopsGeoJson,
  handleStopLayerPress,
  displayedVehicles,
  getRouteColor,
  getRouteLabel,
  getVehicleSnapPath,
  tripRouteCoordinates,
  tripEndpointMarkers,
  busApproachLines,
  intermediateStopMarkers,
  tripMarkers,
  boardingAlightingMarkers,
  tripVehicles,
  mapTapLocation,
}) => (
  <MapLibreGL.MapView
    ref={mapRef}
    style={styles.map}
    mapStyle={OSM_MAP_STYLE}
    rotateEnabled
    pitchEnabled={false}
    attributionPosition={{ bottom: 8, left: 8 }}
    logoEnabled={false}
    onPress={handleMapPress}
    onRegionWillChange={handleRegionWillChange}
    onRegionDidChange={handleRegionChange}
  >
    <MapLibreGL.Camera
      ref={cameraRef}
      defaultSettings={cameraDefaultSettings}
      followUserLocation={false}
      followUserMode={null}
    />
    <MapLibreGL.UserLocation visible={true} />

    <HomeMapRoutesLayer
      isTripPreviewMode={isTripPreviewMode}
      displayedShapes={displayedShapes}
      isRouteSelected={isRouteSelected}
      hasSelection={hasSelection}
      selectedRouteCount={selectedRouteCount}
      currentZoom={currentZoom}
      activeDetourRouteIds={activeDetourRouteIds}
      hasDetourFocus={hasDetourFocus}
      focusedDetourRouteId={focusedDetourRouteId}
      isDetourView={isDetourView}
      routeShortNameMap={routeShortNameMap}
      detourOverlays={detourOverlays}
      handleDetourOverlayPress={handleDetourOverlayPress}
      zoneOverlays={zoneOverlays}
      handleZonePress={handleZonePress}
    />

    <HomeMapStopsLayer
      isTripPreviewMode={isTripPreviewMode}
      displayedStopsLength={displayedStopsLength}
      stopsGeoJson={stopsGeoJson}
      handleStopLayerPress={handleStopLayerPress}
    />

    <HomeMapTopStopsOverlay
      isTripPreviewMode={isTripPreviewMode}
      visible={isDetourView || hasDetourFocus}
      displayedStops={displayedStops}
      selectedStopId={selectedStopId}
    />

    {!isTripPreviewMode && detourOverlays.map((overlay) => (
      <DetourOverlay
        key={`detour-stops-${overlay.routeId}`}
        {...overlay}
        renderMode="markers"
        onPress={() => handleDetourOverlayPress?.(overlay.routeId)}
      />
    ))}

    <HomeMapVehiclesLayer
      isTripPreviewMode={isTripPreviewMode}
      displayedVehicles={displayedVehicles}
      activeDetourRouteIds={activeDetourRouteIds}
      hasDetourFocus={hasDetourFocus}
      focusedDetourRouteId={focusedDetourRouteId}
      isDetourView={isDetourView}
      hasSelection={hasSelection}
      getRouteColor={getRouteColor}
      getRouteLabel={getRouteLabel}
      getVehicleSnapPath={getVehicleSnapPath}
    />

    <HomeMapTripPreviewLayer
      tripRouteCoordinates={tripRouteCoordinates}
      tripEndpointMarkers={tripEndpointMarkers}
      busApproachLines={busApproachLines}
      intermediateStopMarkers={intermediateStopMarkers}
      tripMarkers={tripMarkers}
      boardingAlightingMarkers={boardingAlightingMarkers}
      isTripPreviewMode={isTripPreviewMode}
      tripVehicles={tripVehicles}
      getRouteColor={getRouteColor}
      getRouteLabel={getRouteLabel}
      getVehicleSnapPath={getVehicleSnapPath}
    />

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

    {!isTripPreviewMode && detourOverlays.map((overlay) => (
      <DetourOverlay
        key={`detour-callouts-${overlay.routeId}`}
        {...overlay}
        renderMode="callouts"
        onPress={() => handleDetourOverlayPress?.(overlay.routeId)}
      />
    ))}
  </MapLibreGL.MapView>
), (prev, next) => (
  prev.cameraDefaultSettings === next.cameraDefaultSettings &&
  prev.handleMapPress === next.handleMapPress &&
  prev.handleRegionWillChange === next.handleRegionWillChange &&
  prev.handleRegionChange === next.handleRegionChange &&
  prev.isTripPreviewMode === next.isTripPreviewMode &&
  prev.displayedShapes === next.displayedShapes &&
  prev.isRouteSelected === next.isRouteSelected &&
  prev.hasSelection === next.hasSelection &&
  prev.selectedRouteCount === next.selectedRouteCount &&
  prev.currentZoom === next.currentZoom &&
  prev.activeDetourRouteIds === next.activeDetourRouteIds &&
  prev.hasDetourFocus === next.hasDetourFocus &&
  prev.focusedDetourRouteId === next.focusedDetourRouteId &&
  prev.isDetourView === next.isDetourView &&
  prev.routeShortNameMap === next.routeShortNameMap &&
  prev.detourOverlays === next.detourOverlays &&
  prev.handleDetourOverlayPress === next.handleDetourOverlayPress &&
  prev.zoneOverlays === next.zoneOverlays &&
  prev.handleZonePress === next.handleZonePress &&
  prev.displayedStopsLength === next.displayedStopsLength &&
  prev.displayedStops === next.displayedStops &&
  prev.selectedStopId === next.selectedStopId &&
  prev.stopsGeoJson === next.stopsGeoJson &&
  prev.handleStopLayerPress === next.handleStopLayerPress &&
  prev.displayedVehicles === next.displayedVehicles &&
  prev.getRouteColor === next.getRouteColor &&
  prev.getRouteLabel === next.getRouteLabel &&
  prev.getVehicleSnapPath === next.getVehicleSnapPath &&
  prev.tripRouteCoordinates === next.tripRouteCoordinates &&
  prev.tripEndpointMarkers === next.tripEndpointMarkers &&
  prev.busApproachLines === next.busApproachLines &&
  prev.intermediateStopMarkers === next.intermediateStopMarkers &&
  prev.tripMarkers === next.tripMarkers &&
  prev.boardingAlightingMarkers === next.boardingAlightingMarkers &&
  prev.tripVehicles === next.tripVehicles &&
  prev.mapTapLocation === next.mapTapLocation
));

const HomeScreen = ({ route }) => {
  const firstRenderStartedAtRef = useRef(getPerfNow());
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const pendingLocationCenterRef = useRef(0);
  const locationCenterReleaseTimerRef = useRef(null);
  const routeFilterSheetRef = useRef(null);
  const navigation = useNavigation();
  const { addTripToHistory } = useAuth();
  const {
    routes,
    stops,
    shapes,
    processedShapes,
    routeShapeMapping,
    routeStopsMapping,
    routeStopSequencesMapping,
    trips,
    tripMapping,
    isLoadingStatic,
    staticError,
    loadStaticData,
    isOffline,
    ensureRoutingData,
    diagnostics,
    loadProxyHealth,
  } = useTransitStatic();
  const {
    vehicles,
    detoursEnabled,
    isRouteDetouring,
    activeDetours,
    serviceAlerts,
    onDemandZones,
    transitNewsImpacts,
    getRouteDetour,
    loadVehiclePositions,
  } = useTransitRealtime();
  const loadingState = useMemo(
    () => getTransitLoadingState(diagnostics) || {
      title: 'Getting Barrie Transit ready',
      detail: 'Loading routes and stops.',
    },
    [diagnostics]
  );

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
    selectedRoutes, hasSelection, handleRouteSelect: rawHandleRouteSelect, isRouteSelected, selectRoute,
  } = useRouteSelection({ routeShapeMapping, shapes, mapRef: compatMapRef, multiSelect: true });
  const [selectedStop, setSelectedStop] = useState(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showStops, setShowStops] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [selectedZone, setSelectedZone] = useState(null);
  const [whereToText, setWhereToText] = useState('');
  const [mapRegion, setMapRegion] = useState(MAP_CONFIG.INITIAL_REGION);
  const mapRegionRef = useRef(MAP_CONFIG.INITIAL_REGION);
  const perfRef = useRef({
    lastRegionWarnTs: 0,
    lastRegionEventTs: 0,
    lastRegionStateUpdateTs: 0,
    pendingRegionTimer: null,
    longRegionHandlers: 0,
  });
  const suppressNextMapTapRef = useRef(false);
  const [detourSheetRouteId, setDetourSheetRouteId] = useState(null);
  const [focusedDetourRouteId, setFocusedDetourRouteId] = useState(null);
  const [mapViewMode, setMapViewMode] = useState('regular');
  const [secondaryChromeReady, setSecondaryChromeReady] = useState(false);
  const [mapReadyToMount, setMapReadyToMount] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMapReadyToMount(true);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => () => {
    const pendingRegionTimer = perfRef.current.pendingRegionTimer;
    if (pendingRegionTimer) {
      clearTimeout(pendingRegionTimer);
      perfRef.current.pendingRegionTimer = null;
    }
    if (locationCenterReleaseTimerRef.current) {
      clearTimeout(locationCenterReleaseTimerRef.current);
      locationCenterReleaseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const markReady = () => {
      if (!cancelled) {
        setSecondaryChromeReady(true);
      }
    };
    const task = InteractionManager?.runAfterInteractions
      ? InteractionManager.runAfterInteractions(markReady)
      : null;
    const fallbackTimer = task ? null : setTimeout(markReady, 0);

    return () => {
      cancelled = true;
      task?.cancel?.();
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (!PERF_DEBUG) return;
    const committedAt = getPerfNow();
    logger.info(
      '[perf][home-startup] first chrome committed in %dms',
      Math.round(committedAt - firstRenderStartedAtRef.current)
    );
  }, []);

  // Trip planning — shared hook (with native-specific delay enrichment)
  const trip = useTripPlanner({
    ensureRoutingData,
    applyDelays: applyDelaysToItineraries,
    onTripPlanned: addTripToHistory,
    onDemandZones,
    stops,
  });
  const {
    state: tripState,
    searchTrips,
    selectFromSuggestion,
    selectToSuggestion,
    swap: swapTripLocations,
    setFrom: setTripFrom,
    setTo: setTripTo,
    setFromText: setTripFromText,
    setToText: setTripToText,
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
    isTypingFrom,
    isTypingTo,
    fromSuggestions,
    toSuggestions,
    timeMode,
    selectedTime,
  } = tripState;

  const {
    tripRouteCoordinates, tripMarkers, tripEndpointMarkers, intermediateStopMarkers,
    boardingAlightingMarkers, tripVehicles, busApproachLines,
  } = useTripVisualization({ isTripPlanningMode, itineraries, selectedItineraryIndex, vehicles, shapes, tripMapping, tripFrom: tripFromLocation, tripTo: tripToLocation });
  const selectedItinerary = isTripPlanningMode
    ? itineraries[selectedItineraryIndex] ?? itineraries[0] ?? null
    : null;

  const isFocused = useIsFocused();
  const { fitMapToItinerary } = useTripPreviewViewport({
    isFocused,
    isTripPlanningMode,
    fitToCoordinates: (coordinates, options) => compatMapRef.current.fitToCoordinates(coordinates, options),
    edgePadding: { top: 300, right: 50, bottom: 350, left: 50 },
    animated: true,
  });

  // Pulse animation for live indicator
  const pulseAnim = useMapPulseAnimation();
  const { isExpanded: routePanelExpanded, toggle: toggleRoutePanel, collapse: collapseRoutePanel, autoCollapseOnSelect } = useRoutePanel({ defaultExpanded: false });

  // Wrap route select to auto-collapse panel on selection
  const handleRouteSelect = useCallback((routeId) => {
    rawHandleRouteSelect(routeId);
    if (routeId !== null && autoCollapseOnSelect) {
      collapseRoutePanel();
    }
  }, [rawHandleRouteSelect, autoCollapseOnSelect, collapseRoutePanel]);

  const routeShortNameMap = useMemo(() => {
    const map = new Map();
    routes.forEach((r) => { if (r?.id) map.set(r.id, r.shortName || r.id); });
    return map;
  }, [routes]);

  // StatusBadge computed props
  const selectedRouteNames = useMemo(() => {
    if (selectedRoutes.size === 0) return [];
    return [...selectedRoutes].map(id => {
      const route = routes.find(r => r.id === id);
      return route ? route.shortName : id;
    });
  }, [selectedRoutes, routes]);

  const activeVehicleCount = useMemo(() => {
    if (selectedRoutes.size === 0) return 0;
    return vehicles.filter(v => selectedRoutes.has(v.routeId)).length;
  }, [selectedRoutes, vehicles]);

  const activeDetourRouteIds = useMemo(() => {
    const routeIds = new Set();
    if (!detoursEnabled) return routeIds;

    Object.entries(activeDetours || {}).forEach(([routeId, detour]) => {
      if (detour?.state !== 'cleared') {
        routeIds.add(routeId);
      }
    });

    return routeIds;
  }, [activeDetours, detoursEnabled]);
  const shouldShowDetourStatusRow = !isTripPlanningMode && activeDetourRouteIds.size > 0;
  const canUseDetourView = detoursEnabled && activeDetourRouteIds.size > 0;
  const isDetourView = canUseDetourView && mapViewMode === 'detour';
  const hasDetourFocus = isDetourView && Boolean(focusedDetourRouteId) && activeDetourRouteIds.has(focusedDetourRouteId);

  useEffect(() => {
    if (!canUseDetourView && mapViewMode !== 'regular') {
      setMapViewMode('regular');
    }
  }, [canUseDetourView, mapViewMode]);

  useEffect(() => {
    if (focusedDetourRouteId && !activeDetourRouteIds.has(focusedDetourRouteId)) {
      setFocusedDetourRouteId(null);
    }
  }, [focusedDetourRouteId, activeDetourRouteIds]);

  const useCurrentLocationForTrip = useCallback((searchTo = null) => {
    useCurrentLocationHook(async () => {
      return getForegroundDeviceLocation(Location, {
        accuracy: Location.Accuracy.Balanced,
      });
    }, { searchTo });
  }, [useCurrentLocationHook]);

  // Map tap popup
  const {
    mapTapLocation, mapTapAddress, isLoadingAddress,
    handleMapPress: handleMapTapPress, handleDirectionsFrom, handleDirectionsTo, closeMapTapPopup,
    showLocation,
  } = useMapTapPopup({
    enterPlanningMode, setTripFrom, setTripTo,
    useCurrentLocationForTrip,
    onMapTap: () => setSelectedStop(null),
  });
  const handleCloseMapTapPopup = closeMapTapPopup;

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
    Math.log(360 / MAP_CONFIG.INITIAL_REGION.latitudeDelta) / Math.LN2
  );

  // Displayed entities (vehicles, shapes, stops, detours) based on selection
  const {
    getRouteColor, displayedVehicles, displayedShapes, displayedStops,
  } = useDisplayedEntities({
    selectedRouteIds: selectedRoutes,
    vehicles, routes, trips, shapes, processedShapes,
    routeShapeMapping, routeStopsMapping, stops,
    showRoutes, showStops, mapRegion,
    // Keep the all-routes shape set stable when switching Regular/Detours tabs.
    // Native MapLibre can briefly leave old route layers visible if the whole
    // route source set changes at the same time as detour layers mount.
    routeShapeDisplayMode: !hasSelection && !hasDetourFocus ? 'native_home' : 'default',
  });

  const routeColorByRouteId = useMemo(
    () => Object.fromEntries((routes || []).filter((route) => route?.id).map((route) => [route.id, getRouteColor(route.id)])),
    [routes, getRouteColor]
  );

  const routePathsByRouteId = useMemo(() => {
    const shapeSource = Object.keys(processedShapes || {}).length > 0 ? processedShapes : shapes;
    const map = new Map();

    Object.entries(routeShapeMapping || {}).forEach(([routeId, shapeIds]) => {
      const paths = (shapeIds || [])
        .map((shapeId) => shapeSource[shapeId] || shapes[shapeId])
        .filter((coords) => Array.isArray(coords) && coords.length >= 2);

      if (paths.length > 0) {
        map.set(routeId, paths);
      }
    });

    return map;
  }, [processedShapes, routeShapeMapping, shapes]);

  const getVehicleSnapPath = useCallback((vehicle) => {
    const candidatePaths = routePathsByRouteId.get(vehicle?.routeId);
    if (!candidatePaths || candidatePaths.length === 0) return null;
    if (candidatePaths.length === 1) return candidatePaths[0];

    const point = vehicle?.coordinate;
    if (!point) return candidatePaths[0];

    let bestPath = candidatePaths[0];
    let bestDistance = pointToPolylineDistance(point, bestPath);

    for (let i = 1; i < candidatePaths.length; i++) {
      const distance = pointToPolylineDistance(point, candidatePaths[i]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPath = candidatePaths[i];
      }
    }

    return bestPath;
  }, [routePathsByRouteId]);

  const detourStopDetailsByRouteId = useMemo(() => {
    if (!detoursEnabled) return {};

    return Object.fromEntries(
      Object.entries(activeDetours || {}).map(([routeId, detour]) => [
        routeId,
        deriveAffectedStopDetailsForDetour({
          routeId,
          segments: detour?.segments?.length
            ? detour.segments
            : [{
              shapeId: detour?.shapeId ?? null,
              entryPoint: detour?.entryPoint ?? null,
              exitPoint: detour?.exitPoint ?? null,
              skippedSegmentPolyline: detour?.skippedSegmentPolyline ?? null,
              inferredDetourPolyline: detour?.inferredDetourPolyline ?? null,
            }],
          stops,
          routeStopsMapping,
          routeStopSequencesMapping,
        }),
      ])
    );
  }, [activeDetours, detoursEnabled, routeStopSequencesMapping, routeStopsMapping, stops]);

  const { detourOverlays } = useDetourOverlays({
    selectedRouteIds: selectedRoutes,
    activeDetours,
    enabled: detoursEnabled,
    focusedRouteId: hasDetourFocus ? focusedDetourRouteId : null,
    detourStopDetailsByRouteId,
    routeColorByRouteId,
  });

  const handleDetourOverlayPress = useCallback((routeId) => {
    if (!routeId) return;
    setFocusedDetourRouteId(routeId);
    setDetourSheetRouteId(routeId);
    setMapViewMode('detour');
  }, []);

  const selectedDetour = detourSheetRouteId ? getRouteDetour(detourSheetRouteId) : null;
  const selectedDetourStopDetails = useMemo(() => deriveAffectedStopDetailsForDetour({
    routeId: detourSheetRouteId,
    segments: selectedDetour?.segments?.length
      ? selectedDetour.segments
      : [{
        shapeId: selectedDetour?.shapeId ?? null,
        entryPoint: selectedDetour?.entryPoint ?? null,
        exitPoint: selectedDetour?.exitPoint ?? null,
        skippedSegmentPolyline: selectedDetour?.skippedSegmentPolyline ?? null,
        inferredDetourPolyline: selectedDetour?.inferredDetourPolyline ?? null,
      }],
    stops,
    routeStopsMapping,
    routeStopSequencesMapping,
  }), [detourSheetRouteId, routeStopSequencesMapping, routeStopsMapping, selectedDetour?.segments, stops]);

  const { zoneOverlays } = useZoneOverlays({ onDemandZones, showZones });

  const activeStopClosureByStopId = useMemo(() => {
    const map = new Map();
    (transitNewsImpacts || [])
      .filter((impact) => (
        impact?.type === 'stop_closure' &&
        impact?.status === 'active' &&
        impact?.stopId
      ))
      .forEach((impact) => {
        map.set(String(impact.stopId), impact);
      });
    return map;
  }, [transitNewsImpacts]);

  const displayedStopsForMap = useMemo(() => (
    displayedStops.map((stop) => {
      const closureImpact = activeStopClosureByStopId.get(String(stop.id));
      return closureImpact ? { ...stop, closureImpact, isClosed: true } : stop;
    })
  ), [displayedStops, activeStopClosureByStopId]);

  const displayedStopsById = useMemo(() => {
    const map = new Map();
    displayedStopsForMap.forEach((stop) => {
      map.set(String(stop.id), stop);
    });
    return map;
  }, [displayedStopsForMap]);

  const stopsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: displayedStopsForMap.map((stop) => ({
      type: 'Feature',
      id: String(stop.id),
      geometry: {
        type: 'Point',
        coordinates: [stop.longitude, stop.latitude],
      },
      properties: {
        id: String(stop.id),
        isSelected: selectedStop?.id === stop.id ? 1 : 0,
        isClosed: stop.isClosed ? 1 : 0,
      },
    })),
  }), [displayedStopsForMap, selectedStop]);

  const handleStopLayerPress = useCallback((event) => {
    const stopFeature = event?.features?.[0];
    const stopId = stopFeature?.properties?.id;
    if (!stopId) return;
    const stop = displayedStopsById.get(String(stopId));
    if (stop) {
      suppressNextMapTapRef.current = true;
      setTimeout(() => {
        suppressNextMapTapRef.current = false;
      }, 0);
      setSelectedStop(stop);
    }
  }, [displayedStopsById]);

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

  useEffect(() => {
    if (!PERF_DEBUG) return;
    const nowTs = Date.now();
    const perf = perfRef.current;
    if (nowTs - perf.lastRegionWarnTs < 2000) return;

    if (displayedVehicles.length > PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_VEHICLES) {
      logger.warn(
        '[perf][home-map] Visible vehicles=%d (budget=%d)',
        displayedVehicles.length,
        PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_VEHICLES
      );
      perf.lastRegionWarnTs = nowTs;
      return;
    }

    if (displayedStops.length > PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_STOPS) {
      logger.warn(
        '[perf][home-map] Visible stops=%d (budget=%d)',
        displayedStops.length,
        PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_STOPS
      );
      perf.lastRegionWarnTs = nowTs;
      return;
    }

    if (displayedShapes.length > PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_SHAPES) {
      logger.warn(
        '[perf][home-map] Visible shapes=%d (budget=%d)',
        displayedShapes.length,
        PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_SHAPES
      );
      perf.lastRegionWarnTs = nowTs;
    }
  }, [displayedVehicles.length, displayedStops.length, displayedShapes.length]);

  const stopFollowingUserLocation = useCallback(() => {
    cameraRef.current?.setCamera({
      followUserLocation: false,
      followUserMode: null,
      animationDuration: 0,
    });
  }, []);

  const cancelPendingLocationCenter = useCallback(() => {
    pendingLocationCenterRef.current += 1;
    stopFollowingUserLocation();
  }, [stopFollowingUserLocation]);

  const handleRegionWillChange = useCallback((feature) => {
    if (feature?.properties?.isUserInteraction) {
      cancelPendingLocationCenter();
    }
  }, [cancelPendingLocationCenter]);

  // Handle map region change (MapLibre onRegionDidChange)
  const handleRegionChange = useCallback((feature) => {
    const handlerStart =
      typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
        ? global.performance.now()
        : Date.now();
    const perf = perfRef.current;
    const nowTs = Date.now();

    perf.lastRegionEventTs = nowTs;

    const properties = feature?.properties;
    const geometry = feature?.geometry;
    const coordinates = geometry?.coordinates;
    if (!properties || !Array.isArray(coordinates) || coordinates.length < 2) return;

    const [lng, lat] = coordinates;
    const zoom = Number(properties.zoomLevel);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return;

    // Reconstruct region-like object for existing code
    const latDelta = 360 / Math.pow(2, zoom);
    const nextRegion = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: latDelta,
      longitudeDelta: latDelta, // Approximate
    };

    mapRegionRef.current = nextRegion;

    const renderZoom = getRenderZoom(zoom);
    setCurrentZoom((prevZoom) => (prevZoom === renderZoom ? prevZoom : renderZoom));

    // Region state is only needed for viewport stop filtering.
    if (!showStops || selectedRoutes.size > 0) return;

    const applyRegionState = () => {
      perf.lastRegionStateUpdateTs = Date.now();
      perf.pendingRegionTimer = null;
      const latestRegion = mapRegionRef.current;
      setMapRegion((prevRegion) =>
        hasMeaningfulRegionChange(prevRegion, latestRegion) ? latestRegion : prevRegion
      );
    };

    const elapsedSinceRegionUpdate = nowTs - perf.lastRegionStateUpdateTs;
    if (elapsedSinceRegionUpdate >= MAP_REGION_STATE_THROTTLE_MS) {
      if (perf.pendingRegionTimer) {
        clearTimeout(perf.pendingRegionTimer);
        perf.pendingRegionTimer = null;
      }
      applyRegionState();
    } else if (!perf.pendingRegionTimer) {
      perf.pendingRegionTimer = setTimeout(
        applyRegionState,
        MAP_REGION_STATE_THROTTLE_MS - elapsedSinceRegionUpdate
      );
    }

    const handlerEnd =
      typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
        ? global.performance.now()
        : Date.now();
    const handlerMs = handlerEnd - handlerStart;
    if (PERF_DEBUG && handlerMs > PERFORMANCE_BUDGETS.MAP_REGION_HANDLER_MS && nowTs - perf.lastRegionWarnTs > 2000) {
      perf.longRegionHandlers += 1;
      logger.warn(
        '[perf][home-map] Slow region handler=%dms (budget=%dms) shapes=%d stops=%d vehicles=%d count=%d',
        Math.round(handlerMs),
        PERFORMANCE_BUDGETS.MAP_REGION_HANDLER_MS,
        displayedShapes.length,
        displayedStops.length,
        displayedVehicles.length,
        perf.longRegionHandlers
      );
      perf.lastRegionWarnTs = nowTs;
    }
  }, [showStops, selectedRoutes, displayedShapes.length, displayedStops.length, displayedVehicles.length]);

  useEffect(() => {
    if (!showStops || selectedRoutes.size > 0) return;
    const latestRegion = mapRegionRef.current;
    setMapRegion((prevRegion) =>
      hasMeaningfulRegionChange(prevRegion, latestRegion) ? latestRegion : prevRegion
    );
  }, [showStops, selectedRoutes]);

  // Handle map press — MapLibre event format
  const handleMapPress = useCallback((e) => {
    if (suppressNextMapTapRef.current) {
      suppressNextMapTapRef.current = false;
      return;
    }
    const [lng, lat] = e.geometry.coordinates;
    // Convert to react-native-maps compatible format for the hook
    handleMapTapPress({
      nativeEvent: {
        coordinate: { latitude: lat, longitude: lng },
      },
    });
  }, [handleMapTapPress]);

  // Trip planning functions (thin wrappers around useTripPlanner hook)
  const enterTripPlanningMode = () => {
    enterPlanningMode();
    setSelectedStop(null);
  };

  const exitTripPlanningMode = () => {
    resetTrip();
    setWhereToText('');
  };

  // Handle "Where to?" address selection — open trip planner with destination + current location
  const handleWhereToSelect = (address) => {
    const destination = { lat: address.lat, lon: address.lon };
    setWhereToText('');
    startTripToDestination({
      destination,
      label: address.shortName || address.displayName,
      beforeEnter: () => setSelectedStop(null),
      enterPlanningMode,
      setTripFrom,
      setTripTo,
      useCurrentLocationForTrip,
    });
  };

  const handleZonePress = (zoneId) => {
    const zone = onDemandZones?.[zoneId];
    if (zone) setSelectedZone(zone);
  };

  const handleZoneDirectionsToHub = (hubStop) => {
    startTripToDestination({
      destination: { lat: hubStop.latitude, lon: hubStop.longitude },
      label: hubStop.name || 'Hub Stop',
      beforeEnter: () => setSelectedZone(null),
      enterPlanningMode,
      setTripFrom,
      setTripTo,
      useCurrentLocationForTrip,
    });
  };

  // Handle "Trip from here" from stop bottom sheet
  const handleStopDirectionsFrom = (stopInfo) => {
    setSelectedStop(null);
    enterPlanningMode();
    setTripFrom({ lat: stopInfo.lat, lon: stopInfo.lon }, stopInfo.name || 'Selected stop');
  };

  // Handle "Trip to here" from stop bottom sheet
  const handleStopDirectionsTo = (stopInfo) => {
    selectStopTripDestination({
      stopInfo,
      isTripPlanningMode,
      tripFromLocation,
      setSelectedStop,
      enterPlanningMode,
      setTripFrom,
      setTripTo,
      useCurrentLocationForTrip,
    });
  };


  const centerOnUserLocationOnce = useCallback(async () => {
    const requestId = pendingLocationCenterRef.current + 1;
    pendingLocationCenterRef.current = requestId;

    try {
      const loc = await getForegroundDeviceLocation(Location, {
        accuracy: Location.Accuracy.Balanced,
      });
      if (requestId !== pendingLocationCenterRef.current) return;

      const latestRegion = mapRegionRef.current || MAP_CONFIG.INITIAL_REGION;
      const nextRegion = {
        latitude: loc.lat,
        longitude: loc.lon,
        latitudeDelta: latestRegion.latitudeDelta || MAP_CONFIG.INITIAL_REGION.latitudeDelta,
        longitudeDelta: latestRegion.longitudeDelta || MAP_CONFIG.INITIAL_REGION.longitudeDelta,
      };

      stopFollowingUserLocation();
      cameraRef.current?.setCamera({
        centerCoordinate: [nextRegion.longitude, nextRegion.latitude],
        zoomLevel: Math.log2(360 / nextRegion.latitudeDelta),
        followUserLocation: false,
        followUserMode: null,
        animationDuration: 500,
      });
      mapRegionRef.current = nextRegion;

      if (locationCenterReleaseTimerRef.current) {
        clearTimeout(locationCenterReleaseTimerRef.current);
      }
      locationCenterReleaseTimerRef.current = setTimeout(() => {
        if (requestId === pendingLocationCenterRef.current) {
          stopFollowingUserLocation();
        }
      }, 650);

      if (showStops && selectedRoutes.size === 0) {
        setMapRegion((prevRegion) =>
          hasMeaningfulRegionChange(prevRegion, nextRegion) ? nextRegion : prevRegion
        );
      }
    } catch (error) {
      logger.warn('Failed to center on user location', error);
    }
  }, [selectedRoutes.size, showStops, stopFollowingUserLocation]);

  const showTripOverview = useCallback(() => {
    if (!selectedItinerary) {
      return;
    }

    fitMapToItinerary(selectedItinerary);
  }, [fitMapToItinerary, selectedItinerary]);

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


  // Check if we're in trip preview mode (showing a selected trip on map)
  const isTripPreviewMode = isTripPlanningMode && Boolean(selectedItinerary);

  if (staticError && routes.length === 0) {
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

  return (
    <View style={styles.container}>
      {mapReadyToMount ? (
        <HomeMapView
          mapRef={mapRef}
          cameraRef={cameraRef}
          cameraDefaultSettings={cameraDefaultSettings}
          handleMapPress={handleMapPress}
          handleRegionWillChange={handleRegionWillChange}
          handleRegionChange={handleRegionChange}
          isTripPreviewMode={isTripPreviewMode}
          displayedShapes={displayedShapes}
          isRouteSelected={isRouteSelected}
          hasSelection={hasSelection}
          selectedRouteCount={selectedRoutes.size}
          currentZoom={currentZoom}
          activeDetourRouteIds={activeDetourRouteIds}
          hasDetourFocus={hasDetourFocus}
          focusedDetourRouteId={focusedDetourRouteId}
          isDetourView={isDetourView}
          routeShortNameMap={routeShortNameMap}
          detourOverlays={detourOverlays}
          handleDetourOverlayPress={handleDetourOverlayPress}
          zoneOverlays={zoneOverlays}
          handleZonePress={handleZonePress}
          displayedStopsLength={displayedStopsForMap.length}
          displayedStops={displayedStopsForMap}
          selectedStopId={selectedStop?.id ?? null}
          stopsGeoJson={stopsGeoJson}
          handleStopLayerPress={handleStopLayerPress}
          displayedVehicles={displayedVehicles}
          getRouteColor={getRouteColor}
          getRouteLabel={getRouteLabel}
          getVehicleSnapPath={getVehicleSnapPath}
          tripRouteCoordinates={tripRouteCoordinates}
          tripEndpointMarkers={tripEndpointMarkers}
          busApproachLines={busApproachLines}
          intermediateStopMarkers={intermediateStopMarkers}
          tripMarkers={tripMarkers}
          boardingAlightingMarkers={boardingAlightingMarkers}
          tripVehicles={tripVehicles}
          mapTapLocation={mapTapLocation}
        />
      ) : (
        <View style={styles.mapPlaceholder} />
      )}

      {!isTripPlanningMode && (
        <View
          pointerEvents="none"
          style={[
            styles.topChromeBackdrop,
            shouldShowDetourStatusRow
              ? styles.topChromeBackdropWithDetours
              : styles.topChromeBackdropCompact,
          ]}
        />
      )}

      {/* Inline loading indicator while transit data loads */}
      {isLoadingStatic && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <PulsingSpinner size={24} />
            <View style={styles.loadingCardContent}>
              <Text style={styles.loadingCardTitle}>{loadingState.title}</Text>
              {loadingState.detail ? (
                <Text style={styles.loadingCardDetail}>{loadingState.detail}</Text>
              ) : null}
              <View style={styles.loadingSkeletonRow}>
                <LoadingSkeleton width={120} height={12} style={{ marginRight: SPACING.sm }} />
                <LoadingSkeleton width={80} height={12} />
              </View>
              <LoadingSkeleton width={200} height={8} style={{ marginTop: SPACING.xs }} />
            </View>
          </View>
        </View>
      )}

      {/* Where to? Search Bar - hide in trip planning mode */}
      {!isTripPlanningMode && (
        <View style={styles.searchBar}>
          <AddressAutocomplete
            value={whereToText}
            onChangeText={setWhereToText}
            onSelect={handleWhereToSelect}
            placeholder="Where to?"
            icon={(
              <View style={styles.searchIconBadge}>
                <SearchIcon size={18} color={COLORS.primaryDark} />
              </View>
            )}
            style={styles.whereToAutocomplete}
            inputStyle={styles.whereToInput}
            rightIcon={
              <View style={styles.searchBarRight}>
                <SystemHealthChip diagnostics={diagnostics} />
                <StatusBadge
                  isOffline={isOffline}
                  vehicleCount={vehicles.length}
                  selectedRouteNames={selectedRouteNames}
                  activeVehicleCount={activeVehicleCount}
                  pulseAnim={pulseAnim}
                />
              </View>
            }
          />
          <SystemHealthBanner
            diagnostics={diagnostics}
            onRetryStatic={loadStaticData}
            onRetryRealtime={loadVehiclePositions}
            onRetryProxy={loadProxyHealth}
          />
        </View>
      )}

      {/* Post-trip survey nudge */}
      {!isTripPlanningMode && secondaryChromeReady && (
        <SurveyNudgeBanner
          onTakeSurvey={() => navigation.getParent()?.navigate('Profile', { screen: 'Survey', params: { trigger: 'post_trip' } })}
        />
      )}

      {/* Detour Banner */}
      {shouldShowDetourStatusRow && (
        <View style={styles.detourStatusRow}>
          <DetourAlertStrip
            activeDetours={activeDetours}
            onPress={(routeId) => {
              if (!routeId) {
                setMapViewMode('detour');
                return;
              }

              setFocusedDetourRouteId(routeId);
              setDetourSheetRouteId(routeId);
              setMapViewMode('detour');
            }}
            routes={routes}
            inline
          />
          <MapViewModeToggle
            visible={canUseDetourView}
            mode={mapViewMode}
            onChange={setMapViewMode}
            detourCount={activeDetourRouteIds.size}
            inline
          />
        </View>
      )}

      <DetourMapLegend
        visible={!isTripPlanningMode && !detourSheetRouteId && isDetourView && detourOverlays.length > 0 && !detourOverlays.some((overlay) => overlay.showCallouts)}
        openColor={detourOverlays.length === 1 ? detourOverlays[0].detourColor : COLORS.textPrimary}
        style={styles.detourLegend}
      />

      {/* Map Controls (Top Right) */}
      {!isTripPlanningMode && (
        <View style={styles.mapControls}>
          <TouchableOpacity
            style={styles.mapControlButton}
            onPress={centerOnUserLocationOnce}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Center on my location"
          >
            <CenterIcon size={18} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapControlButton, showStops && styles.mapControlButtonActive]}
            onPress={() => setShowStops(!showStops)}
            activeOpacity={0.7}
          >
            <Icon name="MapPin" size={18} color={showStops ? COLORS.primary : COLORS.textPrimary} fill={showStops ? COLORS.primary : 'none'} />
          </TouchableOpacity>
        </View>
      )}

      {isTripPreviewMode && (
        <TripViewportControls
          style={styles.tripViewportControls}
          onCenterOnUserLocation={centerOnUserLocationOnce}
          onShowTrip={showTripOverview}
        />
      )}

      {/* Route Filter Panel (Horizontal scroll row below search) */}
      {!isTripPlanningMode && (
        <HomeScreenControls
          routes={routes}
          selectedRoutes={selectedRoutes}
          onRouteSelect={handleRouteSelect}
          getRouteColor={getRouteColor}
          isRouteDetouring={isRouteDetouring}
          serviceAlerts={serviceAlerts}
          onAlertPress={() => navigation.navigate('Alerts')}
          showZones={showZones}
          onToggleZones={() => setShowZones(z => !z)}
          zoneCount={Object.keys(onDemandZones || {}).length}
          onOpenFilterSheet={() => routeFilterSheetRef.current?.expand()}
        />
      )}

      {/* Favorite Stop Quick View */}
      {!isTripPlanningMode && secondaryChromeReady && (
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
            onFromChange={setTripFromText}
            onToChange={setTripToText}
            onFromSelect={selectFromSuggestion}
            onToSelect={selectToSuggestion}
            onSwap={swapTripLocations}
            onClose={exitTripPlanningMode}
            onUseCurrentLocation={useCurrentLocationForTrip}
            isLoading={isTripLoading}
            isTypingFrom={isTypingFrom}
            isTypingTo={isTypingTo}
            fromSuggestions={fromSuggestions}
            toSuggestions={toSuggestions}
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
          {!selectedStop && (
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
          )}
        </>
      )}

      {/* Stop Bottom Sheet - available while choosing trip endpoints */}
      {selectedStop && !isTripPreviewMode && (
        <SheetErrorBoundary fallbackMessage="Stop details failed to load.">
          <StopBottomSheet
            stop={selectedStop}
            onClose={() => setSelectedStop(null)}
            onDirectionsFrom={handleStopDirectionsFrom}
            onDirectionsTo={handleStopDirectionsTo}
          />
        </SheetErrorBoundary>
      )}

      {/* Detour Details Sheet */}
      {detourSheetRouteId && selectedDetour && (
        <DetourDetailsSheet
          routeId={detourSheetRouteId}
          detour={selectedDetour}
          segmentStopDetails={selectedDetourStopDetails.segmentStopDetails}
          onClose={() => setDetourSheetRouteId(null)}
          onViewOnMap={() => {
            setFocusedDetourRouteId(detourSheetRouteId);
            setMapViewMode('detour');
            setDetourSheetRouteId(null);
          }}
        />
      )}

      {/* Route Filter Sheet - full grid view for route selection */}
      <RouteFilterSheet
        sheetRef={routeFilterSheetRef}
        routes={routes}
        selectedRoutes={selectedRoutes}
        onRouteSelect={handleRouteSelect}
        getRouteColor={getRouteColor}
        isRouteDetouring={isRouteDetouring}
      />

      {/* Map Tap Popup - for choosing directions from/to a tapped location */}
      <MapTapPopup
        visible={!!mapTapLocation}
        coordinate={mapTapLocation}
        address={mapTapAddress}
        isLoading={isLoadingAddress}
        onDirectionsFrom={handleDirectionsFrom}
        onDirectionsTo={handleDirectionsTo}
        onClose={handleCloseMapTapPopup}
      />

      {/* Zone Info Sheet */}
      {!isTripPlanningMode && selectedZone && (
        <ZoneInfoSheet
          zone={selectedZone}
          onClose={() => setSelectedZone(null)}
          onDirectionsToHub={handleZoneDirectionsToHub}
        />
      )}

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
  mapPlaceholder: {
    flex: 1,
    backgroundColor: COLORS.grey50,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 140,
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 10,
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.medium,
  },
  loadingCardContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  loadingCardTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  loadingCardDetail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  loadingSkeletonRow: {
    flexDirection: 'row',
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
    zIndex: 1000,
  },
  topChromeBackdrop: {
    position: 'absolute',
    top: SPACING.xs + STATUS_BAR_OFFSET,
    left: SPACING.xs,
    right: SPACING.xs,
    zIndex: 996,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    ...SHADOWS.medium,
  },
  topChromeBackdropCompact: {
    height: 118,
  },
  topChromeBackdropWithDetours: {
    height: 164,
  },
  whereToAutocomplete: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 22,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.14)',
    ...SHADOWS.large,
  },
  whereToInput: {
    backgroundColor: 'transparent',
    height: 54,
    fontSize: FONT_SIZES.lg,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.textPrimary,
    paddingLeft: 0,
  },
  searchIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySubtle,
  },
  searchBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'rgba(244, 248, 245, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.12)',
    gap: SPACING.xs,
  },
  detourStatusRow: {
    position: 'absolute',
    top: 122 + STATUS_BAR_OFFSET,
    left: SPACING.sm,
    right: SPACING.sm,
    zIndex: 997,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.sm,
  },
  detourLegend: {
    top: 174 + STATUS_BAR_OFFSET,
    right: SPACING.sm,
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
    gap: SPACING.xs,
    zIndex: 999,
    padding: 4,
    borderRadius: BORDER_RADIUS.xxl,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: COLORS.grey200,
    ...SHADOWS.medium,
  },
  mapControlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapControlButtonActive: {
    backgroundColor: COLORS.primarySubtle,
  },
  tripViewportControls: {
    position: 'absolute',
    top: 152 + STATUS_BAR_OFFSET,
    right: SPACING.sm,
    zIndex: 999,
  },
  androidBusMarkerFrame: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    overflow: 'visible',
  },
  androidBusMarker: {
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 4,
    zIndex: 1,
  },
  androidBusMarkerDimmed: {
    opacity: 0.42,
  },
  androidBusMarkerLabel: {
    color: COLORS.white,
    fontSize: 12,
    lineHeight: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  androidBusMarkerDirectionLabel: {
    color: COLORS.white,
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  topStopMarkerFrame: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    overflow: 'visible',
    zIndex: 60,
    elevation: 60,
  },
  topStopMarkerFrameSelected: {
    width: 30,
    height: 30,
  },
  topStopMarkerOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 4,
  },
  topStopMarkerOuterSelected: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderColor: COLORS.accent,
  },
  topStopMarkerOuterClosed: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.white,
  },
  topStopMarkerClosedText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
  },
  topStopMarkerInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.white,
  },
  topStopMarkerInnerSelected: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: COLORS.accent,
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
  tripMarkerLabelContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  tripMarkerLabel: {
    position: 'absolute',
    top: -10,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 10,
    minWidth: 126,
    maxWidth: 190,
    borderWidth: 1,
    ...SHADOWS.medium,
  },
  tripMarkerLabelOrigin: {
    left: 34,
    borderColor: 'rgba(76, 175, 80, 0.28)',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
  },
  tripMarkerLabelDest: {
    right: 34,
    borderColor: 'rgba(244, 67, 54, 0.28)',
    borderRightWidth: 4,
    borderRightColor: COLORS.error,
  },
  tripMarkerLabelName: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  tripMarkerLabelWalk: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 3,
    lineHeight: 13,
  },
  tripMarkerConnector: {
    position: 'absolute',
    top: 11,
    width: 14,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(38, 50, 56, 0.22)',
  },
  tripMarkerConnectorOrigin: {
    left: 24,
  },
  tripMarkerConnectorDest: {
    right: 24,
  },
  tripEndpointMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    ...SHADOWS.small,
  },
  tripEndpointMarkerOrigin: {
    borderColor: 'rgba(76, 175, 80, 0.38)',
  },
  tripEndpointMarkerDestination: {
    borderColor: 'rgba(244, 67, 54, 0.38)',
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
