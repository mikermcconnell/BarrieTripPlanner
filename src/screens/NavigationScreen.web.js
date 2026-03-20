/**
 * NavigationScreen (Web Version)
 *
 * Web-compatible turn-by-turn navigation using MapLibre maps.
 * Falls back to browser geolocation API.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from '../utils/logger';

import { MAP_CONFIG } from '../config/constants';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

// Navigation components
import NavigationHeader from '../components/navigation/NavigationHeader';
import WalkingInstructionCard from '../components/navigation/WalkingInstructionCard';
import BusProximityCard from '../components/navigation/BusProximityCard';
import BoardingInstructionCard from '../components/navigation/BoardingInstructionCard';
import StepOverviewSheet from '../components/navigation/StepOverviewSheet';
import ExitConfirmationModal from '../components/navigation/ExitConfirmationModal';
import TransitStopGuideCard from '../components/navigation/TransitStopGuideCard';

// Hooks
import { useNavigationLocation } from '../hooks/useNavigationLocation';
import { useNavigationTripViewModel } from '../hooks/useNavigationTripViewModel';
import { useBusProximity } from '../hooks/useBusProximity';
import { useStepProgress } from '../hooks/useStepProgress';

// Walking enrichment (fetched on navigation start, not during preview)
import { enrichItineraryWithWalking } from '../services/walkingService';
import { recalculateNavigationItinerary } from '../services/navigationRecalculationService';
import { decodePolyline, extractShapeSegment, findClosestPointIndex } from '../utils/polylineUtils';
import { pointToPolylineDistance } from '../utils/geometryUtils';
import { escapeHtml } from '../utils/htmlUtils';
import {
  collectItineraryViewportCoordinates,
  computeCoordinateBounds,
  distanceToBoundsMeters,
} from '../utils/itineraryViewport';
import { buildTransitStopProgress } from '../utils/transitStopUtils';
import { buildWalkingLandmarkMarkers } from '../utils/navigationMapMarkers';
import {
  buildCurrentStepBusPreviewLine,
  buildRoutePathsByRouteId,
  getVehicleSnapPath,
} from '../utils/navigationBusPreview';

// Context for route shapes
import { useTransitStatic, useTransitRealtime } from '../context/TransitContext';
import Icon from '../components/Icon';
import TripViewportControls from '../components/TripViewportControls';
import WebMapView, { WebBusMarker, WebHtmlMarker, WebRoutePolyline } from '../components/WebMapView';

const MAX_NAVIGATION_LOCATION_DISTANCE_FROM_TRIP_METERS = 25000;
const GOOGLE_WALK_BLUE = '#4285F4';

const trackNavigationEvent = (eventName, params) => {
  try {
    const { trackEvent } = require('../services/analyticsService');
    trackEvent(eventName, params);
  } catch {}
};

const buildNavMarkerHtml = (marker) => {
  const type = marker?.type;

  const glyphByType = {
    'walk-start': `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="6" stroke="white" stroke-width="2.5" fill="none"></circle>
        <circle cx="12" cy="12" r="2.5" fill="white"></circle>
      </svg>
    `,
    'walk-current': '',
    'walk-target-stop': `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="5" y="7" width="14" height="8" rx="2" fill="${GOOGLE_WALK_BLUE}"></rect>
        <rect x="7" y="9" width="4" height="3" rx="0.5" fill="white"></rect>
        <rect x="13" y="9" width="4" height="3" rx="0.5" fill="white"></rect>
        <circle cx="8.5" cy="17.5" r="1.4" fill="${GOOGLE_WALK_BLUE}"></circle>
        <circle cx="15.5" cy="17.5" r="1.4" fill="${GOOGLE_WALK_BLUE}"></circle>
      </svg>
    `,
    'walk-target-destination': `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 20C12 20 17 14.8 17 11.4C17 8.5 14.9 6.5 12 6.5C9.1 6.5 7 8.5 7 11.4C7 14.8 12 20 12 20Z" fill="white"></path>
        <circle cx="12" cy="11.3" r="2" fill="${COLORS.error}"></circle>
      </svg>
    `,
    'bus-stop': `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="5" y="7" width="14" height="8" rx="2" fill="white"></rect>
        <rect x="7" y="9" width="4" height="3" rx="0.5" fill="${COLORS.secondary}"></rect>
        <rect x="13" y="9" width="4" height="3" rx="0.5" fill="${COLORS.secondary}"></rect>
        <circle cx="8.5" cy="17.5" r="1.4" fill="white"></circle>
        <circle cx="15.5" cy="17.5" r="1.4" fill="white"></circle>
      </svg>
    `,
    'transit-next-stop': `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="5" y="7" width="14" height="8" rx="2" fill="white"></rect>
        <rect x="7" y="9" width="4" height="3" rx="0.5" fill="${COLORS.secondary}"></rect>
        <rect x="13" y="9" width="4" height="3" rx="0.5" fill="${COLORS.secondary}"></rect>
        <circle cx="8.5" cy="17.5" r="1.4" fill="white"></circle>
        <circle cx="15.5" cy="17.5" r="1.4" fill="white"></circle>
      </svg>
    `,
    'transit-intermediate-stop': `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="5" y="7" width="14" height="8" rx="2" fill="white"></rect>
        <rect x="7" y="9" width="4" height="3" rx="0.5" fill="${COLORS.info}"></rect>
        <rect x="13" y="9" width="4" height="3" rx="0.5" fill="${COLORS.info}"></rect>
        <circle cx="8.5" cy="17.5" r="1.4" fill="white"></circle>
        <circle cx="15.5" cy="17.5" r="1.4" fill="white"></circle>
      </svg>
    `,
    'transit-alight-stop': `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 20C12 20 17 14.8 17 11.4C17 8.5 14.9 6.5 12 6.5C9.1 6.5 7 8.5 7 11.4C7 14.8 12 20 12 20Z" fill="white"></path>
        <rect x="8.2" y="10.1" width="7.6" height="4.8" rx="1.2" fill="${COLORS.error}"></rect>
        <rect x="9.4" y="11.1" width="2.1" height="1.4" rx="0.3" fill="white"></rect>
        <rect x="12.5" y="11.1" width="2.1" height="1.4" rx="0.3" fill="white"></rect>
      </svg>
    `,
  };

  const configByType = {
    origin: { background: COLORS.success, size: 24, halo: null, glyph: '' },
    destination: { background: COLORS.error, size: 24, halo: null, glyph: '' },
    waypoint: { background: COLORS.warning, size: 18, halo: null, glyph: '' },
    user: { background: COLORS.secondary, size: 24, halo: 'rgba(0, 102, 204, 0.16)', glyph: '' },
    'walk-start': { background: COLORS.success, size: 30, halo: 'rgba(76, 175, 80, 0.18)', glyph: glyphByType['walk-start'] },
    'walk-current': { background: GOOGLE_WALK_BLUE, size: 22, halo: 'rgba(66, 133, 244, 0.22)', glyph: glyphByType['walk-current'], border: '#FFFFFF', borderWidth: 4 },
    'walk-target-stop': { background: COLORS.white, size: 36, halo: 'rgba(66, 133, 244, 0.18)', glyph: glyphByType['walk-target-stop'], border: GOOGLE_WALK_BLUE },
    'walk-target-destination': { background: COLORS.error, size: 30, halo: null, glyph: glyphByType['walk-target-destination'] },
    'bus-stop': { background: COLORS.secondary, size: 32, halo: 'rgba(0, 102, 204, 0.14)', glyph: glyphByType['bus-stop'] },
    'transit-next-stop': { background: COLORS.secondary, size: 34, halo: 'rgba(0, 102, 204, 0.18)', glyph: glyphByType['transit-next-stop'] },
    'transit-intermediate-stop': { background: COLORS.info, size: 26, halo: 'rgba(0, 102, 204, 0.14)', glyph: glyphByType['transit-intermediate-stop'] },
    'transit-alight-stop': { background: COLORS.error, size: 34, halo: 'rgba(220, 38, 38, 0.14)', glyph: glyphByType['transit-alight-stop'] },
  };

  const config = configByType[type] || { background: COLORS.primary, size: 24, halo: null, glyph: '' };
  const wrapperSize = config.halo ? config.size + 12 : config.size;
  const borderColor = config.border || 'white';
  const borderWidth = config.borderWidth || 3;
  const coreHtml = type === 'walk-current'
    ? '<div style="width:8px;height:8px;border-radius:50%;background:white;"></div>'
    : (config.glyph || '');

  return `
    <div style="position:relative;width:${wrapperSize}px;height:${wrapperSize}px;display:flex;align-items:center;justify-content:center;">
      ${config.halo ? `<div style="position:absolute;width:${wrapperSize}px;height:${wrapperSize}px;border-radius:50%;background:${config.halo};"></div>` : ''}
      <div style="
        position:relative;
        width:${config.size}px;
        height:${config.size}px;
        background:${config.background};
        border:${borderWidth}px solid ${borderColor};
        border-radius:50%;
        box-shadow:0 4px 10px rgba(15,23,42,0.22);
        display:flex;
        align-items:center;
        justify-content:center;
      ">
        ${coreHtml}
      </div>
    </div>
  `;
};

const positionToCoordinate = (position) => ({
  latitude: position[0],
  longitude: position[1],
});

const buildRegionForLocation = (latitude, longitude, currentRegion = MAP_CONFIG.INITIAL_REGION) => ({
  latitude,
  longitude,
  latitudeDelta: currentRegion.latitudeDelta || MAP_CONFIG.INITIAL_REGION.latitudeDelta,
  longitudeDelta: currentRegion.longitudeDelta || MAP_CONFIG.INITIAL_REGION.longitudeDelta,
});

const NavigationScreen = ({ route }) => {
  const navigation = useNavigation();

  const initialItinerary = route.params?.itinerary;
  const [itinerary, setItinerary] = useState(initialItinerary);

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

  // Get route shapes and realtime vehicles from TransitContext
  const { shapes, routeShapeMapping, tripMapping, ensureRoutingData, stops } = useTransitStatic();
  const { vehicles, onDemandZones } = useTransitRealtime();

  const mapRef = useRef(null);
  const [isFollowMode, setIsFollowMode] = useState(false); // Start with trip overview
  const [isMapReady, setIsMapReady] = useState(false);
  const [jumpToLocationTrigger, setJumpToLocationTrigger] = useState(0);
  const [showOverviewTrigger, setShowOverviewTrigger] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const offRouteTimerRef = useRef(null);
  const [isHeadingUp, setIsHeadingUp] = useState(false); // Compass/heading-up mode (walking only)
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const [showMissedBusWarning, setShowMissedBusWarning] = useState(false);
  const [isRecalculatingRoute, setIsRecalculatingRoute] = useState(false);
  const staleCheckedRef = useRef(false);
  const missedBusWarningRef = useRef(false);

  // Web location tracking
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
    advanceStep,
    advanceLeg,
    completeLeg,
    boardBus,
    alightBus,
    resetNavigation,
  } = useStepProgress(itinerary, userLocation, null); // Pass null initially, update below
  void resetNavigation;

  useEffect(() => {
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
    totalRemainingDistance,
    transitPeekAheadText,
  } = useNavigationTripViewModel({
    itinerary,
    currentLegIndex,
    currentLeg,
    distanceToDestination,
  });

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
      try {
        const { trackEvent } = require('../services/analyticsService');
        trackEvent('navigation_completed');
      } catch {}
      // Set nudge flag for post-trip survey banner on HomeScreen
      AsyncStorage.setItem('@barrie_transit_show_survey_nudge', 'true').catch(() => {});
      alert('You have arrived at your destination!');
      navigation.goBack();
    }
  }, [isNavigationComplete, navigation]);

  // Auto-advance when sustained high-confidence alighting evidence is present
  useEffect(() => {
    if (!currentTransitLeg) return;
    if (transitStatus === 'on_board' && busProximity?.autoAlightReady) {
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

  // Get polylines for the web map
  const routePolylines = useMemo(() => {
    if (!itinerary?.legs) return [];

    const result = [];

    itinerary.legs.forEach((leg, index) => {
      let coordObjects = []; // {latitude, longitude} objects for split calculation
      const isWalk = leg.mode === 'WALK';
      const isTransit = leg.mode === 'BUS' || leg.mode === 'TRANSIT';

      if (leg.legGeometry?.points) {
        // Use encoded polyline if available (walking legs from walkingService)
        coordObjects = decodePolyline(leg.legGeometry.points);
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

        coordObjects = bestSegment.length > 0
          ? bestSegment
          : [
              { latitude: leg.from.lat, longitude: leg.from.lon },
              { latitude: leg.to.lat, longitude: leg.to.lon },
            ];
      } else if (leg.from && leg.to) {
        // Fallback to straight line
        coordObjects = [
          { latitude: leg.from.lat, longitude: leg.from.lon },
          { latitude: leg.to.lat, longitude: leg.to.lon },
        ];
      }

      const isCurrentLeg = index === currentLegIndex;
      const isCompletedLeg = index < currentLegIndex;
      const isCurrentWalkLeg = isCurrentLeg && isWalk;

      const routeColor = isCompletedLeg
        ? COLORS.grey400
        : isCurrentWalkLeg
        ? GOOGLE_WALK_BLUE
        : isWalk
        ? COLORS.grey500
        : leg.isOnDemand
        ? (leg.zoneColor || COLORS.primary)
        : (leg.route?.color || COLORS.primary);

      const weight = isCurrentWalkLeg ? 6 : isCurrentLeg ? 7 : 4;
      const dashArray = isCurrentWalkLeg ? null : isWalk ? '10, 5' : leg.isOnDemand ? '8, 6' : null;
      const opacity = isCompletedLeg ? 0.28 : isCurrentLeg ? 1 : 0.62;
      const outlineWidth = isCurrentWalkLeg ? 4 : 0;
      const outlineColor = isCurrentWalkLeg ? COLORS.white : undefined;

      // For the current leg, split at the user's position into completed (grey) and remaining (colored)
      if (isCurrentLeg && userLocation && coordObjects.length > 1) {
        const splitIdx = findClosestPointIndex(
          coordObjects,
          userLocation.latitude,
          userLocation.longitude
        );

        if (splitIdx > 0 && splitIdx < coordObjects.length - 1) {
          // Completed portion: from start up to user position (grey, lower opacity)
          result.push({
            id: `leg-${index}-completed`,
            coordinates: coordObjects.slice(0, splitIdx + 1),
            color: isCurrentWalkLeg ? '#9BBBF9' : '#9E9E9E',
            weight,
            dashArray,
            opacity: 0.5,
            outlineWidth,
            outlineColor,
          });
          // Remaining portion: from user position to end (full route color)
          result.push({
            id: `leg-${index}-remaining`,
            coordinates: coordObjects.slice(splitIdx),
            color: routeColor,
            weight,
            dashArray,
            opacity,
            outlineWidth,
            outlineColor,
          });
          return;
        }
      }

      result.push({
        id: `leg-${index}`,
        coordinates: coordObjects,
        color: routeColor,
        weight,
        dashArray,
        opacity,
        outlineWidth,
        outlineColor,
      });
    });

    return result;
  }, [itinerary, currentLegIndex, userLocation, shapes, routeShapeMapping]);

  // Get markers
  const markers = useMemo(() => {
    if (!itinerary?.legs) return [];

    const result = [];
    const legs = itinerary.legs;

    if (isWalkingLeg && currentLeg?.from && currentLeg?.to) {
      return result;
    }

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
  }, [itinerary, currentLeg, currentLegIndex, isWalkingLeg, userLocation]);

  const walkingLandmarkMarkers = useMemo(() => {
    if (!isWalkingLeg) return [];

    return buildWalkingLandmarkMarkers({
      itinerary,
      currentLeg,
      currentLegIndex,
      nextTransitLeg,
    }).map((marker) => ({
      ...marker,
      position: [marker.latitude, marker.longitude],
      name: marker.title,
    }));
  }, [itinerary, currentLeg, currentLegIndex, isWalkingLeg, nextTransitLeg]);

  // Tracked bus marker (when tracking a bus)
  // Uses direct vehicle context lookup as primary (immediate), with useBusProximity as fallback.
  const trackedBusMarker = useMemo(() => {
    if (!currentTransitLeg) return null;

    const tripId = currentTransitLeg.tripId;
    const routeId = currentTransitLeg.route?.id || currentTransitLeg.routeId;
    let vehicle = null;

    if (tripId) {
      vehicle = vehicles.find(v => v.tripId === tripId);
    }
    if (!vehicle && routeId) {
      const routeVehicles = vehicles.filter(v => v.routeId === routeId);
      vehicle = routeVehicles[0] || null;
    }

    if (!vehicle && busProximity?.vehicle) {
      vehicle = busProximity.vehicle;
    }

    if (!vehicle?.coordinate) return null;

    return {
      id: 'tracked-bus',
      position: [
        vehicle.coordinate.latitude,
        vehicle.coordinate.longitude
      ],
      vehicle: {
        ...vehicle,
        routeId: vehicle.routeId || routeId,
        coordinate: {
          latitude: vehicle.coordinate.latitude,
          longitude: vehicle.coordinate.longitude,
        },
      },
      color: currentTransitLeg.route?.color || COLORS.primary,
      routeId,
      routeShortName: currentTransitLeg.route?.shortName || '?',
      bearing: vehicle.bearing,
      snapPath: getVehicleSnapPath({
        ...vehicle,
        routeId: vehicle.routeId || routeId,
      }, routePathsByRouteId),
    };
  }, [currentTransitLeg, vehicles, busProximity?.vehicle, routePathsByRouteId]);

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

  const transitStopMarkers = useMemo(() => {
    if (!currentTransitLeg) return [];

    const progress = buildTransitStopProgress(
      currentTransitLeg,
      isUserOnBoard ? busProximity.stopsUntilAlighting : null
    );
    const markers = [];
    const nextStop = progress.nextStop;
    const exitStop = progress.alightingStop;

    if (nextStop) {
      markers.push({
        id: `transit-next-${nextStop.id}`,
        position: [nextStop.lat, nextStop.lon],
        type: nextStop.type === 'alighting' ? 'transit-alight-stop' : 'transit-next-stop',
        name: nextStop.stopCode ? `${nextStop.name} (#${nextStop.stopCode})` : nextStop.name,
        caption: nextStop.type === 'alighting' ? 'Get off next' : 'Next stop',
      });
    }

    if (exitStop && exitStop.id !== nextStop?.id) {
      markers.push({
        id: `transit-exit-${exitStop.id}`,
        position: [exitStop.lat, exitStop.lon],
        type: 'transit-alight-stop',
        name: exitStop.stopCode ? `${exitStop.name} (#${exitStop.stopCode})` : exitStop.name,
        caption: 'Your stop',
      });
    }

    return markers;
  }, [currentTransitLeg, isUserOnBoard, busProximity.stopsUntilAlighting]);

  // Bus marker shown during walking legs — looks forward (next transit) then backward (previous)
  const walkingBusMarker = useMemo(() => {
    if (!isWalkingLeg || !itinerary?.legs) return null;

    // Find nearest transit leg: forward first, then backward
    let transitLeg = nextTransitLeg;
    if (!transitLeg) {
      for (let i = currentLegIndex - 1; i >= 0; i--) {
        const leg = itinerary.legs[i];
        if (leg.mode === 'BUS' || leg.mode === 'TRANSIT') { transitLeg = leg; break; }
      }
    }
    if (!transitLeg) return null;

    const tripId = transitLeg.tripId;
    const routeId = transitLeg.route?.id || transitLeg.routeId;
    let vehicle = null;

    if (tripId) {
      vehicle = vehicles.find(v => v.tripId === tripId);
    }
    if (!vehicle && routeId) {
      const routeVehicles = vehicles.filter(v => v.routeId === routeId);
      vehicle = routeVehicles[0] || null;
    }

    if (!vehicle && nextTransitBusProximity?.vehicle) {
      vehicle = nextTransitBusProximity.vehicle;
    }

    if (!vehicle?.coordinate) return null;

    return {
      id: 'walking-bus',
      vehicle: {
        ...vehicle,
        routeId: vehicle.routeId || transitLeg.route?.id || transitLeg.routeId,
        coordinate: {
          latitude: vehicle.coordinate.latitude,
          longitude: vehicle.coordinate.longitude,
        },
      },
      position: [
        vehicle.coordinate.latitude,
        vehicle.coordinate.longitude,
      ],
      color: transitLeg.route?.color || COLORS.primary,
      routeShortName: transitLeg.route?.shortName || '?',
      bearing: vehicle.bearing,
      snapPath: getVehicleSnapPath(
        {
          ...vehicle,
          routeId: vehicle.routeId || transitLeg.route?.id || transitLeg.routeId,
        },
        routePathsByRouteId
      ),
    };
  }, [isWalkingLeg, itinerary, currentLegIndex, nextTransitLeg, routePathsByRouteId, vehicles, nextTransitBusProximity?.vehicle]);

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
      setItinerary(nextItinerary);
      resetNavigation();
      startNavigation();
    } catch (error) {
      logger.error('Navigation reroute failed:', error);
      trackNavigationEvent('navigation_reroute_failed', {
        code: error?.code || 'UNKNOWN_ERROR',
      });
      alert(error.message || 'A new route could not be generated right now.');
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

  // Detect touch device for compass button visibility
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // Follow the user while follow mode is enabled, without changing the current zoom level.
  useEffect(() => {
    if (!isMapReady || !isFollowMode || !userLocation) return;
    const currentRegion = mapRef.current?.getRegion() || MAP_CONFIG.INITIAL_REGION;
    mapRef.current?.animateToRegion(
      buildRegionForLocation(userLocation.latitude, userLocation.longitude, currentRegion),
      500
    );
  }, [isFollowMode, isMapReady, userLocation]);

  // Jump to current location when requested.
  useEffect(() => {
    if (!isMapReady || !jumpToLocationTrigger || !userLocation) return;
    const currentRegion = mapRef.current?.getRegion() || MAP_CONFIG.INITIAL_REGION;
    mapRef.current?.animateToRegion(
      buildRegionForLocation(userLocation.latitude, userLocation.longitude, currentRegion),
      500
    );
  }, [isMapReady, jumpToLocationTrigger, userLocation]);

  // Restore the full trip overview when requested.
  useEffect(() => {
    if (!isMapReady || !showOverviewTrigger || tripViewportCoordinates.length === 0) return;
    mapRef.current?.fitToCoordinates(
      tripViewportCoordinates,
      { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 } }
    );
  }, [isMapReady, showOverviewTrigger, tripViewportCoordinates]);

  // Keep north-up / heading-up behavior using the MapLibre map bearing.
  useEffect(() => {
    if (!isMapReady) return;
    if (isHeadingUp && isWalkingLeg && isTouchDevice) {
      mapRef.current?.setBearing(-(userLocation?.heading ?? 0));
      return;
    }
    mapRef.current?.setBearing(0);
  }, [isHeadingUp, isMapReady, isTouchDevice, isWalkingLeg, userLocation?.heading]);

  const initialRegion = userLocation
    ? buildRegionForLocation(userLocation.latitude, userLocation.longitude, MAP_CONFIG.INITIAL_REGION)
    : MAP_CONFIG.INITIAL_REGION;

  return (
    <View style={styles.container}>
      <WebMapView
        ref={mapRef}
        initialRegion={initialRegion}
        onMapReady={() => setIsMapReady(true)}
      >
        {routePolylines.map((route) => (
          <WebRoutePolyline
            key={route.id}
            coordinates={route.coordinates}
            color={route.color}
            strokeWidth={route.weight}
            dashArray={route.dashArray}
            opacity={route.opacity}
            outlineWidth={route.outlineWidth ?? 0}
            outlineColor={route.outlineColor}
            interactive={false}
          />
        ))}

        {currentStepBusPreviewLine && (
          <WebRoutePolyline
            key={currentStepBusPreviewLine.id}
            coordinates={currentStepBusPreviewLine.coordinates}
            color={currentStepBusPreviewLine.color}
            strokeWidth={3}
            dashArray="8, 6"
            opacity={0.7}
            outlineWidth={0}
            interactive={false}
          />
        )}

        {markers.map((marker) => (
          <WebHtmlMarker
            key={marker.id}
            coordinate={positionToCoordinate(marker.position)}
            html={buildNavMarkerHtml(marker)}
            className={`nav-marker-${marker.type}`}
            zIndexOffset={700}
          />
        ))}

        {walkingLandmarkMarkers.map((marker) => (
          <WebHtmlMarker
            key={marker.id}
            coordinate={positionToCoordinate(marker.position)}
            html={buildNavMarkerHtml({ type: marker.type })}
            className={`nav-marker-${marker.type}`}
            zIndexOffset={760}
            popupHtml={marker.name ? `<strong>${escapeHtml(marker.caption || '')}</strong><br/>${escapeHtml(marker.name)}` : null}
          />
        ))}

        {userLocation && (
          <WebHtmlMarker
            coordinate={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
            html={buildNavMarkerHtml({ type: isWalkingLeg ? 'walk-current' : 'user' })}
            className="nav-marker-user"
            zIndexOffset={900}
          />
        )}

        {busStopMarker && (
          <WebHtmlMarker
            coordinate={positionToCoordinate(busStopMarker.position)}
            html={buildNavMarkerHtml({ type: 'bus-stop' })}
            className="nav-bus-stop-marker"
            zIndexOffset={800}
            popupHtml={busStopMarker.name ? `<strong>${escapeHtml(busStopMarker.name)}</strong>` : null}
          />
        )}

        {transitStopMarkers.map((marker) => (
          <WebHtmlMarker
            key={marker.id}
            coordinate={positionToCoordinate(marker.position)}
            html={buildNavMarkerHtml({ type: marker.type })}
            className={`nav-transit-stop-marker nav-transit-stop-marker-${marker.type}`}
            zIndexOffset={780}
            popupHtml={marker.name ? `<strong>${escapeHtml(marker.caption || '')}</strong><br/>${escapeHtml(marker.name)}` : null}
          />
        ))}

        {trackedBusMarker && (
          <WebBusMarker
            key={trackedBusMarker.id}
            vehicle={{
              ...trackedBusMarker.vehicle,
              id: trackedBusMarker.id,
              label: trackedBusMarker.routeShortName,
            }}
            color={trackedBusMarker.color}
            routeLabel={trackedBusMarker.routeShortName}
            snapPath={trackedBusMarker.snapPath}
          />
        )}

        {walkingBusMarker && (
          <WebBusMarker
            key={walkingBusMarker.id}
            vehicle={{
              id: walkingBusMarker.id,
              routeId: walkingBusMarker.routeShortName,
              label: walkingBusMarker.routeShortName,
              bearing: walkingBusMarker.bearing,
              coordinate: positionToCoordinate(walkingBusMarker.position),
            }}
            color={walkingBusMarker.color}
            routeLabel={walkingBusMarker.routeShortName}
            snapPath={walkingBusMarker.snapPath}
          />
        )}
      </WebMapView>

      {/* GPS Acquisition Overlay */}
      {isAcquiringGPS && (
        <View style={styles.gpsOverlay}>
          <View style={styles.gpsCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
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
      />

      {/* Map control buttons */}
      <View style={styles.mapControls}>
        {/* Compass heading-up toggle — only on touch devices during walking legs */}
        {isWalkingLeg && isTouchDevice && (
          <TouchableOpacity
            style={[styles.mapControlButton, isHeadingUp && styles.mapControlButtonActive]}
            onPress={() => setIsHeadingUp(prev => !prev)}
            accessibilityLabel={isHeadingUp ? 'Switch to north-up' : 'Switch to heading-up'}
          >
            <Text style={styles.mapControlIcon}>🧭</Text>
            <Text style={[styles.mapControlLabel, isHeadingUp && styles.mapControlLabelActive]}>
              {isHeadingUp ? 'Heading Up' : 'North Up'}
            </Text>
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
      <View style={styles.bottomSection}>
        {isTransitLeg && !isOnDemandLeg && (
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

        {isWalkingLeg && (
          <WalkingInstructionCard
            currentStep={currentWalkingStep}
            onNextStep={advanceStep}
            destinationName={currentLeg?.to?.name}
            currentLeg={currentLeg}
            isLastStep={currentStepIndex === (currentLeg?.steps || []).length - 1}
            onNextLeg={advanceLeg}
            currentStepIndex={currentStepIndex}
            totalSteps={(currentLeg?.steps || []).length}
            nextLegPreview={nextLegPreviewText}
          />
        )}

        {/* Bus Proximity Card / Boarding Instruction Card */}
        {isTransitLeg && !isOnDemandLeg && (
          <>
            {transitStatus === 'waiting' && !busProximity.hasArrived ? (
              <BoardingInstructionCard
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
                alightingStopName={currentLeg?.to ? `${currentLeg.to.name}${currentLeg.to.stopCode ? ` (#${currentLeg.to.stopCode})` : ''}` : undefined}
                scheduledDeparture={currentLeg?.startTime}
                isRealtime={currentLeg?.isRealtime || false}
                delaySeconds={currentLeg?.delaySeconds || 0}
                nextLegPreview={transitPeekAheadText}
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
                  onPress={() => {
                    if (typeof window !== 'undefined') {
                      window.open(`tel:${currentLeg.bookingPhone}`, '_self');
                    }
                  }}
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
    paddingBottom: 10,
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
