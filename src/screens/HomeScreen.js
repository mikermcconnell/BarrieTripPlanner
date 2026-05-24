/**
 * Native-specific HomeScreen (iOS/Android)
 * Web platform uses HomeScreen.web.js instead
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Animated, Platform, InteractionManager, ActivityIndicator, Alert, Modal } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapLibreGL from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTransitStatic, useTransitRealtime } from '../context/TransitContext';
import { useAuth } from '../context/AuthContext';
import { ANIMATION, MAP_CONFIG, OSM_MAP_STYLE, PERFORMANCE_BUDGETS } from '../config/constants';
import {
  BUS_APPROACH_LINE_CAP,
  BUS_APPROACH_LINE_DASH_PATTERN,
  BUS_APPROACH_LINE_OUTLINE_COLOR,
  BUS_APPROACH_LINE_OUTLINE_WIDTH,
  BUS_APPROACH_LINE_OPACITY,
  BUS_APPROACH_LINE_STROKE_WIDTH,
  ROUTE_LINE_MUTED_COLOR,
  ROUTE_LINE_OUTLINE_COLOR,
  ROUTE_LINE_WIDTH_SCALE,
} from '../config/mapLineStyles';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, FONT_FAMILIES } from '../config/theme';
import { getPlatformMapForStop } from '../config/platformMaps';
import StopBottomSheet from '../components/StopBottomSheet';
import PlatformMapViewerModal from '../components/PlatformMapViewerModal';
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
import { projectPointToPolyline } from '../utils/geometryUtils';
import { buildVehicleSnapShapeCandidates, resolveVehicleSnapPath } from '../utils/vehicleSnapPath';
import { shouldKeepHiddenRouteShapeLayerMounted, shouldRenderRouteShape } from '../utils/detourFocusUtils';
import { routeIsDetouring } from '../utils/routeDetourMatching';
import { getDisplayedVehiclesForDetourView, isRouteInSameDetourFamily } from '../utils/detourVehicleFiltering';
import { getRouteShapeVisibleSegments } from '../utils/detourRouteMasking';
import {
  getDetourLabelDensity,
  getDetourGeometryOverlayProps,
  shouldShowDetourGeometryOverlay,
  shouldShowDetailedDetourOverlay,
} from '../utils/detourViewMode';
import logger from '../utils/logger';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { getDetourOverlayRouteIds, useDetourOverlays } from '../hooks/useDetourOverlays';
import { useZoneOverlays } from '../hooks/useZoneOverlays';
import ZoneOverlay from '../components/ZoneOverlay';
import ZoneInfoSheet from '../components/ZoneInfoSheet';

// Native map components
import BusMarker from '../components/BusMarker';
import BusDirectionArrow from '../components/BusDirectionArrow';
import RoutePolyline from '../components/RoutePolyline';
import RouteLineBadge from '../components/RouteLineBadge';
import BusHubOverlay from '../components/BusHubOverlay';
import DetourOverlay from '../components/DetourOverlay';
import ClosedStopMarker from '../components/ClosedStopMarker';
import PulsingSpinner from '../components/PulsingSpinner';

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
import HolidayServiceBanner from '../components/HolidayServiceBanner';
import HolidayServiceDetailsSheet from '../components/HolidayServiceDetailsSheet';
import MapViewModeToggle from '../components/MapViewModeToggle';
import DetourMapLegend from '../components/DetourMapLegend';
import UpcomingDetourStrip from '../components/UpcomingDetourStrip';
import { deriveAffectedStopDetailsForDetour } from '../hooks/useAffectedStops';
import { getSelectedDetourSegments, mergeFamilySegmentStopDetails } from '../utils/detourSheetSelection';
import StatusBadge from '../components/StatusBadge';
import SystemHealthBanner from '../components/SystemHealthBanner';
import SystemHealthChip from '../components/SystemHealthChip';
import StartupLoadingScreen from '../components/StartupLoadingScreen';
import useRoutePanel from '../hooks/useRoutePanel';
import { getTransitStartupProgress } from '../utils/systemHealthUI';
import { startTripToDestination } from '../features/trip-planning/startTripToDestination';
import { selectStopTripDestination } from '../features/trip-planning/selectStopTripDestination';
import { getForegroundDeviceLocation } from '../utils/currentLocation';
import { cancelLocationCenterRequest } from '../utils/locationCenterRequest';
import { shouldAutoFitTripPreview } from '../utils/tripPreviewAutoFit';
import { useAnimatedBusPosition } from '../hooks/useAnimatedBusPosition';
import { useAndroidBottomChromeLift, useSafeBottomInset } from '../utils/androidNavigationBar';
import { annotateItinerariesWithStopClosures } from '../utils/stopClosureTripWarnings';
import { buildDetourStopNotice } from '../utils/stopNoticeUtils';
import {
  annotateStopsWithClosures,
  deriveMappableStopClosureStops,
  mergeStopClosuresForDetourMap,
} from '../utils/stopClosureMapUtils';
import { getUpcomingDetourNotices } from '../utils/upcomingDetourNotices';
import { enrichDetoursWithDerivedStopCodes } from '../utils/detourStopCodeEnrichment';
import { getActiveDetourEventCount } from '../utils/detourEvents';
import { prepareItineraryForNavigation } from '../services/navigationRecalculationService';
import { trackEvent } from '../services/analyticsService';
import { getOneWayRouteArrowVisibility } from '../utils/oneWayRoutes';
import { shouldShowMainMapFloatingControls } from '../utils/homeChromeVisibility';
import { getHolidayServiceInfo, getUpcomingHolidayServiceInfo } from '../utils/holidayService';
import {
  buildSavedPlacePayload,
  buildSavedTripPayload,
  clusterSavedPlaceMapMarkers,
  getSavedLocationPoint,
  getSavedPlaceMapMarkers,
  getSavedPlaceTargetField,
  getSavedPlacePickerOptions,
  getRankedSavedPlaces,
  getRankedSavedTrips,
  getRecurringTripSuggestion,
} from '../utils/savedTransitUtils';


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
const LOCATION_CENTER_ERROR_MESSAGE = 'We could not get your location. Check that location services are on and that Barrie Transit has location permission.';

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

const getNativeRouteStrokeWidth = (currentZoom, state = 'base') => {
  const zoom = Number.isFinite(currentZoom) ? currentZoom : 13;
  const baseWidth = zoom >= 15
    ? 3.6
    : zoom >= 14.2
      ? 3.2
      : zoom >= 12.8
        ? 2.6
        : 2.2;

  if (state === 'primary') return (baseWidth + 1.7) * ROUTE_LINE_WIDTH_SCALE;
  if (state === 'selected') return (baseWidth + 1.4) * ROUTE_LINE_WIDTH_SCALE;
  if (state === 'muted') return Math.max(1.8, baseWidth - 0.7) * ROUTE_LINE_WIDTH_SCALE;

  return baseWidth * ROUTE_LINE_WIDTH_SCALE;
};

const getBaseRouteVisual = ({ shape, currentZoom }) => ({
  routeOpacity: 1,
  routeStrokeWidth:
    shape.visualType === 'shared_trunk'
      ? 2.2
      : getNativeRouteStrokeWidth(currentZoom),
  routeColor: shape.color,
  outlineWidth: shape.visualType === 'shared_trunk' ? 0 : currentZoom >= 14.2 ? 1.25 : 0.75,
  outlineColor: ROUTE_LINE_OUTLINE_COLOR,
  showRouteLabel: false,
  showArrows: getOneWayRouteArrowVisibility({
    routeId: shape.routeId,
    currentZoom,
    isSelected: false,
    hasSelection: false,
  }),
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
      routeOpacity: 1,
      routeStrokeWidth: isFocusedDetour
        ? getNativeRouteStrokeWidth(currentZoom, 'primary')
        : getNativeRouteStrokeWidth(currentZoom, 'muted'),
      routeColor: isFocusedDetour ? shape.color : ROUTE_LINE_MUTED_COLOR,
      outlineWidth: isFocusedDetour ? (currentZoom >= 14.2 ? 2.75 : 2) : 0,
      outlineColor: ROUTE_LINE_OUTLINE_COLOR,
      showRouteLabel: false,
      showArrows: false,
    };
  }

  if (isDetourView && !hasSelection) {
    return {
      routeOpacity: 1,
      routeStrokeWidth: isDetouring
        ? getNativeRouteStrokeWidth(currentZoom, 'selected')
        : getNativeRouteStrokeWidth(currentZoom, 'muted'),
      routeColor: isDetouring ? shape.color : ROUTE_LINE_MUTED_COLOR,
      outlineWidth: isDetouring ? (currentZoom >= 14.2 ? 2.25 : 1.5) : 0,
      outlineColor: ROUTE_LINE_OUTLINE_COLOR,
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
      routeOpacity: 1,
      routeStrokeWidth: isSelected
        ? getNativeRouteStrokeWidth(currentZoom, 'selected')
        : getNativeRouteStrokeWidth(currentZoom, 'muted'),
      routeColor: isSelected ? shape.color : ROUTE_LINE_MUTED_COLOR,
      outlineWidth: isSelected ? (currentZoom >= 14.2 ? 2.5 : 1.75) : 0,
      outlineColor: ROUTE_LINE_OUTLINE_COLOR,
      showRouteLabel,
      showArrows: getOneWayRouteArrowVisibility({
        routeId: shape.routeId,
        currentZoom,
        isSelected,
        hasSelection,
      }),
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
  selectedDetourSegmentIndex,
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

  const shouldRenderDetourMapOverlays = shouldShowDetourGeometryOverlay({ isDetourView, hasDetourFocus });
  const routeMaskingDetourOverlays = shouldRenderDetourMapOverlays ? detourOverlays : [];

  return (
    <>
      {displayedShapes.map((shape) => {
        const isSelected = isRouteSelected(shape.routeId);
        const isDetouring = routeIsDetouring(shape.routeId, activeDetourRouteIds);
        const isFocusedDetour = hasDetourFocus && isRouteInSameDetourFamily(focusedDetourRouteId, shape.routeId);
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

        const visibleRouteSegments = getRouteShapeVisibleSegments({
          shape,
          detourOverlays: routeMaskingDetourOverlays,
        });

        if (visibleRouteSegments.length === 0) {
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

        return (
          <React.Fragment key={shape.id}>
            {visibleRouteSegments.map((coordinates, segmentIndex) => {
              const segmentId = visibleRouteSegments.length === 1
                ? shape.id
                : `${shape.id}-visible-${segmentIndex}`;

              return (
                <RoutePolyline
                  key={segmentId}
                  id={`route-${segmentId}`}
                  coordinates={coordinates}
                  color={routeVisual.routeColor}
                  strokeWidth={routeVisual.routeStrokeWidth}
                  opacity={routeVisual.routeOpacity}
                  outlineWidth={routeVisual.outlineWidth}
                  outlineColor={routeVisual.outlineColor}
                  showArrows={routeVisual.showArrows}
                  routeLabel={null}
                  layerIndex={MAP_LAYER_INDEX.ROUTES}
                />
              );
            })}
          </React.Fragment>
        );
      })}
      {shouldRenderDetourMapOverlays && detourOverlays.map((overlay) => (
        <DetourOverlay
          key={`detour-${overlay.routeId}`}
          {...getDetourGeometryOverlayProps({ overlay, isDetourView, hasDetourFocus })}
          renderMode="geometry"
          currentZoom={currentZoom}
          labelDensity={getDetourLabelDensity({ isDetourView, hasDetourFocus })}
          selectedSegmentIndex={overlay.routeId === focusedDetourRouteId ? selectedDetourSegmentIndex : null}
          onPress={(segment, segmentIndex) => handleDetourOverlayPress?.(overlay.routeId, segment, segmentIndex, overlay)}
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

const HomeMapRouteLineLabelsLayer = React.memo(({ isTripPreviewMode, markers }) => {
  if (isTripPreviewMode || !Array.isArray(markers) || markers.length === 0) {
    return null;
  }

  return markers.map((marker) => (
    <MapLibreGL.MarkerView
      key={marker.id}
      id={marker.id}
      coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
      allowOverlap
      pointerEvents="none"
    >
      <RouteLineBadge
        label={marker.label}
        color={marker.color}
        bearing={marker.bearing}
        branches={marker.branches}
      />
    </MapLibreGL.MarkerView>
  ));
}, (prev, next) => (
  prev.isTripPreviewMode === next.isTripPreviewMode
  && prev.markers === next.markers
));

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
            ['==', ['get', 'isSelected'], 1],
            COLORS.accent,
            ['==', ['get', 'isClosed'], 1],
            COLORS.grey600,
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
  onStopPress,
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
        isClosed ? (
          <ClosedStopMarker
            key={`top-closed-stop-${stop.id ?? 'stop'}-${index}`}
            id={`top-closed-stop-${stop.id ?? 'stop'}-${index}`}
            stop={stop}
            isSelected={isSelected}
            onPress={onStopPress}
          />
        ) : (
          <MapLibreGL.MarkerView
            key={`top-stop-${stop.id ?? 'stop'}-${index}`}
            id={`top-stop-${stop.id ?? 'stop'}-${index}`}
            coordinate={[stop.longitude, stop.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
            pointerEvents="none"
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
                isSelected && styles.topStopMarkerOuterSelected,
              ]}>
                <View style={[
                  styles.topStopMarkerInner,
                  isSelected && styles.topStopMarkerInnerSelected,
                ]} />
              </View>
            </View>
          </MapLibreGL.MarkerView>
        )
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
  const { latitude, longitude } = vehicle?.coordinate || {};
  const bearing = getVehicleDirectionBearing(vehicle, snapPath);
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
      pointerEvents="none"
    >
      <View
        collapsable={false}
        pointerEvents="none"
        style={styles.androidBusMarkerFrame}
      >
        <BusDirectionArrow
          bearing={bearing}
          size={56}
          topOffset={1}
          arrowWidth={5}
          arrowHeight={10}
          color="#111111"
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

const SavedPlaceMapMarkerVisual = React.memo(({ marker }) => (
  <View
    pointerEvents="none"
    style={styles.savedPlaceMapMarkerWrap}
    accessibilityLabel={marker.isCluster ? marker.name : `Saved place ${marker.name}`}
  >
    <View style={styles.savedPlaceMapMarker}>
      {marker.isCluster ? (
        <Text style={styles.savedPlaceMapMarkerCount}>{marker.count}</Text>
      ) : (
        <Icon name={marker.icon || 'MapPin'} size={17} color={COLORS.primaryDark} />
      )}
    </View>
    <Text style={styles.savedPlaceMapMarkerLabel} numberOfLines={1}>
      {marker.name}
    </Text>
  </View>
));

const HomeMapVehiclesLayer = React.memo(({
  isTripPreviewMode,
  displayedVehicles,
  activeDetourRouteIds,
  hasDetourFocus,
  focusedDetourRouteId,
  selectedDetourSegmentIndex,
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
  // no per-vehicle route snap-path scan, just a plain badge plus a direction chevron.
  if (Platform.OS === 'android') {
    return displayedVehicles.map((vehicle) => {
      const isDetouring = routeIsDetouring(vehicle.routeId, activeDetourRouteIds);
      const isFocusedDetour = hasDetourFocus && isRouteInSameDetourFamily(focusedDetourRouteId, vehicle.routeId);
      const dimmed = hasDetourFocus
        ? !isFocusedDetour
        : isDetourView && !hasSelection
          ? !isDetouring
          : false;
      const markerColor = dimmed ? COLORS.grey400 : getRouteColor(vehicle.routeId);
      const routeLabel = String(getRouteLabel(vehicle) || vehicle.routeId || '?');

      return (
        <AndroidLiveBusMarker
          key={vehicle.id}
          vehicle={vehicle}
          markerColor={markerColor}
          dimmed={dimmed}
          routeLabel={routeLabel}
          routeDirectionLabel={getVehicleRouteDirectionLabel(vehicle, routeLabel)}
        />
      );
    });
  }

  return displayedVehicles.map((vehicle) => {
    const isDetouring = routeIsDetouring(vehicle.routeId, activeDetourRouteIds);
    const isFocusedDetour = hasDetourFocus && isRouteInSameDetourFamily(focusedDetourRouteId, vehicle.routeId);
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
  transferMarkers,
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
        lineDashPattern={tripRoute.isOnDemand ? [12, 6] : null}
        opacity={1}
        outlineColor={undefined}
        outlineWidth={undefined}
        routeLabel={null}
        layerIndex={MAP_LAYER_INDEX.TRIP_ROUTES}
      />
    ))}

    {tripRouteCoordinates
      .filter((tripRoute) => tripRoute.routeLabel && tripRoute.labelCoordinate)
      .map((tripRoute) => (
        <MapLibreGL.MarkerView
          key={`${tripRoute.id}-label`}
          coordinate={[tripRoute.labelCoordinate.longitude, tripRoute.labelCoordinate.latitude]}
          pointerEvents="none"
        >
          <View
            pointerEvents="none"
            style={[
              styles.tripRouteSquareLabel,
              { backgroundColor: tripRoute.color },
            ]}
          >
            <Text style={styles.tripRouteSquareLabelText}>
              {tripRoute.routeLabel}
            </Text>
          </View>
        </MapLibreGL.MarkerView>
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
        strokeWidth={BUS_APPROACH_LINE_STROKE_WIDTH}
        lineDashPattern={BUS_APPROACH_LINE_DASH_PATTERN}
        lineCap={BUS_APPROACH_LINE_CAP}
        opacity={BUS_APPROACH_LINE_OPACITY}
        outlineColor={BUS_APPROACH_LINE_OUTLINE_COLOR}
        outlineWidth={BUS_APPROACH_LINE_OUTLINE_WIDTH}
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
        pointerEvents="none"
      >
        <View style={styles.tripMarkerLabelContainer} pointerEvents="none">
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
      <MapLibreGL.MarkerView
        key={marker.id}
        id={`ba-${marker.id}`}
        coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
        anchor={{ x: 0.5, y: 0.5 }}
        pointerEvents="none"
      >
        <View style={styles.stopLabelContainer} collapsable={false} pointerEvents="none">
          <View
            style={[
              styles.stopLabelBubble,
              marker.type === 'boarding' ? styles.stopLabelBubbleBoarding : styles.stopLabelBubbleAlighting,
              { borderColor: marker.routeColor },
            ]}
          >
            <Text style={[styles.stopLabelType, { color: marker.routeColor }]}>
              {marker.type === 'boarding' ? 'Board' : 'Exit'} {marker.routeName ? `Route ${marker.routeName}` : ''}
            </Text>
            <Text style={styles.stopLabelName} numberOfLines={1}>
              #{marker.stopCode} - {marker.stopName}
            </Text>
          </View>
        </View>
      </MapLibreGL.MarkerView>
    ))}

    {transferMarkers.map((marker) => (
      <MapLibreGL.MarkerView
        key={marker.id}
        id={`transfer-${marker.id}`}
        coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
        anchor={{ x: 0.5, y: 1 }}
      >
        <View style={styles.transferMarkerContainer} collapsable={false}>
          <View style={styles.transferLabelBubble}>
            <Text style={styles.transferLabelType}>Transfer</Text>
            <Text style={styles.transferLabelName} numberOfLines={1}>
              {marker.fromStopName}
            </Text>
          </View>
          <View style={styles.transferLabelPointer} />
          <View style={styles.transferDiamond} />
        </View>
      </MapLibreGL.MarkerView>
    ))}

    {isTripPreviewMode && tripVehicles.map((vehicle) => {
      const routeLabel = String(getRouteLabel(vehicle) || vehicle.routeId || '?');
      const snapPath = getVehicleSnapPath(vehicle);

      if (Platform.OS === 'android') {
        return (
          <AndroidLiveBusMarker
            key={vehicle.id}
            vehicle={vehicle}
            markerColor={getRouteColor(vehicle.routeId)}
            dimmed={false}
            routeLabel={routeLabel}
            routeDirectionLabel={getVehicleRouteDirectionLabel(vehicle, routeLabel)}
            snapPath={snapPath}
          />
        );
      }

      return (
        <BusMarker
          key={vehicle.id}
          vehicle={vehicle}
          color={getRouteColor(vehicle.routeId)}
          routeLabel={routeLabel}
          routeDirectionLabel={getVehicleRouteDirectionLabel(vehicle, routeLabel)}
          snapPath={snapPath}
        />
      );
    })}
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
  selectedDetourSegmentIndex,
  isDetourView,
  routeShortNameMap,
  routeLineLabelMarkers,
  detourOverlays,
  handleDetourOverlayPress,
  handleDetourStopPress,
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
  transferMarkers,
  tripVehicles,
  mapTapLocation,
  savedPlaceMapMarkers,
  handleSelectSavedPlace,
  showUserLocation,
  centeredUserLocation,
}) => (
  <MapLibreGL.MapView
    ref={mapRef}
    style={styles.map}
    mapStyle={OSM_MAP_STYLE}
    rotateEnabled
    compassEnabled={false}
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
    <MapLibreGL.UserLocation visible={showUserLocation} />

    {!isTripPreviewMode && savedPlaceMapMarkers.map((marker) => (
      marker.isCluster ? (
        <MapLibreGL.MarkerView
          key={marker.id}
          id={marker.id}
          coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
          anchor={{ x: 0.5, y: 1 }}
          pointerEvents="none"
        >
          <SavedPlaceMapMarkerVisual marker={marker} />
        </MapLibreGL.MarkerView>
      ) : (
        <MapLibreGL.PointAnnotation
          key={marker.id}
          id={marker.id}
          coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
          anchor={{ x: 0.5, y: 1 }}
          onSelected={() => handleSelectSavedPlace?.(marker.rawPlace)}
        >
          <SavedPlaceMapMarkerVisual marker={marker} />
        </MapLibreGL.PointAnnotation>
      )
    ))}

    {showUserLocation && centeredUserLocation && (
      <MapLibreGL.MarkerView
        id="home-current-location-marker"
        coordinate={[centeredUserLocation.longitude, centeredUserLocation.latitude]}
        anchor={{ x: 0.5, y: 0.5 }}
        pointerEvents="none"
      >
        <View collapsable={false} pointerEvents="none" style={styles.currentLocationMarkerHalo}>
          <View style={styles.currentLocationMarker}>
            <View style={styles.currentLocationMarkerCore} />
          </View>
        </View>
      </MapLibreGL.MarkerView>
    )}

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
      selectedDetourSegmentIndex={selectedDetourSegmentIndex}
      isDetourView={isDetourView}
      routeShortNameMap={routeShortNameMap}
      detourOverlays={detourOverlays}
      handleDetourOverlayPress={handleDetourOverlayPress}
      zoneOverlays={zoneOverlays}
      handleZonePress={handleZonePress}
    />

    <HomeMapRouteLineLabelsLayer
      isTripPreviewMode={isTripPreviewMode}
      markers={routeLineLabelMarkers}
    />

    <HomeMapStopsLayer
      isTripPreviewMode={isTripPreviewMode}
      displayedStopsLength={displayedStopsLength}
      stopsGeoJson={stopsGeoJson}
      handleStopLayerPress={handleStopLayerPress}
    />

    <BusHubOverlay currentZoom={currentZoom} />

    <HomeMapTopStopsOverlay
      isTripPreviewMode={isTripPreviewMode}
      visible={isDetourView || hasDetourFocus}
      displayedStops={displayedStops}
      selectedStopId={selectedStopId}
      onStopPress={handleDetourStopPress}
    />

    {!isTripPreviewMode && shouldShowDetailedDetourOverlay({ isDetourView, hasDetourFocus }) && detourOverlays.map((overlay) => (
      <DetourOverlay
        key={`detour-stops-${overlay.routeId}`}
        {...overlay}
        renderMode="markers"
        currentZoom={currentZoom}
        labelDensity={getDetourLabelDensity({ isDetourView, hasDetourFocus })}
        selectedSegmentIndex={overlay.routeId === focusedDetourRouteId ? selectedDetourSegmentIndex : null}
        onPress={(segment, segmentIndex) => handleDetourOverlayPress?.(overlay.routeId, segment, segmentIndex, overlay)}
        onStopPress={handleDetourStopPress}
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
      transferMarkers={transferMarkers}
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

    {!isTripPreviewMode && shouldShowDetailedDetourOverlay({ isDetourView, hasDetourFocus }) && detourOverlays.map((overlay) => (
      <DetourOverlay
        key={`detour-callouts-${overlay.routeId}`}
        {...overlay}
        renderMode="callouts"
        currentZoom={currentZoom}
        labelDensity={getDetourLabelDensity({ isDetourView, hasDetourFocus })}
        selectedSegmentIndex={overlay.routeId === focusedDetourRouteId ? selectedDetourSegmentIndex : null}
        onPress={(segment, segmentIndex) => handleDetourOverlayPress?.(overlay.routeId, segment, segmentIndex, overlay)}
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
  prev.selectedDetourSegmentIndex === next.selectedDetourSegmentIndex &&
  prev.isDetourView === next.isDetourView &&
  prev.routeShortNameMap === next.routeShortNameMap &&
  prev.routeLineLabelMarkers === next.routeLineLabelMarkers &&
  prev.detourOverlays === next.detourOverlays &&
  prev.handleDetourOverlayPress === next.handleDetourOverlayPress &&
  prev.handleDetourStopPress === next.handleDetourStopPress &&
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
  prev.transferMarkers === next.transferMarkers &&
  prev.tripVehicles === next.tripVehicles &&
  prev.mapTapLocation === next.mapTapLocation &&
  prev.savedPlaceMapMarkers === next.savedPlaceMapMarkers &&
  prev.handleSelectSavedPlace === next.handleSelectSavedPlace &&
  prev.showUserLocation === next.showUserLocation &&
  prev.centeredUserLocation === next.centeredUserLocation
));

const HomeScreen = ({ route }) => {
  const firstRenderStartedAtRef = useRef(getPerfNow());
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const pendingLocationCenterRef = useRef(0);
  const locationCenterReleaseTimerRef = useRef(null);
  const tripPreviewUserMovedMapRef = useRef(false);
  const routeFilterSheetRef = useRef(null);
  const [isRouteFilterSheetOpen, setIsRouteFilterSheetOpen] = useState(false);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const bottomSafeArea = useSafeBottomInset(insets.bottom);
  const bottomChromeLift = useAndroidBottomChromeLift();
  const floatingBottomOffset = Platform.OS === 'android' ? bottomChromeLift : bottomSafeArea;
  const {
    addTripToHistory,
    savedPlaces,
    savedTrips,
    addSavedPlace,
    addSavedTrip,
    touchSavedPlace,
    touchSavedTrip,
    isAuthenticated,
  } = useAuth();
  const {
    routes,
    stops,
    shapes,
    processedShapes,
    routeShapeMapping,
    routeStopsMapping,
    routeStopSequencesMapping,
    trips,
    calendar,
    calendarDates,
    tripMapping,
    routingData,
    isLoadingStatic,
    isRefreshingStatic,
    staticError,
    loadStaticData,
    isOffline,
    usingCachedData,
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
    transitNews,
    transitNewsImpacts,
    getRouteDetour,
    isLoadingVehicles,
    loadVehiclePositions,
  } = useTransitRealtime();
  const startupProgress = useMemo(
    () => getTransitStartupProgress({
      isLoadingStatic,
      isRefreshingStatic,
      usingCachedData,
      isLoadingVehicles,
      routesCount: routes.length,
      stopsCount: stops.length,
      vehiclesCount: vehicles.length,
      diagnostics,
    }),
    [
      diagnostics,
      isLoadingStatic,
      isRefreshingStatic,
      isLoadingVehicles,
      routes.length,
      stops.length,
      usingCachedData,
      vehicles.length,
    ]
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
  const [activePlatformMap, setActivePlatformMap] = useState(null);
  const [isCenteringOnUserLocation, setIsCenteringOnUserLocation] = useState(false);
  const [centeredUserLocation, setCenteredUserLocation] = useState(null);
  const selectedStopPlatformMap = useMemo(
    () => getPlatformMapForStop(selectedStop),
    [selectedStop]
  );
  const handleOpenPlatformMap = useCallback((platformMap) => {
    setActivePlatformMap(platformMap);
    trackEvent('platform_map_opened', {
      hub_id: platformMap.id,
      hub_name: platformMap.displayName,
      page_number: platformMap.pageNumber,
    });
  }, []);
  const handleClosePlatformMap = useCallback(() => {
    setActivePlatformMap(null);
  }, []);
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
  const [detourSheetSegmentIndex, setDetourSheetSegmentIndex] = useState(null);
  const [detourSheetEvent, setDetourSheetEvent] = useState(null);
  const [detourSheetSegmentStopDetailsOverride, setDetourSheetSegmentStopDetailsOverride] = useState(null);
  const [focusedDetourRouteId, setFocusedDetourRouteId] = useState(null);
  const [mapViewMode, setMapViewMode] = useState('regular');
  const [detourLegendAutoCollapseSignal, setDetourLegendAutoCollapseSignal] = useState(0);
  const [upcomingDetoursCollapsed, setUpcomingDetoursCollapsed] = useState(false);
  const [detourModeToggleWidth, setDetourModeToggleWidth] = useState(164);
  const [secondaryChromeReady, setSecondaryChromeReady] = useState(false);
  const [mapReadyToMount, setMapReadyToMount] = useState(false);
  const [savedPlacePicker, setSavedPlacePicker] = useState(null);
  const [holidayDetailsVisible, setHolidayDetailsVisible] = useState(false);
  const [holidayDetailsDate, setHolidayDetailsDate] = useState(null);
  const [isLoadingHolidayDetails, setIsLoadingHolidayDetails] = useState(false);
  const savedPlacePickerOptions = useMemo(() => getSavedPlacePickerOptions(), []);
  const rankedSavedPlaces = useMemo(() => getRankedSavedPlaces(savedPlaces), [savedPlaces]);
  const rankedSavedTrips = useMemo(() => getRankedSavedTrips(savedTrips), [savedTrips]);
  const savedPlaceMapMarkers = useMemo(
    () => clusterSavedPlaceMapMarkers(getSavedPlaceMapMarkers(rankedSavedPlaces)),
    [rankedSavedPlaces]
  );
  const tripPreviewFitKeyRef = useRef(null);

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

  const tripDelayOptions = useMemo(() => ({ vehicles }), [vehicles]);

  // Trip planning — shared hook (with native-specific delay enrichment)
  const trip = useTripPlanner({
    ensureRoutingData,
    applyDelays: applyDelaysToItineraries,
    delayOptions: tripDelayOptions,
    onTripPlanned: addTripToHistory,
    onDemandZones,
    stops,
    activeDetours: detoursEnabled ? activeDetours : {},
    detourStopDetailsByRouteId,
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
    fromUsesCurrentLocation: tripFromUsesCurrentLocation,
    isLocatingFrom,
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

  const tripPlannerDate = useMemo(
    () => (timeMode === 'now' ? new Date() : (selectedTime || new Date())),
    [selectedTime, timeMode]
  );

  const tripHolidayServiceInfo = useMemo(() => getHolidayServiceInfo({
    date: tripPlannerDate,
    calendar,
    calendarDates,
    trips,
    routes,
  }), [calendar, calendarDates, routes, tripPlannerDate, trips]);

  const homeHolidayServiceInfo = useMemo(() => getUpcomingHolidayServiceInfo({
    calendar,
    calendarDates,
    trips,
    routes,
    daysAhead: 1,
  }), [calendar, calendarDates, routes, trips]);

  const selectedHolidayDetailsInfo = useMemo(() => getHolidayServiceInfo({
    date: holidayDetailsDate || homeHolidayServiceInfo?.date || tripPlannerDate,
    calendar,
    calendarDates,
    trips,
    routes,
    stopTimes: routingData?.stopTimes || [],
  }), [
    calendar,
    calendarDates,
    holidayDetailsDate,
    homeHolidayServiceInfo,
    routes,
    routingData,
    tripPlannerDate,
    trips,
  ]);

  const openHolidayDetails = useCallback((date = null) => {
    setHolidayDetailsDate(date || homeHolidayServiceInfo?.date || tripPlannerDate);
    setHolidayDetailsVisible(true);

    if (!routingData?.stopTimes?.length && ensureRoutingData) {
      setIsLoadingHolidayDetails(true);
      Promise.resolve(ensureRoutingData())
        .catch((error) => logger.warn('Could not load holiday service trip details', { message: error?.message || String(error) }))
        .finally(() => setIsLoadingHolidayDetails(false));
    }
  }, [ensureRoutingData, homeHolidayServiceInfo, routingData, tripPlannerDate]);

  const showMainMapFloatingControls = shouldShowMainMapFloatingControls({
    isTripPlanningMode,
    isRouteFilterSheetOpen,
    startupVariant: startupProgress?.variant,
  });

  const {
    tripRouteCoordinates, tripMarkers, tripEndpointMarkers, intermediateStopMarkers,
    boardingAlightingMarkers, transferMarkers, tripVehicles, busApproachLines,
  } = useTripVisualization({
    isTripPlanningMode,
    itineraries,
    selectedItineraryIndex,
    vehicles,
    shapes,
    routeShapeMapping,
    tripMapping,
    tripFrom: tripFromLocation,
    tripTo: tripToLocation,
  });
  const busApproachViewportCoordinates = useMemo(() => (
    busApproachLines.flatMap((line) => (Array.isArray(line?.coordinates) ? line.coordinates : []))
  ), [busApproachLines]);

  const itinerariesWithStopClosureNotices = useMemo(
    () => annotateItinerariesWithStopClosures(itineraries, transitNewsImpacts),
    [itineraries, transitNewsImpacts]
  );
  const selectedItinerary = isTripPlanningMode
    ? itinerariesWithStopClosureNotices[selectedItineraryIndex] ?? itinerariesWithStopClosureNotices[0] ?? null
    : null;
  const isTripPreviewMode = isTripPlanningMode && Boolean(selectedItinerary);
  const shouldCompactTripSearchHeader =
    hasTripSearched && !isTripLoading && itinerariesWithStopClosureNotices.length > 0;

  const isFocused = useIsFocused();
  const { fitMapToItinerary } = useTripPreviewViewport({
    isFocused,
    isTripPlanningMode,
    fitToCoordinates: (coordinates, options) => compatMapRef.current.fitToCoordinates(coordinates, options),
    edgePadding: { top: shouldCompactTripSearchHeader ? 140 : 300, right: 50, bottom: 350, left: 50 },
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
  const upcomingDetourNotices = useMemo(
    () => (detoursEnabled ? getUpcomingDetourNotices(transitNews) : []),
    [detoursEnabled, transitNews]
  );
  const canUseDetourView = detoursEnabled && (activeDetourRouteIds.size > 0 || upcomingDetourNotices.length > 0);
  const isDetourView = canUseDetourView && mapViewMode === 'detour';
  const hasDetourFocus = isDetourView && Boolean(focusedDetourRouteId) && activeDetourRouteIds.has(focusedDetourRouteId);

  const handleMapViewModeChange = useCallback((nextMode) => {
    setMapViewMode(nextMode);

    if (nextMode === 'detour') {
      setShowStops(false);
      setDetourLegendAutoCollapseSignal((signal) => signal + 1);
    }
  }, []);

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
    return useCurrentLocationHook(async () => {
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
  const repeatTripSuggestion = useMemo(
    () => getRecurringTripSuggestion({ recentTrips, savedTrips: rankedSavedTrips }),
    [recentTrips, rankedSavedTrips]
  );

  const handleSelectRecentTrip = (trip) => {
    setTripFrom(trip.from, trip.fromText);
    setTripTo(trip.to, trip.toText);
    searchTrips(trip.from, trip.to);
  };

  const handleSelectSavedPlace = useCallback((place) => {
    const point = getSavedLocationPoint(place);
    if (!point) {
      Alert.alert('Saved place needs an address', 'Please delete and recreate this saved place.');
      return;
    }

    const label = place.name || place.addressText || 'Saved place';
    touchSavedPlace?.(place.id);

    if (getSavedPlaceTargetField({ from: tripFromLocation, to: tripToLocation }) === 'to') {
      setTripTo(point, label);
      return;
    }

    setTripFrom(point, label);
  }, [touchSavedPlace, tripFromLocation, tripToLocation, setTripFrom, setTripTo]);

  const handleSelectSavedTrip = useCallback((savedTrip) => {
    const fromPoint = getSavedLocationPoint(savedTrip?.from);
    const toPoint = getSavedLocationPoint(savedTrip?.to);
    if (!fromPoint || !toPoint) {
      Alert.alert('Saved trip needs addresses', 'Please delete and recreate this saved trip.');
      return;
    }

    enterPlanningMode();
    touchSavedTrip?.(savedTrip.id);
    setTripFrom(fromPoint, savedTrip.from?.name || savedTrip.from?.addressText || 'Start', { suppressAutoSearch: true });
    setTripTo(toPoint, savedTrip.to?.name || savedTrip.to?.addressText || 'Destination', { suppressAutoSearch: true });
    searchTrips(fromPoint, toPoint);
  }, [enterPlanningMode, touchSavedTrip, setTripFrom, setTripTo, searchTrips]);

  const handleSaveCurrentTrip = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign in to save trips', 'Create or sign in to your account to save trips across devices.');
      return;
    }
    const payload = buildSavedTripPayload({
      from: { ...tripFromLocation, name: tripFromText || 'Start' },
      to: { ...tripToLocation, name: tripToText || 'Destination' },
      itinerary: itineraries?.[selectedItineraryIndex] || itineraries?.[0] || null,
    });
    if (!payload) {
      Alert.alert('Trip not ready', 'Choose a valid origin and destination before saving this trip.');
      return;
    }
    const result = await addSavedTrip(payload);
    Alert.alert(result?.success ? 'Trip saved' : 'Could not save trip', result?.success ? `${payload.name} is now in My Transit.` : (result?.error || 'Please try again.'));
  }, [isAuthenticated, tripFromLocation, tripFromText, tripToLocation, tripToText, itineraries, selectedItineraryIndex, addSavedTrip]);

  const handleSavePlace = useCallback(async (location, text, label = 'Saved place', labelType = 'custom') => {
    if (!isAuthenticated) {
      Alert.alert('Sign in to save places', 'Create or sign in to your account to save places across devices.');
      return;
    }
    const payload = buildSavedPlacePayload({
      labelType,
      name: text || label,
      location: { ...location, name: text || label },
    });
    if (!payload) {
      Alert.alert('Place not ready', 'Choose a valid location before saving it.');
      return;
    }
    const result = await addSavedPlace(payload);
    Alert.alert(result?.success ? 'Place saved' : 'Could not save place', result?.success ? `${payload.name} is now in My Transit.` : (result?.error || 'Please try again.'));
  }, [addSavedPlace, isAuthenticated]);

  const chooseSavedPlaceLabel = useCallback((location, text, fallbackLabel) => {
    setSavedPlacePicker({ location, text, fallbackLabel });
  }, []);

  const closeSavedPlacePicker = useCallback(() => {
    setSavedPlacePicker(null);
  }, []);

  const handleChooseSavedPlaceOption = useCallback((labelType) => {
    const pendingPlace = savedPlacePicker;
    if (!pendingPlace) return;

    closeSavedPlacePicker();
    handleSavePlace(
      pendingPlace.location,
      pendingPlace.text,
      pendingPlace.fallbackLabel,
      labelType
    );
  }, [closeSavedPlacePicker, handleSavePlace, savedPlacePicker]);

  useEffect(() => {
    const tripToPlan = route?.params?.savedTripToPlan;
    if (!tripToPlan) return;
    handleSelectSavedTrip(tripToPlan);
    navigation.setParams({ savedTripToPlan: undefined });
  }, [route?.params?.savedTripToPlan, handleSelectSavedTrip, navigation]);

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

  const mapDisplayedVehicles = useMemo(() => getDisplayedVehiclesForDetourView({
    displayedVehicles,
    vehicles,
    selectedRouteIds: selectedRoutes,
    activeDetours: detoursEnabled ? activeDetours : {},
    focusedDetourRouteId: hasDetourFocus ? focusedDetourRouteId : null,
    isDetourView,
  }), [
    activeDetours,
    detoursEnabled,
    displayedVehicles,
    focusedDetourRouteId,
    hasDetourFocus,
    isDetourView,
    selectedRoutes,
    vehicles,
  ]);

  const routeColorByRouteId = useMemo(
    () => Object.fromEntries((routes || []).filter((route) => route?.id).map((route) => [route.id, getRouteColor(route.id)])),
    [routes, getRouteColor]
  );

  const vehicleSnapShapeCandidates = useMemo(
    () => buildVehicleSnapShapeCandidates({ routeShapeMapping, processedShapes, shapes }),
    [processedShapes, routeShapeMapping, shapes]
  );

  const getVehicleSnapPath = useCallback(
    (vehicle) => resolveVehicleSnapPath(
      vehicle,
      displayedShapes,
      tripMapping,
      vehicleSnapShapeCandidates
    ),
    [displayedShapes, tripMapping, vehicleSnapShapeCandidates]
  );

  const { detourOverlays } = useDetourOverlays({
    selectedRouteIds: selectedRoutes,
    activeDetours,
    enabled: detoursEnabled,
    focusedRouteId: hasDetourFocus ? focusedDetourRouteId : null,
    detourStopDetailsByRouteId,
    routeColorByRouteId,
    showAllClosedStopMarkers: isDetourView && !hasDetourFocus,
  });
  const mapDetourRouteIds = useMemo(
    () => getDetourOverlayRouteIds(detourOverlays),
    [detourOverlays]
  );
  const mapHasDetourFocus = isDetourView &&
    Boolean(focusedDetourRouteId) &&
    routeIsDetouring(focusedDetourRouteId, mapDetourRouteIds);
  const statusDetours = useMemo(
    () => enrichDetoursWithDerivedStopCodes(activeDetours || {}, detourStopDetailsByRouteId),
    [activeDetours, detourStopDetailsByRouteId]
  );
  const statusDetourRouteIds = useMemo(
    () => new Set(Object.keys(statusDetours)),
    [statusDetours]
  );
  const shouldShowDetourStatusRow = !isTripPlanningMode && statusDetourRouteIds.size > 0;

  const handleDetourOverlayPress = useCallback((routeId, _segment = null, segmentIndex = null, overlay = null) => {
    if (!routeId) return;
    const isMergedFamilyOverlay =
      overlay?.familyStopsMerged === true &&
      Array.isArray(overlay?.segmentStopDetails) &&
      overlay.segmentStopDetails.length > 0;
    const sharedRouteIds = Array.isArray(overlay?.routeIds) && overlay.routeIds.length > 1
      ? overlay.routeIds
      : null;
    const sharedRouteLabel = overlay?.routeLineLabel || sharedRouteIds?.join('/');
    const sharedStatusLabel = overlay?.state === 'clear-pending' ? 'Detour Clearing' : 'Detour Active';

    setFocusedDetourRouteId(routeId);
    setDetourSheetRouteId(routeId);
    setDetourSheetSegmentIndex(Number.isInteger(segmentIndex) ? segmentIndex : null);
    setDetourSheetSegmentStopDetailsOverride(
      isMergedFamilyOverlay
        ? getSelectedDetourSegments(overlay.segmentStopDetails, segmentIndex)
        : null
    );
    setDetourSheetEvent(isMergedFamilyOverlay && sharedRouteIds
      ? {
        title: sharedRouteLabel ? `Routes ${sharedRouteLabel} - ${sharedStatusLabel}` : sharedStatusLabel,
        routeIds: sharedRouteIds,
      }
      : null);
    handleMapViewModeChange('detour');
  }, [handleMapViewModeChange]);

  const handleDetourStopPress = useCallback((stop, context = {}) => {
    if (!stop) return;
    suppressNextMapTapRef.current = true;
    setTimeout(() => {
      suppressNextMapTapRef.current = false;
    }, 0);
    setSelectedStop(buildDetourStopNotice({
      stop,
      routeId: context.routeId,
      detour: context.routeId ? getRouteDetour(context.routeId) : null,
      transitNewsImpacts,
    }));
    setShowStops(true);
  }, [getRouteDetour, transitNewsImpacts]);

  const selectedDetour = detourSheetRouteId ? getRouteDetour(detourSheetRouteId) : null;
  const selectedDetourSegments = useMemo(() => getSelectedDetourSegments(
    selectedDetour?.segments?.length
      ? selectedDetour.segments
      : [{
        shapeId: selectedDetour?.shapeId ?? null,
        entryPoint: selectedDetour?.entryPoint ?? null,
        exitPoint: selectedDetour?.exitPoint ?? null,
        skippedSegmentPolyline: selectedDetour?.skippedSegmentPolyline ?? null,
        inferredDetourPolyline: selectedDetour?.inferredDetourPolyline ?? null,
      }],
    detourSheetSegmentIndex
  ), [detourSheetSegmentIndex, selectedDetour]);
  const selectedDetourStopDetails = useMemo(() => deriveAffectedStopDetailsForDetour({
    routeId: detourSheetRouteId,
    segments: selectedDetourSegments,
    stops,
    routeStopsMapping,
    routeStopSequencesMapping,
  }), [detourSheetRouteId, routeStopSequencesMapping, routeStopsMapping, selectedDetourSegments, stops]);
  const detourSheetSegmentStopDetails = useMemo(() => (
    detourSheetSegmentStopDetailsOverride ??
    mergeFamilySegmentStopDetails({
      routeIds: detourSheetEvent?.routeIds,
      primaryRouteId: detourSheetRouteId,
      segmentStopDetails: selectedDetourStopDetails.segmentStopDetails,
      selectedSegmentIndex: detourSheetSegmentIndex,
      detourStopDetailsByRouteId,
    }) ??
    selectedDetourStopDetails.segmentStopDetails
  ), [
    detourSheetEvent,
    detourSheetRouteId,
    detourSheetSegmentIndex,
    detourSheetSegmentStopDetailsOverride,
    detourStopDetailsByRouteId,
    selectedDetourStopDetails.segmentStopDetails,
  ]);

  const { zoneOverlays } = useZoneOverlays({ onDemandZones, showZones });

  const displayedStopsForMap = useMemo(() => (
    annotateStopsWithClosures(displayedStops, transitNewsImpacts)
  ), [displayedStops, transitNewsImpacts]);

  const detourMapClosureStops = useMemo(() => (
    deriveMappableStopClosureStops({
      impacts: transitNewsImpacts,
      stops,
    })
  ), [transitNewsImpacts, stops]);

  const mapStopsForDisplay = useMemo(() => (
    mergeStopClosuresForDetourMap({
      displayedStops: displayedStopsForMap,
      closureStops: detourMapClosureStops,
      includeClosures: isDetourView || hasDetourFocus,
    })
  ), [displayedStopsForMap, detourMapClosureStops, isDetourView, hasDetourFocus]);
  const detourMapBadgeCount = getActiveDetourEventCount(statusDetours);
  const shouldShowDetourChrome = !isTripPlanningMode && canUseDetourView;

  const displayedStopsById = useMemo(() => {
    const map = new Map();
    mapStopsForDisplay.forEach((stop) => {
      map.set(String(stop.id), stop);
    });
    return map;
  }, [mapStopsForDisplay]);

  const stopsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: mapStopsForDisplay.map((stop) => ({
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
  }), [mapStopsForDisplay, selectedStop]);

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
    cancelLocationCenterRequest({
      pendingRef: pendingLocationCenterRef,
      releaseTimerRef: locationCenterReleaseTimerRef,
      stopFollowingUserLocation,
      setIsCenteringOnUserLocation,
    });
  }, [stopFollowingUserLocation]);

  const handleRegionWillChange = useCallback((feature) => {
    if (feature?.properties?.isUserInteraction) {
      if (isTripPreviewMode) {
        tripPreviewUserMovedMapRef.current = true;
      }
      cancelPendingLocationCenter();
    }
  }, [cancelPendingLocationCenter, isTripPreviewMode]);

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

  // Handle "Where to?" address selection — open trip planner with destination only.
  const handleWhereToSelect = (address) => {
    const destination = { lat: address.lat, lon: address.lon };
    setWhereToText('');
    startTripToDestination({
      destination,
      label: address.shortName || address.displayName,
      beforeEnter: () => setSelectedStop(null),
      enterPlanningMode,
      setTripTo,
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
      setTripTo,
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
      setTripTo,
    });
  };


  const centerOnUserLocationOnce = useCallback(async () => {
    if (isCenteringOnUserLocation) return;

    const requestId = pendingLocationCenterRef.current + 1;
    pendingLocationCenterRef.current = requestId;
    setIsCenteringOnUserLocation(true);

    try {
      const loc = await getForegroundDeviceLocation(Location, {
        accuracy: Location.Accuracy.Balanced,
      });
      if (requestId !== pendingLocationCenterRef.current) return;

      const latestRegion = mapRegionRef.current || MAP_CONFIG.INITIAL_REGION;
      const centeredLocation = {
        latitude: loc.lat,
        longitude: loc.lon,
      };
      const nextRegion = {
        latitude: loc.lat,
        longitude: loc.lon,
        latitudeDelta: latestRegion.latitudeDelta || MAP_CONFIG.INITIAL_REGION.latitudeDelta,
        longitudeDelta: latestRegion.longitudeDelta || MAP_CONFIG.INITIAL_REGION.longitudeDelta,
      };

      setCenteredUserLocation(centeredLocation);
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
      Alert.alert('Location unavailable', LOCATION_CENTER_ERROR_MESSAGE);
    } finally {
      if (requestId === pendingLocationCenterRef.current) {
        setIsCenteringOnUserLocation(false);
      }
    }
  }, [isCenteringOnUserLocation, selectedRoutes.size, showStops, stopFollowingUserLocation]);

  const showTripOverview = useCallback(() => {
    if (!selectedItinerary) {
      return;
    }

    fitMapToItinerary(selectedItinerary, busApproachViewportCoordinates);
  }, [busApproachViewportCoordinates, fitMapToItinerary, selectedItinerary]);

  const viewTripDetails = (itinerary) => {
    navigation.navigate('TripDetails', { itinerary });
  };

  // Start navigation directly from preview (skip details screen)
  const startNavigationDirect = async (itinerary) => {
    if (!itinerary || !itinerary.legs || itinerary.legs.length === 0) {
      logger.warn('Cannot start navigation: No route data available');
      return;
    }
    const preparedItinerary = await prepareItineraryForNavigation(itinerary);
    navigation.navigate('Navigation', { itinerary: preparedItinerary });
  };

  useEffect(() => {
    const decision = shouldAutoFitTripPreview({
      isTripPreviewMode,
      selectedItinerary,
      selectedItineraryIndex,
      lastFitKey: tripPreviewFitKeyRef.current,
      userHasMovedMap: tripPreviewUserMovedMapRef.current,
    });

    if (!isTripPreviewMode || !selectedItinerary || !decision.fitKey) {
      tripPreviewFitKeyRef.current = null;
      tripPreviewUserMovedMapRef.current = false;
      return;
    }

    if (!decision.shouldFit) return;

    fitMapToItinerary(selectedItinerary, busApproachViewportCoordinates);
    tripPreviewFitKeyRef.current = decision.fitKey;
    tripPreviewUserMovedMapRef.current = false;
  }, [
    busApproachViewportCoordinates,
    fitMapToItinerary,
    isTripPreviewMode,
    selectedItinerary,
    selectedItineraryIndex,
  ]);

  const routeLineLabelMarkers = useMemo(() => [], []);

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
          activeDetourRouteIds={mapDetourRouteIds}
          hasDetourFocus={mapHasDetourFocus}
          focusedDetourRouteId={focusedDetourRouteId}
          selectedDetourSegmentIndex={detourSheetSegmentIndex}
          isDetourView={isDetourView}
          routeShortNameMap={routeShortNameMap}
          routeLineLabelMarkers={routeLineLabelMarkers}
          detourOverlays={detourOverlays}
          handleDetourOverlayPress={handleDetourOverlayPress}
          handleDetourStopPress={handleDetourStopPress}
          zoneOverlays={zoneOverlays}
          handleZonePress={handleZonePress}
          displayedStopsLength={mapStopsForDisplay.length}
          displayedStops={mapStopsForDisplay}
          selectedStopId={selectedStop?.id ?? null}
          stopsGeoJson={stopsGeoJson}
          handleStopLayerPress={handleStopLayerPress}
          displayedVehicles={mapDisplayedVehicles}
          getRouteColor={getRouteColor}
          getRouteLabel={getRouteLabel}
          getVehicleSnapPath={getVehicleSnapPath}
          tripRouteCoordinates={tripRouteCoordinates}
          tripEndpointMarkers={tripEndpointMarkers}
          busApproachLines={busApproachLines}
          intermediateStopMarkers={intermediateStopMarkers}
          tripMarkers={tripMarkers}
          boardingAlightingMarkers={boardingAlightingMarkers}
          transferMarkers={transferMarkers}
          tripVehicles={tripVehicles}
          mapTapLocation={mapTapLocation}
          savedPlaceMapMarkers={savedPlaceMapMarkers}
          handleSelectSavedPlace={handleSelectSavedPlace}
          showUserLocation={!isTripPlanningMode || tripFromUsesCurrentLocation}
          centeredUserLocation={centeredUserLocation}
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

      {/* First launch loading screen when no saved transit data is ready yet */}
      {startupProgress?.variant === 'full' && (
        <View style={styles.startupFullOverlay}>
          <StartupLoadingScreen
            percent={startupProgress.percent}
            title={startupProgress.title}
            detail={
              startupProgress.title === 'Getting Barrie Transit ready'
                ? undefined
                : startupProgress.detail
            }
            statusText={startupProgress.detail || undefined}
          />
        </View>
      )}

      {/* Compact live-update card after saved routes are visible */}
      {startupProgress?.variant === 'card' && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <PulsingSpinner size={24} />
            <View style={styles.loadingCardContent}>
              <Text style={styles.loadingCardTitle}>{startupProgress.title}</Text>
              {startupProgress.detail ? (
                <Text style={styles.loadingCardDetail}>{startupProgress.detail}</Text>
              ) : null}
              <View
                style={styles.progressTrack}
                accessibilityRole="progressbar"
                accessibilityLabel={startupProgress.title}
                accessibilityValue={{ min: 0, max: 100, now: startupProgress.percent }}
              >
                <View style={[styles.progressFill, { width: `${startupProgress.percent}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{startupProgress.percent}% ready</Text>
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
            savedPlaces={rankedSavedPlaces}
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

      {!isTripPlanningMode && homeHolidayServiceInfo && (
        <HolidayServiceBanner
          holidayServiceInfo={homeHolidayServiceInfo}
          onPress={() => openHolidayDetails(homeHolidayServiceInfo.date)}
          style={[
            styles.holidayServiceBanner,
            shouldShowDetourChrome && styles.holidayServiceBannerWithDetours,
          ]}
        />
      )}

      {/* Post-trip survey nudge */}
      {!isTripPlanningMode && secondaryChromeReady && (
        <SurveyNudgeBanner
          onTakeSurvey={() => navigation.getParent()?.navigate('Profile', { screen: 'Survey', params: { trigger: 'post_trip' } })}
        />
      )}

      {/* Detour Banner */}
      {shouldShowDetourChrome && (
        <View style={styles.detourStatusStack}>
          <View style={styles.detourStatusRow}>
            {shouldShowDetourStatusRow && (
              <DetourAlertStrip
                activeDetours={statusDetours}
                routeColorByRouteId={routeColorByRouteId}
                onPress={(routeId, detourEvent = null) => {
                  if (!routeId) {
                    setDetourSheetSegmentIndex(null);
                    setDetourSheetEvent(null);
                    setDetourSheetSegmentStopDetailsOverride(null);
                    handleMapViewModeChange('detour');
                    return;
                  }

                  setFocusedDetourRouteId(routeId);
                  setDetourSheetRouteId(routeId);
                  setDetourSheetSegmentIndex(Number.isInteger(detourEvent?.primarySegmentIndex) ? detourEvent.primarySegmentIndex : null);
                  setDetourSheetEvent(detourEvent);
                  setDetourSheetSegmentStopDetailsOverride(null);
                  handleMapViewModeChange('detour');
                }}
                routes={routes}
                inline
              />
            )}
            <MapViewModeToggle
              visible={canUseDetourView}
              mode={mapViewMode}
              onChange={handleMapViewModeChange}
              detourCount={detourMapBadgeCount}
              inline
              onLayout={(event) => {
                const width = Math.ceil(event?.nativeEvent?.layout?.width || 0);
                if (width > 0 && Math.abs(width - detourModeToggleWidth) > 1) {
                  setDetourModeToggleWidth(width);
                }
              }}
            />
          </View>
          {isDetourView && upcomingDetourNotices.length > 0 && (
            <View style={styles.upcomingDetourRow}>
              <UpcomingDetourStrip
                notices={upcomingDetourNotices}
                routeColorByRouteId={routeColorByRouteId}
                collapsedByDefault
                onCollapsedChange={setUpcomingDetoursCollapsed}
                inline
                style={styles.upcomingDetourInline}
              />
              <View
                style={[
                  styles.detourModeToggleSpacer,
                  { width: detourModeToggleWidth },
                ]}
                pointerEvents="none"
              />
            </View>
          )}
        </View>
      )}

      <DetourMapLegend
        visible={!isTripPlanningMode && !detourSheetRouteId && isDetourView && detourOverlays.length > 0}
        openColor={detourOverlays.length === 1 ? detourOverlays[0].detourColor : COLORS.textPrimary}
        autoCollapseSignal={detourLegendAutoCollapseSignal}
        collapsedByDefault
        style={[
          styles.detourLegend,
          upcomingDetourNotices.length > 0 && (
            upcomingDetoursCollapsed
              ? styles.detourLegendWithCollapsedUpcoming
              : styles.detourLegendWithUpcoming
          ),
        ]}
      />

      {/* Map Controls (Top Right) */}
      {showMainMapFloatingControls && (
        <View style={[styles.mapControls, { bottom: 32 + floatingBottomOffset }]}>
          <TouchableOpacity
            style={[styles.mapControlButton, isCenteringOnUserLocation && styles.mapControlButtonDisabled]}
            onPress={centerOnUserLocationOnce}
            activeOpacity={0.7}
            disabled={isCenteringOnUserLocation}
            accessibilityRole="button"
            accessibilityLabel="Center on my location"
            accessibilityState={{ busy: isCenteringOnUserLocation, disabled: isCenteringOnUserLocation }}
          >
            {isCenteringOnUserLocation ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <CenterIcon size={18} color={COLORS.textPrimary} />
            )}
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
          onOpenFilterSheet={() => {
            setIsRouteFilterSheetOpen(true);
            routeFilterSheetRef.current?.expand();
          }}
        />
      )}

      {/* Favorite Stop Quick View */}
      {!isTripPlanningMode && secondaryChromeReady && (
        <FavoriteStopCard
          bottomInset={floatingBottomOffset}
          onPress={(stop) => {
            setSelectedStop(stop);
            setShowStops(true);
          }}
        />
      )}

      {/* Primary Action Button */}
      {showMainMapFloatingControls && (
        <BottomActionBar
          bottomInset={floatingBottomOffset}
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
            showUseCurrentLocation={!tripFromLocation}
            isLocatingCurrentLocation={isLocatingFrom}
            isLoading={isTripLoading}
            isTypingFrom={isTypingFrom}
            isTypingTo={isTypingTo}
            fromSuggestions={fromSuggestions}
            toSuggestions={toSuggestions}
            savedPlaces={rankedSavedPlaces}
            savedTrips={rankedSavedTrips}
            onSelectSavedPlace={handleSelectSavedPlace}
            onSelectSavedTrip={handleSelectSavedTrip}
            onSaveFromPlace={tripFromLocation ? () => chooseSavedPlaceLabel(tripFromLocation, tripFromText, 'Start') : null}
            onSaveToPlace={tripToLocation ? () => chooseSavedPlaceLabel(tripToLocation, tripToText, 'Destination') : null}
            timeMode={timeMode}
            selectedTime={selectedTime}
            onTimeModeChange={setTimeMode}
            onSelectedTimeChange={setSelectedTime}
            holidayServiceInfo={tripHolidayServiceInfo}
            compact={shouldCompactTripSearchHeader}
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
                itineraries={itinerariesWithStopClosureNotices}
                selectedIndex={selectedItineraryIndex}
                onSelectItinerary={setSelectedItineraryIndex}
                onViewDetails={viewTripDetails}
                onStartNavigation={startNavigationDirect}
                isLoading={isTripLoading}
                error={tripError}
                hasSearched={hasTripSearched}
                recentTrips={recentTrips}
                onSelectRecentTrip={handleSelectRecentTrip}
                savedTrips={rankedSavedTrips}
                onSelectSavedTrip={handleSelectSavedTrip}
                onSaveCurrentTrip={handleSaveCurrentTrip}
                repeatTripSuggestion={repeatTripSuggestion}
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

      <Modal
        visible={Boolean(savedPlacePicker)}
        transparent
        animationType="fade"
        onRequestClose={closeSavedPlacePicker}
      >
        <TouchableOpacity
          style={styles.savedPlacePickerBackdrop}
          activeOpacity={1}
          onPress={closeSavedPlacePicker}
          accessibilityRole="button"
          accessibilityLabel="Close save place options"
        >
          <TouchableOpacity
            style={styles.savedPlacePickerCard}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={styles.savedPlacePickerEyebrow}>SAVE PLACE</Text>
            <Text style={styles.savedPlacePickerTitle}>Choose an icon</Text>
            <Text style={styles.savedPlacePickerDetail}>
              Pick a saved-place type, or save this location as-is.
            </Text>
            <View style={styles.savedPlacePickerGrid}>
              {savedPlacePickerOptions.map((option) => (
                <TouchableOpacity
                  key={option.labelType}
                  style={styles.savedPlacePickerOption}
                  onPress={() => handleChooseSavedPlaceOption(option.labelType)}
                  accessibilityRole="button"
                  accessibilityLabel={`Save as ${option.label}`}
                >
                  <View style={styles.savedPlacePickerIcon}>
                    <Icon name={option.icon} size={22} color={COLORS.primary} />
                  </View>
                  <Text style={styles.savedPlacePickerOptionText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.savedPlacePickerCancel}
              onPress={closeSavedPlacePicker}
              accessibilityRole="button"
              accessibilityLabel="Cancel saving place"
            >
              <Text style={styles.savedPlacePickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Stop Bottom Sheet - available while choosing trip endpoints */}
      {selectedStop && !isTripPreviewMode && (
        <SheetErrorBoundary fallbackMessage="Stop details failed to load.">
          <StopBottomSheet
            stop={selectedStop}
            onClose={() => setSelectedStop(null)}
            onDirectionsFrom={handleStopDirectionsFrom}
            onDirectionsTo={handleStopDirectionsTo}
            platformMap={selectedStopPlatformMap}
            onOpenPlatformMap={handleOpenPlatformMap}
          />
        </SheetErrorBoundary>
      )}

      <PlatformMapViewerModal
        visible={Boolean(activePlatformMap)}
        platformMap={activePlatformMap}
        onClose={handleClosePlatformMap}
      />

      {/* Detour Details Sheet */}
      {detourSheetRouteId && selectedDetour && (
        <DetourDetailsSheet
          routeId={detourSheetRouteId}
          detour={selectedDetour}
          routeColor={getRouteColor(detourSheetRouteId)}
          detourEvent={detourSheetEvent}
          routeColorByRouteId={routeColorByRouteId}
          segmentStopDetails={detourSheetSegmentStopDetails}
          transitNews={transitNews}
          onClose={() => {
            setDetourSheetRouteId(null);
            setDetourSheetSegmentIndex(null);
            setDetourSheetEvent(null);
            setDetourSheetSegmentStopDetailsOverride(null);
          }}
          onViewOnMap={() => {
            setFocusedDetourRouteId(detourSheetRouteId);
            handleMapViewModeChange('detour');
            setDetourSheetRouteId(null);
            setDetourSheetSegmentIndex(null);
            setDetourSheetEvent(null);
            setDetourSheetSegmentStopDetailsOverride(null);
          }}
        />
      )}

      <HolidayServiceDetailsSheet
        visible={holidayDetailsVisible}
        holidayServiceInfo={selectedHolidayDetailsInfo}
        isLoadingDetails={isLoadingHolidayDetails}
        onClose={() => setHolidayDetailsVisible(false)}
      />

      {/* Route Filter Sheet - full grid view for route selection */}
      <RouteFilterSheet
        sheetRef={routeFilterSheetRef}
        routes={routes}
        selectedRoutes={selectedRoutes}
        onRouteSelect={handleRouteSelect}
        getRouteColor={getRouteColor}
        isRouteDetouring={isRouteDetouring}
        onSheetChange={(index) => setIsRouteFilterSheetOpen(index >= 0)}
      />

      {/* Map Tap Popup - for choosing directions from/to a tapped location */}
      <MapTapPopup
        bottomInset={floatingBottomOffset}
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
  startupFullOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2000,
    backgroundColor: COLORS.white,
  },
  startupFullCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xxl,
    ...SHADOWS.large,
  },
  startupFullTitle: {
    marginTop: SPACING.lg,
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  startupFullDetail: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
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
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: COLORS.grey200,
    borderRadius: BORDER_RADIUS.round,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.round,
  },
  progressLabel: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
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
  savedPlacePickerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: 'rgba(23, 43, 77, 0.28)',
  },
  savedPlacePickerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    ...SHADOWS.large,
  },
  savedPlacePickerEyebrow: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
    letterSpacing: 0.8,
  },
  savedPlacePickerTitle: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  savedPlacePickerDetail: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  savedPlacePickerGrid: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  savedPlacePickerOption: {
    width: '30.5%',
    minWidth: 88,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.grey50,
    borderWidth: 1,
    borderColor: COLORS.grey200,
  },
  savedPlacePickerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySubtle,
  },
  savedPlacePickerOptionText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  savedPlacePickerCancel: {
    marginTop: SPACING.md,
    alignSelf: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  savedPlacePickerCancelText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
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
  holidayServiceBanner: {
    position: 'absolute',
    top: 122 + STATUS_BAR_OFFSET,
    left: SPACING.sm,
    right: SPACING.sm,
    zIndex: 998,
  },
  holidayServiceBannerWithDetours: {
    top: 174 + STATUS_BAR_OFFSET,
  },
  detourStatusStack: {
    position: 'absolute',
    top: 122 + STATUS_BAR_OFFSET,
    left: SPACING.sm,
    right: SPACING.sm,
    zIndex: 997,
    gap: SPACING.xs,
  },
  detourStatusRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.sm,
  },
  upcomingDetourRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.sm,
  },
  upcomingDetourInline: {
    flex: 1,
  },
  detourModeToggleSpacer: {
    flexShrink: 0,
  },
  detourLegend: {
    top: 174 + STATUS_BAR_OFFSET,
    right: SPACING.sm,
  },
  detourLegendWithUpcoming: {
    top: 276 + STATUS_BAR_OFFSET,
  },
  detourLegendWithCollapsedUpcoming: {
    top: 170 + STATUS_BAR_OFFSET,
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
  mapControlButtonDisabled: {
    opacity: 0.7,
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
    backgroundColor: '#4285F4',
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
  savedPlaceMapMarkerWrap: {
    alignItems: 'center',
    minWidth: 54,
  },
  savedPlaceMapMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: 'rgba(26, 115, 232, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  savedPlaceMapMarkerLabel: {
    marginTop: 3,
    maxWidth: 82,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    color: COLORS.textPrimary,
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'center',
  },
  savedPlaceMapMarkerCount: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  tripViewportControls: {
    position: 'absolute',
    top: 152 + STATUS_BAR_OFFSET,
    right: SPACING.sm,
    zIndex: 999,
  },
  androidBusMarkerFrame: {
    width: 56,
    height: 56,
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
  topStopMarkerFrameClosed: {
    minWidth: 76,
    minHeight: 48,
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
  topStopMarkerCodeLabel: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginBottom: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.white,
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
    letterSpacing: 0.2,
    textAlign: 'center',
    overflow: 'hidden',
    marginLeft: 28,
    ...SHADOWS.small,
  },
  topStopMarkerClosedStop: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  topStopMarkerClosedStopSelected: {
    borderColor: COLORS.accent,
  },
  topStopMarkerClosedStopDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.warning,
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
  tripRouteSquareLabel: {
    width: 28,
    height: 28,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
    ...SHADOWS.small,
  },
  tripRouteSquareLabelText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.extrabold,
    lineHeight: 13,
    textAlign: 'center',
  },
  // Stop label markers (boarding/alighting)
  stopLabelContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  stopLabelBubble: {
    position: 'absolute',
    top: -42,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 2,
    minWidth: 132,
    maxWidth: 180,
    ...SHADOWS.small,
  },
  stopLabelBubbleBoarding: {
    right: 34,
  },
  stopLabelBubbleAlighting: {
    left: 34,
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
  // Transfer point markers
  transferMarkerContainer: {
    alignItems: 'center',
  },
  transferLabelBubble: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 2,
    borderColor: COLORS.transfer,
    marginBottom: 4,
    minWidth: 96,
    maxWidth: 160,
    ...SHADOWS.small,
  },
  transferLabelType: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.transfer,
    textTransform: 'uppercase',
  },
  transferLabelName: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  transferLabelPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.transfer,
    marginBottom: 2,
  },
  transferDiamond: {
    width: 16,
    height: 16,
    backgroundColor: COLORS.transfer,
    borderWidth: 3,
    borderColor: COLORS.white,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
    ...SHADOWS.small,
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
