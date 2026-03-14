/**
 * Web-specific HomeScreen - Premium UI/UX Design v2.0
 * Features: Refined header, collapsible route filters, prominent alerts, modern controls
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Animated, TextInput } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useTransitStatic, useTransitRealtime } from '../context/TransitContext';
import { MAP_CONFIG, PERFORMANCE_BUDGETS } from '../config/constants';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH_TARGET } from '../config/theme';
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
import TripBottomSheet from '../components/TripBottomSheet';
import { applyDelaysToItineraries } from '../services/tripDelayService';
import logger from '../utils/logger';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useDetourOverlays } from '../hooks/useDetourOverlays';
import TripSearchHeaderWeb from '../components/TripSearchHeader.web';
import MapTapPopup from '../components/MapTapPopup';
import { getVehicleRouteLabel, resolveVehicleRouteLabel } from '../utils/routeLabel';
import { pointToPolylineDistance } from '../utils/geometryUtils';
import { shouldRenderRouteShape } from '../utils/detourFocusUtils';
import { escapeHtml } from '../utils/htmlUtils';

// Web-only imports
import WebMapView, { WebBusMarker, WebHtmlMarker, WebRoutePolyline, WebStopMarker, RouteLineLabels } from '../components/WebMapView';
import FavoriteStopCard from '../components/FavoriteStopCard';
import DetourOverlay from '../components/DetourOverlay.web';
import { useZoneOverlays } from '../hooks/useZoneOverlays';
import ZoneOverlay from '../components/ZoneOverlay.web';
import ZoneInfoSheet from '../components/ZoneInfoSheet.web';
import HomeScreenControls from '../components/HomeScreenControls';
import SurveyNudgeBanner from '../components/survey/SurveyNudgeBanner';
import AddressAutocomplete from '../components/AddressAutocomplete';
import DetourAlertStrip from '../components/DetourAlertStrip';
import DetourDetailsSheet from '../components/DetourDetailsSheet';
import MapViewModeToggle from '../components/MapViewModeToggle';
import { deriveAffectedStopDetailsForDetour } from '../hooks/useAffectedStops';
import StatusBadge from '../components/StatusBadge';
import SystemHealthBanner from '../components/SystemHealthBanner';
import SystemHealthChip from '../components/SystemHealthChip';
import useRoutePanel from '../hooks/useRoutePanel';
import DirectionArrows from '../components/DirectionArrows.web';
const ROUTE_LABEL_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_ROUTE_LABEL_DEBUG === 'true';
const PERF_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_PERF_DEBUG === 'true';

// SVG Icons as components - Refined for premium feel
const BusIcon = ({ size = 20, color = COLORS.textPrimary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 16C4 16.88 4.39 17.67 5 18.22V20C5 20.55 5.45 21 6 21H7C7.55 21 8 20.55 8 20V19H16V20C16 20.55 16.45 21 17 21H18C18.55 21 19 20.55 19 20V18.22C19.61 17.67 20 16.88 20 16V6C20 2.5 16.42 2 12 2C7.58 2 4 2.5 4 6V16ZM7.5 17C6.67 17 6 16.33 6 15.5C6 14.67 6.67 14 7.5 14C8.33 14 9 14.67 9 15.5C9 16.33 8.33 17 7.5 17ZM16.5 17C15.67 17 15 16.33 15 15.5C15 14.67 15.67 14 16.5 14C17.33 14 18 14.67 18 15.5C18 16.33 17.33 17 16.5 17ZM18 11H6V6H18V11Z" fill={color} />
  </svg>
);

const StopIconFilled = ({ size = 20, color = COLORS.textPrimary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill={color} />
  </svg>
);

const StopIconOutline = ({ size = 20, color = COLORS.textPrimary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM7 9C7 6.24 9.24 4 12 4C14.76 4 17 6.24 17 9C17 12.18 14.12 16.5 12 19.05C9.92 16.53 7 12.22 7 9ZM12 11.5C13.38 11.5 14.5 10.38 14.5 9C14.5 7.62 13.38 6.5 12 6.5C10.62 6.5 9.5 7.62 9.5 9C9.5 10.38 10.62 11.5 12 11.5Z" fill={color} />
  </svg>
);

const RouteIcon = ({ size = 20, color = COLORS.textPrimary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 5L13.59 6.41L16.17 9H4V11H16.17L13.59 13.59L15 15L20 10L15 5Z" fill={color} />
  </svg>
);

const CenterIcon = ({ size = 20, color = COLORS.textPrimary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8ZM20.94 11C20.48 6.83 17.17 3.52 13 3.06V1H11V3.06C6.83 3.52 3.52 6.83 3.06 11H1V13H3.06C3.52 17.17 6.83 20.48 11 20.94V23H13V20.94C17.17 20.48 20.48 17.17 20.94 13H23V11H20.94ZM12 19C8.13 19 5 15.87 5 12C5 8.13 8.13 5 12 5C15.87 5 19 8.13 19 12C19 15.87 15.87 19 12 19Z" fill={color} />
  </svg>
);

const SearchIcon = ({ size = 20, color = COLORS.textSecondary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z" fill={color} />
  </svg>
);

const AlertIcon = ({ size = 16, color = COLORS.warning }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L1 21H23L12 2ZM12 18C11.45 18 11 17.55 11 17C11 16.45 11.45 16 12 16C12.55 16 13 16.45 13 17C13 17.55 12.55 18 12 18ZM13 14H11V10H13V14Z" fill={color} />
  </svg>
);

const DirectionsIcon = ({ size = 20, color = COLORS.white }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.71 11.29L12.71 2.29C12.32 1.9 11.69 1.9 11.3 2.29L2.3 11.29C1.91 11.68 1.91 12.31 2.3 12.7L11.3 21.7C11.5 21.9 11.74 22 12 22C12.26 22 12.5 21.9 12.71 21.71L21.71 12.71C22.1 12.32 22.1 11.68 21.71 11.29ZM14 14.5V12H10V15H8V11C8 10.45 8.45 10 9 10H14V7.5L17.5 11L14 14.5Z" fill={color} />
  </svg>
);

const CloseIcon = ({ size = 20, color = COLORS.textSecondary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill={color} />
  </svg>
);

const ChevronRightIcon = ({ size = 16, color = COLORS.textSecondary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 6L8.59 7.41L13.17 12L8.59 16.59L10 18L16 12L10 6Z" fill={color} />
  </svg>
);

const buildIntermediateStopMarkerHtml = (color) => `
  <div style="background:${color};width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>
`;

const buildTripMarkerHtml = (marker) => {
  const color = marker.type === 'origin' ? '#4CAF50' : '#f44336';
  const stopCode = escapeHtml(marker.stopCode || '');
  const stopName = escapeHtml(marker.stopName || '');
  const bubbleSide = marker.type === 'origin' ? 'left: 28px;' : 'right: 28px;';
  const accentStyle = marker.type === 'origin'
    ? `border-left:4px solid ${color};`
    : `border-right:4px solid ${color};`;
  const connectorSide = marker.type === 'origin' ? 'left: 20px;' : 'right: 20px;';
  const walkLabel = marker.walkDistance != null
    ? (marker.walkDistance >= 1000
        ? `${(marker.walkDistance / 1000).toFixed(1)} km walk`
        : `${marker.walkDistance} m walk`) +
      (marker.type === 'origin' ? ' from start' : ' to destination')
    : '';
  const labelHtml = marker.stopName
    ? `<div style="position:absolute;top:-10px;${bubbleSide}background:rgba(255,255,255,0.97);border-radius:12px;padding:7px 10px;min-width:126px;max-width:190px;border:1px solid rgba(15,23,42,0.08);${accentStyle}box-shadow:0 10px 24px rgba(15,23,42,0.16);backdrop-filter:blur(8px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        <div style="font-size:11px;font-weight:600;color:#1f2937;line-height:1.2;">${marker.stopCode ? `#${stopCode} - ` : ''}${stopName}</div>
        ${walkLabel ? `<div style="font-size:10px;color:#64748b;line-height:1.3;margin-top:3px;">${walkLabel}</div>` : ''}
      </div>`
    : '';
  const connectorHtml = marker.stopName
    ? `<div style="position:absolute;top:9px;${connectorSide}width:14px;height:2px;border-radius:999px;background:rgba(38,50,56,0.22);"></div>`
    : '';

  return `
    <div style="position:relative;width:20px;height:20px;">
      ${labelHtml}
      ${connectorHtml}
      <div style="background:${color};width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <div style="background:white;width:8px;height:8px;border-radius:50%;"></div>
      </div>
    </div>
  `;
};

const buildTripEndpointMarkerHtml = (marker) => {
  const color = marker.type === 'originLocation' ? '#4CAF50' : '#f44336';
  const iconSvg = marker.type === 'originLocation'
    ? `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" fill="${color}"/>
        <path d="M5 19C5.8 15.9 8.54 14 12 14C15.46 14 18.2 15.9 19 19" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
    : `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 21C12 21 18 14.5 18 9.5C18 6.19 15.31 3.5 12 3.5C8.69 3.5 6 6.19 6 9.5C6 14.5 12 21 12 21Z" fill="${color}"/>
        <circle cx="12" cy="9.5" r="2.3" fill="white"/>
      </svg>
    `;

  return `
    <div style="width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,0.96);border:1.5px solid ${color}55;box-shadow:0 4px 10px rgba(15,23,42,0.12);display:flex;align-items:center;justify-content:center;">
      ${iconSvg}
    </div>
  `;
};

const buildBoardingMarkerHtml = (marker) => {
  const routeName = escapeHtml(marker.routeName || '');
  const stopCode = escapeHtml(marker.stopCode || '');
  const stopName = escapeHtml(marker.stopName || '');

  return `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      <div style="background:white;border-radius:8px;padding:4px 8px;box-shadow:0 2px 8px rgba(0,0,0,0.2);border:2px solid ${marker.routeColor};margin-bottom:4px;white-space:nowrap;max-width:180px;">
        <div style="font-size:10px;font-weight:bold;color:${marker.routeColor};text-transform:uppercase;">${marker.type === 'boarding' ? 'Board' : 'Exit'} ${routeName ? `Route ${routeName}` : ''}</div>
        <div style="font-size:11px;font-weight:600;color:#333;overflow:hidden;text-overflow:ellipsis;">#${stopCode} - ${stopName}</div>
      </div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${marker.routeColor};"></div>
    </div>
  `;
};

const buildMapTapMarkerHtml = () => `
  <div style="background:#1a73e8;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:12px;">📍</div>
`;

const HomeScreen = ({ route }) => {
  const mapRef = useRef(null);
  const navigation = useNavigation();
  const {
    routes,
    stops,
    shapes,
    trips,
    tripMapping,
    processedShapes,
    shapeOverlapOffsets,
    routeShapeMapping,
    routeStopsMapping,
    routeStopSequencesMapping,
    isLoadingStatic,
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
    lastVehicleUpdate,
    serviceAlerts,
    detoursEnabled,
    isRouteDetouring,
    activeDetours,
    onDemandZones,
    getRouteDetour,
    loadVehiclePositions,
  } = useTransitRealtime();

  const {
    selectedRoutes, hasSelection, handleRouteSelect: rawHandleRouteSelect, isRouteSelected, selectRoute,
  } = useRouteSelection({ routeShapeMapping, shapes, mapRef, multiSelect: true });
  const [selectedStop, setSelectedStop] = useState(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showStops, setShowStops] = useState(false);
  const [mapRegion, setMapRegion] = useState(MAP_CONFIG.INITIAL_REGION);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const perfRef = useRef({ lastWarnTs: 0 });
  const [expandedAlertRoute, setExpandedAlertRoute] = useState(null); // For showing alert details
  const [showZones, setShowZones] = useState(true);
  const [selectedZone, setSelectedZone] = useState(null);
  const [whereToText, setWhereToText] = useState('');
  const [detourSheetRouteId, setDetourSheetRouteId] = useState(null);
  const [focusedDetourRouteId, setFocusedDetourRouteId] = useState(null);
  const [mapViewMode, setMapViewMode] = useState('regular');
  const pulseAnim = useMapPulseAnimation();
  const { isExpanded: routePanelExpanded, toggle: toggleRoutePanel, collapse: collapseRoutePanel, autoCollapseOnSelect } = useRoutePanel();

  // Wrap route select to auto-collapse panel on selection
  const handleRouteSelect = useCallback((routeId) => {
    rawHandleRouteSelect(routeId);
    if (routeId !== null && autoCollapseOnSelect) {
      collapseRoutePanel();
    }
  }, [rawHandleRouteSelect, autoCollapseOnSelect, collapseRoutePanel]);

  // Track newly selected routes for draw-on animation
  const prevSelectedRef = useRef(new Set());
  const newlySelectedRoutes = useMemo(() => {
    const prev = prevSelectedRef.current;
    const newly = new Set();
    selectedRoutes.forEach(id => {
      if (!prev.has(id)) newly.add(id);
    });
    prevSelectedRef.current = new Set(selectedRoutes);
    return newly;
  }, [selectedRoutes]);

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
  });

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

  // Helper to check if a route has active alerts
  const getRouteAlerts = useCallback((routeId) => {
    return serviceAlerts.filter(alert => alert.affectedRoutes?.includes(routeId));
  }, [serviceAlerts]);

  const hasRouteAlert = useCallback((routeId) => {
    return getRouteAlerts(routeId).length > 0;
  }, [getRouteAlerts]);

  // Trip planning — shared hook
  const trip = useTripPlanner({
    ensureRoutingData,
    onDemandZones,
    stops,
    applyDelays: applyDelaysToItineraries,
  });
  const {
    state: tripState,
    searchFromAddress,
    searchToAddress,
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
    searchTrips,
    setTimeMode,
    setSelectedTime,
  } = trip;
  // Destructure state for direct access in render
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
    fromSuggestions,
    toSuggestions,
    showFromSuggestions,
    showToSuggestions,
    isTypingFrom,
    isTypingTo,
    timeMode,
    selectedTime,
  } = tripState;

  const {
    tripRouteCoordinates, tripMarkers, tripEndpointMarkers, intermediateStopMarkers,
    boardingAlightingMarkers, tripVehicles, busApproachLines,
  } = useTripVisualization({ isTripPlanningMode, itineraries, selectedItineraryIndex, vehicles, shapes, tripMapping, tripFrom: tripFromLocation, tripTo: tripToLocation });

  const isFocused = useIsFocused();
  useTripPreviewViewport({
    isFocused,
    isTripPlanningMode,
    itineraries,
    selectedItineraryIndex,
    fitToCoordinates: (coordinates, options) => mapRef.current?.fitToCoordinates(coordinates, options),
    edgePadding: { top: 200, right: 50, bottom: 350, left: 50 },
    onBlurInactive: resetTrip,
  });

  // Map tap popup
  const {
    mapTapLocation, mapTapAddress, isLoadingAddress,
    handleMapPress: handleMapTapPress, handleDirectionsFrom, handleDirectionsTo,
    closeMapTapPopup,
    showLocation,
  } = useMapTapPopup({ enterPlanningMode, setTripFrom, setTripTo });
  const handleMapPress = handleMapTapPress;
  const handleCloseMapTapPopup = closeMapTapPopup;

  // Navigation param effects (selected stop/route/coordinate, exit trip planning)
  useMapNavigation({
    route, navigation, stops, mapRef,
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

  const [hoveredRouteId, setHoveredRouteId] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(() =>
    Math.round(Math.log(360 / MAP_CONFIG.INITIAL_REGION.latitudeDelta) / Math.LN2)
  );

  // Zoom-dependent polyline weight
  const getPolylineWeight = useCallback((routeId) => {
    let base;
    if (currentZoom <= 11) base = 4;
    else if (currentZoom <= 13) base = 6;
    else if (currentZoom <= 15) base = 8;
    else base = 10;

    const isDetouring = activeDetourRouteIds.has(routeId);
    const isFocusedDetour = hasDetourFocus && focusedDetourRouteId === routeId;

    if (isFocusedDetour) return base + 2;
    if (isDetourView && !hasSelection) return isDetouring ? base : Math.max(3, base - 4);
    if (selectedRoutes.has(routeId)) base += 2;
    if (hoveredRouteId === routeId) base += 2;
    return base;
  }, [
    activeDetourRouteIds,
    currentZoom,
    focusedDetourRouteId,
    isDetourView,
    hasDetourFocus,
    hasSelection,
    hoveredRouteId,
    selectedRoutes,
  ]);

  // Displayed entities (vehicles, shapes, stops, detours) based on selection
  const {
    getRouteColor, displayedVehicles, displayedShapes, displayedStops,
  } = useDisplayedEntities({
    selectedRouteIds: selectedRoutes,
    vehicles, routes, trips, shapes, processedShapes,
    routeShapeMapping, routeStopsMapping, stops,
    showRoutes, showStops, mapRegion,
  });

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

  // Build vehicle routeId → display label lookup
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

    logger.info('[route-label-debug][web] %s', lines.join(' | '));
  }, [displayedVehicles, routes, tripMapping]);

  useEffect(() => {
    if (!PERF_DEBUG) return;
    const nowTs = Date.now();
    if (nowTs - perfRef.current.lastWarnTs < 2000) return;

    if (displayedVehicles.length > PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_VEHICLES) {
      logger.warn(
        '[perf][home-map-web] Visible vehicles=%d (budget=%d)',
        displayedVehicles.length,
        PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_VEHICLES
      );
      perfRef.current.lastWarnTs = nowTs;
      return;
    }

    if (displayedStops.length > PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_STOPS) {
      logger.warn(
        '[perf][home-map-web] Visible stops=%d (budget=%d)',
        displayedStops.length,
        PERFORMANCE_BUDGETS.MAP_MAX_VISIBLE_STOPS
      );
      perfRef.current.lastWarnTs = nowTs;
    }
  }, [displayedVehicles.length, displayedStops.length]);

  // Handle map region change
  const handleRegionChange = (region) => {
    const start =
      typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
        ? global.performance.now()
        : Date.now();
    setMapRegion(region);
    // Derive zoom from latitudeDelta
    const zoom = Math.round(Math.log(360 / region.latitudeDelta) / Math.LN2);
    setCurrentZoom(zoom);

    if (!PERF_DEBUG) return;
    const duration =
      (typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
        ? global.performance.now()
        : Date.now()) - start;
    const nowTs = Date.now();
    if (duration > PERFORMANCE_BUDGETS.MAP_REGION_HANDLER_MS && nowTs - perfRef.current.lastWarnTs > 2000) {
      logger.warn(
        '[perf][home-map-web] Slow region handler=%dms (budget=%dms)',
        Math.round(duration),
        PERFORMANCE_BUDGETS.MAP_REGION_HANDLER_MS
      );
      perfRef.current.lastWarnTs = nowTs;
    }
  };

  // Handle stop press
  const handleStopPress = (stop) => {
    setSelectedStop(stop);
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
    setWhereToText('');
  };

  // Handle "Where to?" address selection — open trip planner with destination + current location
  const handleWhereToSelect = (address) => {
    const destination = { lat: address.lat, lon: address.lon };
    setWhereToText('');
    enterPlanningMode();
    setSelectedStop(null);
    setTripTo(destination, address.shortName || address.displayName);
    useCurrentLocationForTrip(destination);
  };

  const handleZonePress = (zoneId) => {
    const zone = onDemandZones?.[zoneId];
    if (zone) setSelectedZone(zone);
  };

  const handleZoneDirectionsToHub = (hubStop) => {
    setSelectedZone(null);
    enterPlanningMode();
    setTripTo({ lat: hubStop.latitude, lon: hubStop.longitude }, hubStop.name || 'Hub Stop');
  };

  const useCurrentLocationForTrip = (searchTo = null) => {
    useCurrentLocationHook(
      () => new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('No geolocation'));
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          (err) => reject(err)
        );
      }),
      { searchTo }
    );
  };

  const centerOnUserLocationOnce = useCallback(() => {
    if (!navigator.geolocation) {
      logger.warn('Geolocation unavailable for one-time centering');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latestRegion = mapRegion || MAP_CONFIG.INITIAL_REGION;
        const nextRegion = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: latestRegion.latitudeDelta || MAP_CONFIG.INITIAL_REGION.latitudeDelta,
          longitudeDelta: latestRegion.longitudeDelta || MAP_CONFIG.INITIAL_REGION.longitudeDelta,
        };

        mapRef.current?.animateToRegion(nextRegion, 500);
        setMapRegion(nextRegion);
        setUserHasInteracted(true);
      },
      (error) => {
        logger.warn('Failed to center on user location', error);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 30000,
        timeout: 10000,
      }
    );
  }, [mapRegion]);


  // Trip preview mode - hide regular map elements when viewing trip results
  const isTripPreviewMode = isTripPlanningMode && itineraries.length > 0;

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

  if (staticError && routes.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorCard}>
          <View style={styles.errorIconContainer}>
            <Text style={styles.errorIcon}>!</Text>
          </View>
          <Text style={styles.errorTitle}>Connection Error</Text>
          <Text style={styles.errorDetail}>{staticError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadStaticData} accessibilityRole="button" accessibilityLabel="Retry loading transit data">
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Web Map using Leaflet */}
      <WebMapView
        ref={mapRef}
        initialRegion={MAP_CONFIG.INITIAL_REGION}
        onRegionChangeComplete={handleRegionChange}
        onPress={handleMapPress}
        onUserInteraction={() => setUserHasInteracted(true)}
      >
        {/* Regular route shapes - hide when in trip preview mode */}
        {!isTripPreviewMode && displayedShapes.map((shape) => {
          const isHovering = hoveredRouteId !== null;
          const isThisHovered = hoveredRouteId === shape.routeId;
          const isSelected = isRouteSelected(shape.routeId);
          const isDetouring = activeDetourRouteIds.has(shape.routeId);
          const isFocusedDetour = hasDetourFocus && focusedDetourRouteId === shape.routeId;
          const shouldRenderShape = shouldRenderRouteShape({
            routeId: shape.routeId,
            hasDetourFocus,
            focusedDetourRouteId,
          });

          if (!shouldRenderShape) {
            return null;
          }

          let opacity, outlineW;
          let routeColor = shape.color;
          let routeLabel = null;

          if (hasDetourFocus) {
            opacity = isFocusedDetour ? 0.98 : isDetouring ? 0.22 : 0.1;
            outlineW = isFocusedDetour ? (currentZoom >= 14 ? 4 : 3) : 0;
            routeColor = isFocusedDetour ? '#111827' : COLORS.grey400;
          } else if (isDetourView && !hasSelection) {
            opacity = isDetouring ? 0.82 : 0.18;
            outlineW = isDetouring ? (currentZoom >= 14 ? 3 : 2) : 0;
            routeColor = isDetouring ? '#111827' : COLORS.grey400;
          } else if (hasSelection) {
            opacity = isSelected ? 1.0 : 0.15;
            outlineW = isSelected ? (currentZoom >= 14 ? 4 : 3) : 0;
            routeLabel = isSelected ? (routeShortNameMap.get(shape.routeId) || null) : null;
          } else if (isHovering) {
            opacity = isThisHovered ? 0.95 : 0.4;
            outlineW = currentZoom >= 14 ? 2 : 1;
            routeLabel = isThisHovered ? (routeShortNameMap.get(shape.routeId) || null) : null;
          } else {
            opacity = 0.85;
            outlineW = currentZoom >= 14 ? 2 : 1;
          }

          const isNewlySelected = newlySelectedRoutes.has(shape.routeId);

          return (
            <WebRoutePolyline
              key={shape.id}
              coordinates={shape.coordinates}
              color={routeColor}
              strokeWidth={getPolylineWeight(shape.routeId)}
              opacity={opacity}
              outlineWidth={outlineW}
              smoothFactor={1.2}
              onMouseOver={() => setHoveredRouteId(shape.routeId)}
              onMouseOut={() => setHoveredRouteId(null)}
              className={isNewlySelected ? 'polyline-draw-on' : ''}
              routeLabel={routeLabel}
            />
          );
        })}
        {/* Direction arrows on selected route polylines */}
        {!isTripPreviewMode && hasSelection && displayedShapes
          .filter(shape => isRouteSelected(shape.routeId))
          .map(shape => (
            <DirectionArrows
              key={`arrows-${shape.id}`}
              coordinates={shape.coordinates}
              color={shape.color}
            />
          ))
        }
        {/* Detour geometry overlays — above route polylines */}
        {!isTripPreviewMode && detourOverlays.map((overlay) => (
          <DetourOverlay key={`detour-${overlay.routeId}`} {...overlay} />
        ))}
        {/* On-demand zone overlays */}
        {!isTripPreviewMode && zoneOverlays.map((zone) => (
          <ZoneOverlay
            key={`zone-${zone.id}`}
            id={zone.id}
            coordinates={zone.coordinates}
            color={zone.color}
            onPress={handleZonePress}
          />
        ))}
        {/* Regular stops - hide when in trip preview mode */}
        {!isTripPreviewMode && displayedStops.map((stop) => (
          <WebStopMarker
            key={stop.id}
            stop={stop}
            onPress={handleStopPress}
            isSelected={selectedStop?.id === stop.id}
          />
        ))}
        {/* Live bus markers - hide when in trip preview mode */}
        {!isTripPreviewMode && displayedVehicles.map((vehicle) => {
          const isDetouring = activeDetourRouteIds.has(vehicle.routeId);
          const isFocusedDetour = hasDetourFocus && focusedDetourRouteId === vehicle.routeId;
          const dimmed = hasDetourFocus
            ? !isFocusedDetour
            : isDetourView && !hasSelection
              ? !isDetouring
              : false;
          const markerColor = dimmed ? COLORS.grey400 : getRouteColor(vehicle.routeId);

          return (
            <WebBusMarker
              key={vehicle.id}
              vehicle={vehicle}
              color={markerColor}
              routeLabel={getRouteLabel(vehicle)}
              snapPath={getVehicleSnapPath(vehicle)}
              dimmed={dimmed}
            />
          );
        })}
        {/* Trip planning route overlay */}
        {tripRouteCoordinates.map((route) => (
          <React.Fragment key={route.id}>
            <WebRoutePolyline
              coordinates={route.coordinates}
              color={route.color}
              strokeWidth={route.isWalk ? 4 : route.isOnDemand ? 5 : 6}
              dashArray={route.isWalk ? '2, 8' : route.isOnDemand ? '12, 6' : null}
              lineCap="round"
              lineJoin="round"
              opacity={route.isWalk ? 0.9 : 1}
              outlineWidth={0}
              interactive={false}
            />
            {route.routeLabel && (
              <RouteLineLabels coordinates={route.coordinates} color={route.color} routeLabel={route.routeLabel} />
            )}
          </React.Fragment>
        ))}

        {/* Actual trip start and final destination markers */}
        {tripEndpointMarkers.map((marker) => (
          <WebHtmlMarker
            key={marker.id}
            coordinate={marker.coordinate}
            html={buildTripEndpointMarkerHtml(marker)}
            className={`trip-endpoint-marker-${marker.type}`}
            zIndexOffset={900}
          />
        ))}

        {/* Bus approach lines — dashed route-colored line from bus to boarding stop */}
        {busApproachLines.map((line) => (
          <WebRoutePolyline
            key={line.id}
            coordinates={line.coordinates}
            color={line.color}
            strokeWidth={3}
            dashArray="8 6"
            opacity={0.7}
            outlineWidth={0}
            interactive={false}
          />
        ))}

        {/* Trip planning intermediate stop markers */}
        {intermediateStopMarkers.map((marker) => (
          <WebHtmlMarker
            key={marker.id}
            coordinate={marker.coordinate}
            html={buildIntermediateStopMarkerHtml(marker.color)}
            className="intermediate-stop-marker"
          />
        ))}

        {/* Trip planning markers with stop info labels */}
        {tripMarkers.map((marker) => (
          <WebHtmlMarker
            key={marker.id}
            coordinate={marker.coordinate}
            html={buildTripMarkerHtml(marker)}
            className={`trip-marker-${marker.type}`}
            zIndexOffset={1000}
          />
        ))}

        {/* Boarding and alighting stop markers with labels */}
        {boardingAlightingMarkers.map((marker) => (
          <WebHtmlMarker
            key={marker.id}
            coordinate={marker.coordinate}
            html={buildBoardingMarkerHtml(marker)}
            className={`stop-marker-${marker.type}`}
          />
        ))}

        {/* Real-time bus positions for trip routes */}
        {isTripPreviewMode && tripVehicles.map((vehicle) => (
          <WebBusMarker
            key={vehicle.id}
            vehicle={vehicle}
            color={getRouteColor(vehicle.routeId)}
            routeLabel={getRouteLabel(vehicle)}
            snapPath={getVehicleSnapPath(vehicle)}
          />
        ))}

        {/* Map tap marker */}
        {mapTapLocation && (
          <WebHtmlMarker
            coordinate={mapTapLocation}
            html={buildMapTapMarkerHtml()}
            className="map-tap-marker"
          />
        )}
      </WebMapView>

      {/* Inline loading indicator while transit data loads */}
      {isLoadingStatic && (
        <View style={styles.loadingBanner}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingBannerText}>Loading transit data...</Text>
        </View>
      )}

      {/* Map Tap Popup for "Choose on Map" feature */}
      <MapTapPopup
        visible={!!mapTapLocation}
        coordinate={mapTapLocation}
        address={mapTapAddress}
        isLoading={isLoadingAddress}
        onDirectionsFrom={handleDirectionsFrom}
        onDirectionsTo={handleDirectionsTo}
        onClose={handleCloseMapTapPopup}
      />

      {/* Trip Planning Header or Normal Header */}
      {isTripPlanningMode ? (
        <TripSearchHeaderWeb
          fromText={tripFromText}
          toText={tripToText}
          onFromChange={searchFromAddress}
          onToChange={searchToAddress}
          onFromSelect={selectFromSuggestion}
          onToSelect={selectToSuggestion}
          fromSuggestions={fromSuggestions}
          toSuggestions={toSuggestions}
          showFromSuggestions={showFromSuggestions}
          showToSuggestions={showToSuggestions}
          isTypingFrom={isTypingFrom}
          isTypingTo={isTypingTo}
          onSwap={swapTripLocations}
          onClose={exitTripPlanningMode}
          onUseCurrentLocation={useCurrentLocationForTrip}
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
      ) : !selectedStop ? (
        <>
          {/* Where to? Search Bar with autocomplete */}
          <View style={styles.header}>
            <AddressAutocomplete
              value={whereToText}
              onChangeText={setWhereToText}
              onSelect={handleWhereToSelect}
              placeholder="Where to?"
              icon={<SearchIcon size={18} color={COLORS.grey500} />}
              style={styles.whereToAutocomplete}
              inputStyle={styles.whereToInput}
              rightIcon={
                <View style={styles.headerRight}>
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

          {/* Post-trip survey nudge */}
          <SurveyNudgeBanner
            onTakeSurvey={() => navigation.getParent()?.navigate('Profile', { screen: 'Survey', params: { trigger: 'post_trip' } })}
          />

          {/* Detour Banner */}
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
            alertBannerVisible={serviceAlerts && serviceAlerts.length > 0}
            routes={routes}
          />
          <MapViewModeToggle
            visible={canUseDetourView}
            mode={mapViewMode}
            onChange={setMapViewMode}
            detourCount={activeDetourRouteIds.size}
            alertBannerVisible={serviceAlerts && serviceAlerts.length > 0}
          />

          {/* Center Map Button - Top Right */}
          <TouchableOpacity
            style={styles.centerButton}
            onPress={centerOnUserLocationOnce}
            accessibilityRole="button"
            accessibilityLabel="Center on my location"
          >
            <CenterIcon size={18} color={COLORS.textPrimary} />
          </TouchableOpacity>

          {/* Route Filter - Collapsible Left Side Panel */}
          {!routePanelExpanded && (
            <TouchableOpacity style={styles.routePanelPill} onPress={toggleRoutePanel}>
              <BusIcon size={14} color={COLORS.textSecondary} />
              <Text style={styles.routePanelPillText}>Routes{hasSelection ? ` (${selectedRoutes.size})` : ''}</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.filterPanel, !routePanelExpanded && styles.filterPanelCollapsed]}>
            <View style={styles.filterPanelHeader}>
              <Text style={styles.filterPanelTitle}>Routes</Text>
              <TouchableOpacity onPress={toggleRoutePanel} style={styles.filterPanelClose}>
                <Text style={styles.filterPanelCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            {serviceAlerts.length > 0 && (
              <TouchableOpacity
                style={styles.alertsHeaderChip}
                onPress={() => navigation.navigate('Alerts')}
              >
                <AlertIcon size={12} color={COLORS.warning} />
                <Text style={styles.alertsHeaderText}>{serviceAlerts.length}</Text>
              </TouchableOpacity>
            )}
            {/* Zones Toggle */}
            {Object.keys(onDemandZones || {}).length > 0 && (
              <TouchableOpacity
                style={[styles.filterChip, showZones && styles.filterChipActive]}
                onPress={() => setShowZones(z => !z)}
              >
                <Text style={[styles.filterChipText, showZones && styles.filterChipTextActive]}>
                  Zones
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.filterChip, selectedRoutes.size === 0 && styles.filterChipActive]}
              onPress={() => handleRouteSelect(null)}
            >
              <Text style={[styles.filterChipText, selectedRoutes.size === 0 && styles.filterChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {[...routes]
              .sort((a, b) => {
                const numA = parseInt(a.shortName, 10);
                const numB = parseInt(b.shortName, 10);
                if (!isNaN(numA) && !isNaN(numB)) {
                  return numB - numA;
                }
                return b.shortName.localeCompare(a.shortName);
              })
              .map((r) => {
                const routeColor = getRouteColor(r.id);
                const isActive = selectedRoutes.has(r.id);
                const routeAlerts = getRouteAlerts(r.id);
                const hasAlert = routeAlerts.length > 0;
                return (
                  <View key={r.id} style={styles.filterChipWrapper}>
                    <TouchableOpacity
                      style={[
                        styles.filterChip,
                        isActive && { backgroundColor: routeColor, borderColor: routeColor },
                        hasAlert && !isActive && styles.filterChipWithAlert,
                      ]}
                      onPress={() => handleRouteSelect(r.id)}
                      onLongPress={() => hasAlert && setExpandedAlertRoute(expandedAlertRoute === r.id ? null : r.id)}
                    >
                      <View style={[styles.filterDot, { backgroundColor: isActive ? COLORS.white : routeColor }]} />
                      <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                        {r.shortName}
                      </Text>
                      {isRouteDetouring(r.id) && (
                        <View style={[styles.detourIndicator, isActive && styles.detourIndicatorActive]} />
                      )}
                      {hasAlert && (
                        <View style={[styles.alertIndicator, isActive && styles.alertIndicatorActive]}>
                          <AlertIcon size={10} color={isActive ? COLORS.white : COLORS.warning} />
                        </View>
                      )}
                    </TouchableOpacity>
                    {/* Expandable Alert Details */}
                    {expandedAlertRoute === r.id && hasAlert && (
                      <TouchableOpacity
                        style={styles.routeAlertPopup}
                        onPress={() => navigation.navigate('Alerts')}
                      >
                        <Text style={styles.routeAlertTitle} numberOfLines={2}>
                          {routeAlerts[0].title}
                        </Text>
                        <Text style={styles.routeAlertEffect}>{routeAlerts[0].effect}</Text>
                        <Text style={styles.routeAlertTapHint}>Tap for details</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
          </View>
        </>
      ) : null}

      {/* Favorite Stop Quick View */}
      {!isTripPlanningMode && !selectedStop && (
        <FavoriteStopCard
          onPress={(stop) => {
            setSelectedStop(stop);
            setShowStops(true);
          }}
        />
      )}

      {/* Bottom Action Bar - unified frosted card */}
      {!isTripPlanningMode && !selectedStop && (
        <View style={styles.bottomActionBar}>
          <View style={styles.bottomActionCard}>
            {/* Stops Toggle - Ghost style when inactive */}
            <TouchableOpacity
              style={[styles.bottomActionButton, showStops && styles.bottomActionButtonActive]}
              onPress={() => setShowStops(!showStops)}
              activeOpacity={0.8}
            >
              {showStops
                ? <StopIconFilled size={18} color={COLORS.white} />
                : <StopIconOutline size={18} color={COLORS.grey600} />
              }
            </TouchableOpacity>

            {/* Plan Trip Button - Primary CTA */}
            <TouchableOpacity
              style={styles.planTripButton}
              onPress={enterTripPlanningMode}
              activeOpacity={0.8}
            >
              <DirectionsIcon size={28} color={COLORS.white} />
              <Text style={styles.planTripButtonText}>Plan Trip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Trip Bottom Sheet - show whenever in trip planning mode (matches native) */}
      {isTripPlanningMode && (
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
            const fitCoords = ((selectedDetour.segments?.length
              ? selectedDetour.segments
              : [{
                entryPoint: selectedDetour.entryPoint ?? null,
                exitPoint: selectedDetour.exitPoint ?? null,
              }]) ?? [])
              .flatMap((segment) => {
                const coords = [];
                if (segment?.entryPoint) {
                  coords.push({
                    latitude: segment.entryPoint.latitude || segment.entryPoint.lat,
                    longitude: segment.entryPoint.longitude || segment.entryPoint.lon,
                  });
                }
                if (segment?.exitPoint) {
                  coords.push({
                    latitude: segment.exitPoint.latitude || segment.exitPoint.lat,
                    longitude: segment.exitPoint.longitude || segment.exitPoint.lon,
                  });
                }
                return coords;
              });
            if (fitCoords.length > 0) {
              mapRef.current?.fitToCoordinates(
                fitCoords,
                { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: true }
              );
            }
            setDetourSheetRouteId(null);
          }}
        />
      )}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Loading banner (inline on map)
  loadingBanner: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    gap: SPACING.xs,
    zIndex: 1001,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  loadingBannerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  // Error State
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.xl,
  },
  errorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xxl,
    alignItems: 'center',
    boxShadow: '0 8px 32px rgba(23, 43, 77, 0.12)',
    maxWidth: 360,
  },
  errorIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.errorSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  errorIcon: {
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.error,
  },
  errorTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  errorDetail: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.round,
    minWidth: 160,
    alignItems: 'center',
    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // Search Bar Header
  header: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    right: SPACING.sm,
    zIndex: 1000,
  },
  whereToAutocomplete: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: 2,
    paddingLeft: SPACING.sm,
    paddingRight: SPACING.sm,
    boxShadow: '0 2px 12px rgba(23, 43, 77, 0.12)',
  },
  whereToInput: {
    backgroundColor: 'transparent',
    height: 40,
    fontSize: FONT_SIZES.md,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
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
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.success,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusBadgeOffline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grey200,
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    gap: 4,
  },
  statusDotOffline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.grey500,
  },
  statusTextOffline: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.grey600,
    textTransform: 'uppercase',
  },

  // Route Panel - Collapsed Pill
  routePanelPill: {
    position: 'absolute',
    top: 72,
    left: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    boxShadow: '0 2px 12px rgba(23, 43, 77, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.grey200,
    zIndex: 998,
    cursor: 'pointer',
  },
  routePanelPillText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // Route Filter - Left Side Panel
  filterPanel: {
    position: 'absolute',
    top: 72,
    left: SPACING.sm,
    width: 130,
    maxHeight: 'calc(100% - 170px)',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.xs,
    zIndex: 998,
    boxShadow: '0 4px 20px rgba(23, 43, 77, 0.12)',
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.grey200,
    overflowY: 'auto',
    overflowX: 'visible',
    transition: 'opacity 0.25s ease, transform 0.25s ease',
  },
  filterPanelCollapsed: {
    opacity: 0,
    transform: [{ translateX: -20 }],
    pointerEvents: 'none',
    maxHeight: 0,
    overflow: 'hidden',
  },
  filterPanelHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  filterPanelClose: {
    padding: SPACING.xs,
    cursor: 'pointer',
  },
  filterPanelCloseText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  filterPanelTitle: {
    textAlign: 'center',
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.grey100,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 3,
    minWidth: 48,
    minHeight: 30,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)',
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  filterChipWrapper: {
    position: 'relative',
  },
  filterChipWithAlert: {
    borderColor: COLORS.warning,
    borderWidth: 1.5,
  },
  alertIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.warningSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  alertIndicatorActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  detourIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF8C00',
    marginLeft: 4,
  },
  detourIndicatorActive: {
    backgroundColor: 'white',
  },
  alertsHeaderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.warningSubtle,
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    gap: 3,
    marginBottom: SPACING.xs,
  },
  alertsHeaderText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.warning,
  },
  routeAlertPopup: {
    position: 'absolute',
    left: 64,
    top: 0,
    width: 180,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
    boxShadow: '0 4px 16px rgba(23, 43, 77, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.warning,
    zIndex: 1001,
  },
  routeAlertTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  routeAlertEffect: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.warning,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  routeAlertTapHint: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },

  // Center Map Button - Bottom Left
  centerButton: {
    position: 'absolute',
    bottom: SPACING.xl,
    left: SPACING.sm,
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 2px 8px rgba(23, 43, 77, 0.10)',
    zIndex: 999,
    borderWidth: 1,
    borderColor: COLORS.grey200,
    cursor: 'pointer',
  },

  // Bottom Action Bar - unified card
  bottomActionBar: {
    position: 'absolute',
    bottom: SPACING.xl,
    left: 80,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  bottomActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    backdropFilter: 'blur(16px)',
    borderRadius: BORDER_RADIUS.round,
    padding: SPACING.xs,
    boxShadow: '0 4px 24px rgba(23, 43, 77, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(235, 236, 240, 0.8)',
    gap: SPACING.md,
  },
  bottomActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.grey300,
  },
  bottomActionButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  planTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.ctaGreen,
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    gap: 8,
    boxShadow: '0 4px 16px rgba(46, 125, 50, 0.35)',
  },
  planTripButtonText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
    letterSpacing: 0.2,
  },

  // Trip Planning Header
  tripPlanHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    zIndex: 1001,
    boxShadow: '0 2px 12px rgba(23, 43, 77, 0.1)',
  },
  tripPlanHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  tripPlanTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.xxs,
  },
  tripInputDot: {
    width: 22,
    alignItems: 'center',
    paddingTop: 10,
    marginRight: SPACING.xs,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotConnector: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.grey300,
    marginTop: 2,
  },
  tripInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripInput: {
    flex: 1,
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    borderWidth: 2,
    borderColor: 'transparent',
    outlineWidth: 0,
  },
  locationBtn: {
    marginLeft: SPACING.xs,
    width: 36,
    height: 36,
    backgroundColor: COLORS.primarySubtle,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: '100%',
    left: 28,
    right: 0,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.xs,
    maxHeight: 220,
    boxShadow: '0 8px 24px rgba(23, 43, 77, 0.15)',
    zIndex: 1002,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.grey200,
  },
  suggestionItem: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grey100,
  },
  suggestionText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textPrimary,
  },
  suggestionDistance: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  swapBtn: {
    alignSelf: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.round,
    marginTop: SPACING.xxs,
  },
  swapBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
  },

});

export default HomeScreen;
