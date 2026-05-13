/**
 * useTripPlanner Hook
 *
 * Extracts all trip planning state and logic shared between
 * HomeScreen.js (native) and HomeScreen.web.js into a single hook.
 *
 * Both platforms consume this hook and only add platform-specific
 * rendering (Leaflet vs react-native-maps).
 */

import { useReducer, useCallback, useRef, useEffect } from 'react';
import { planTripAuto, TripPlanningError, TRIP_ERROR_CODES } from '../services/tripService';
import { autocompleteAddress, reverseGeocode, getDistanceFromBarrie } from '../services/locationIQService';
import { validateTripInputs } from '../utils/tripValidation';
import { annotateItinerariesWithDetours } from '../utils/tripDetourImpacts';
import { sortRecommendedItineraryFirst } from '../utils/tripItineraryRanking';
import logger from '../utils/logger';

// ─── Action Types ─────────────────────────────────────────────────
const SET_FROM = 'SET_FROM';
const SET_TO = 'SET_TO';
const SET_FROM_TEXT = 'SET_FROM_TEXT';
const SET_TO_TEXT = 'SET_TO_TEXT';
const SWAP = 'SWAP';
const SEARCH_START = 'SEARCH_START';
const SEARCH_SUCCESS = 'SEARCH_SUCCESS';
const SEARCH_ERROR = 'SEARCH_ERROR';
const SELECT_ITINERARY = 'SELECT_ITINERARY';
const RESET = 'RESET';
const SET_FROM_SUGGESTIONS = 'SET_FROM_SUGGESTIONS';
const SET_TO_SUGGESTIONS = 'SET_TO_SUGGESTIONS';
const SHOW_FROM_SUGGESTIONS = 'SHOW_FROM_SUGGESTIONS';
const SHOW_TO_SUGGESTIONS = 'SHOW_TO_SUGGESTIONS';
const SET_PLANNING_MODE = 'SET_PLANNING_MODE';
const SET_ERROR = 'SET_ERROR';
const SET_TIME_MODE = 'SET_TIME_MODE';
const SET_DEPARTURE_TIME = 'SET_DEPARTURE_TIME';
const SET_FROM_TYPING = 'SET_FROM_TYPING';
const SET_TO_TYPING = 'SET_TO_TYPING';
const CLEAR_RESULTS = 'CLEAR_RESULTS';
const SET_FROM_USES_CURRENT_LOCATION = 'SET_FROM_USES_CURRENT_LOCATION';
const CURRENT_LOCATION_START = 'CURRENT_LOCATION_START';
const CURRENT_LOCATION_SUCCESS = 'CURRENT_LOCATION_SUCCESS';
const CURRENT_LOCATION_ERROR = 'CURRENT_LOCATION_ERROR';

// ─── Initial State ────────────────────────────────────────────────
const initialState = {
  isTripPlanningMode: false,
  from: null,         // { lat, lon }
  to: null,           // { lat, lon }
  fromUsesCurrentLocation: false,
  isLocatingFrom: false,
  fromText: '',
  toText: '',
  itineraries: [],
  selectedIndex: 0,
  isLoading: false,
  error: null,
  hasSearched: false,
  fromSuggestions: [],
  toSuggestions: [],
  showFromSuggestions: false,
  showToSuggestions: false,
  isTypingFrom: false,
  isTypingTo: false,
  timeMode: 'now',          // 'now' | 'departAt' | 'arriveBy'
  selectedTime: null,       // Date object or null (null = use current time)
};

const clearResults = (state) => ({
  ...state,
  itineraries: [],
  selectedIndex: 0,
  isLoading: false,
  error: null,
  hasSearched: false,
});

// ─── Reducer ──────────────────────────────────────────────────────
function tripReducer(state, action) {
  switch (action.type) {
    case SET_PLANNING_MODE:
      return { ...state, isTripPlanningMode: action.payload };
    case SET_FROM:
      return { ...state, from: action.payload };
    case SET_FROM_USES_CURRENT_LOCATION:
      return {
        ...state,
        fromUsesCurrentLocation: action.payload,
        isLocatingFrom: action.payload ? state.isLocatingFrom : false,
      };
    case SET_TO:
      return { ...state, to: action.payload };
    case SET_FROM_TEXT:
      return { ...state, fromText: action.payload };
    case SET_TO_TEXT:
      return { ...state, toText: action.payload };
    case SWAP:
      return {
        ...state,
        from: state.to,
        to: state.from,
        fromUsesCurrentLocation: false,
        fromText: state.toText,
        toText: state.fromText,
      };
    case SEARCH_START:
      return {
        ...state,
        isLoading: true,
        error: null,
        itineraries: [],
        hasSearched: true,
      };
    case SEARCH_SUCCESS: {
      const sortedItineraries = sortRecommendedItineraryFirst(action.payload);
      return {
        ...state,
        isLoading: false,
        itineraries: sortedItineraries,
        selectedIndex: 0,
        error: sortedItineraries.length === 0 ? 'No routes found for this trip' : null,
      };
    }
    case SEARCH_ERROR:
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };
    case SELECT_ITINERARY:
      return { ...state, selectedIndex: action.payload };
    case RESET:
      return { ...initialState };
    case SET_FROM_SUGGESTIONS:
      return { ...state, fromSuggestions: action.payload };
    case SET_TO_SUGGESTIONS:
      return { ...state, toSuggestions: action.payload };
    case SHOW_FROM_SUGGESTIONS:
      return { ...state, showFromSuggestions: action.payload };
    case SHOW_TO_SUGGESTIONS:
      return { ...state, showToSuggestions: action.payload };
    case SET_ERROR: {
      const isTripPlanningError = !!(action.payload && typeof action.payload === 'object' && action.payload.code);
      return {
        ...state,
        itineraries: [],
        selectedIndex: 0,
        isLoading: false,
        isLocatingFrom: false,
        error: action.payload,
        hasSearched: isTripPlanningError,
      };
    }
    case SET_TIME_MODE:
      return {
        ...state,
        timeMode: action.payload,
        selectedTime: action.payload === 'now' ? null : (state.selectedTime || new Date()),
      };
    case SET_DEPARTURE_TIME:
      return { ...state, selectedTime: action.payload };
    case SET_FROM_TYPING:
      return { ...state, isTypingFrom: action.payload };
    case SET_TO_TYPING:
      return { ...state, isTypingTo: action.payload };
    case CLEAR_RESULTS:
      return clearResults(state);
    case CURRENT_LOCATION_START:
      return {
        ...state,
        from: null,
        fromUsesCurrentLocation: true,
        fromText: 'Finding your location…',
        isLocatingFrom: true,
        itineraries: [],
        selectedIndex: 0,
        isLoading: false,
        error: null,
        hasSearched: false,
        fromSuggestions: [],
        showFromSuggestions: false,
        isTypingFrom: false,
      };
    case CURRENT_LOCATION_SUCCESS:
      return {
        ...state,
        from: action.payload,
        fromUsesCurrentLocation: true,
        fromText: 'Current Location',
        isLocatingFrom: false,
      };
    case CURRENT_LOCATION_ERROR:
      return {
        ...state,
        from: null,
        fromUsesCurrentLocation: false,
        fromText: '',
        isLocatingFrom: false,
        itineraries: [],
        selectedIndex: 0,
        isLoading: false,
        error: 'Could not get your location',
        hasSearched: false,
      };
    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────

/**
 * @param {Object} options
 * @param {Function} [options.ensureRoutingData] - Async function that lazily builds and returns routing data
 * @param {Function} [options.onItinerariesReady] - Callback after successful search (e.g. fit map bounds)
 * @param {Function} [options.onTripPlanned] - Callback after a successful trip search to persist history
 * @param {Function} [options.applyDelays] - Optional function to apply real-time delays to itineraries
 * @param {Object} [options.delayOptions] - Optional live context passed into delay enrichment
 * @param {Object} [options.activeDetours] - Active detour feed keyed by route
 * @param {Object} [options.detourStopDetailsByRouteId] - Derived skipped/affected stop details keyed by route
 */
export const useTripPlanner = ({
  ensureRoutingData,
  onItinerariesReady,
  onTripPlanned,
  applyDelays,
  delayOptions,
  onDemandZones,
  stops,
  activeDetours = {},
  detourStopDetailsByRouteId = {},
} = {}) => {
  const [state, dispatch] = useReducer(tripReducer, initialState);
  const fromDebounceRef = useRef(null);
  const toDebounceRef = useRef(null);
  const fromRequestSeqRef = useRef(0);
  const toRequestSeqRef = useRef(0);
  const tripSearchSeqRef = useRef(0);
  const locationRequestSeqRef = useRef(0);

  const invalidateTripSearches = useCallback(() => {
    tripSearchSeqRef.current += 1;
  }, []);

  const cancelCurrentLocationUpdates = useCallback(() => {
    locationRequestSeqRef.current += 1;
    dispatch({ type: SET_FROM_USES_CURRENT_LOCATION, payload: false });
  }, []);

  // ─── Search ──────────────────────────────────────────────────
  const searchTrips = useCallback(async (from, to) => {
    if (!from || !to) return;

    const validation = validateTripInputs({ from, to, onDemandZones });
    if (!validation.valid) {
      invalidateTripSearches();
      const errorCode = TRIP_ERROR_CODES[validation.errorCode] || TRIP_ERROR_CODES.VALIDATION_ERROR;
      dispatch({
        type: SET_ERROR,
        payload: new TripPlanningError(errorCode, validation.errorMessage),
      });
      return;
    }

    const requestSeq = ++tripSearchSeqRef.current;
    dispatch({ type: SEARCH_START });

    try {
      // Lazily build routing data on first trip search
      let routing = null;
      if (ensureRoutingData) {
        try {
          routing = await ensureRoutingData();
        } catch {
          // Continue without local routing — OTP fallback
        }
      }

      const tripTime = state.timeMode === 'now' ? new Date() : (state.selectedTime || new Date());
      const result = await planTripAuto({
        fromLat: from.lat,
        fromLon: from.lon,
        toLat: to.lat,
        toLon: to.lon,
        date: tripTime,
        time: tripTime,
        arriveBy: state.timeMode === 'arriveBy',
        routingData: routing,
        enrichWalking: true, // Fetch walking geometry for the preview map; navigation can reuse it
        onDemandZones,
        stops,
      });

      if (requestSeq !== tripSearchSeqRef.current) return;

      let finalItineraries = result.itineraries;
      const routingDiagnostics = result.routingDiagnostics || {};

      // Apply real-time delays if the platform provides the function
      if (applyDelays && finalItineraries.length > 0) {
        try {
          finalItineraries = await applyDelays(finalItineraries, delayOptions);
        } catch {
          // Continue without delay info
        }
      }

      if (requestSeq !== tripSearchSeqRef.current) return;

      finalItineraries = annotateItinerariesWithDetours(
        finalItineraries,
        activeDetours,
        detourStopDetailsByRouteId
      );

      dispatch({ type: SEARCH_SUCCESS, payload: finalItineraries });
      logger.info('Trip planning completed', {
        resultsCount: finalItineraries.length,
        timeMode: state.timeMode,
        routingDiagnostics,
      });

      // Track successful trip planning
      try {
        const { trackEvent } = require('../services/analyticsService');
        trackEvent('trip_planned', {
          results_count: finalItineraries.length,
          time_mode: state.timeMode,
          routing_source: routingDiagnostics.source || 'unknown',
          fallback_from: routingDiagnostics.fallbackFrom || 'none',
          fallback_reason: routingDiagnostics.fallbackReason || 'none',
          used_mock: routingDiagnostics.usedMock ? 'true' : 'false',
          zone_adjusted: routingDiagnostics.zoneAdjusted ? 'true' : 'false',
        });
      } catch {}

      if (onItinerariesReady && finalItineraries.length > 0) {
        onItinerariesReady(finalItineraries[0]);
      }

      if (onTripPlanned && finalItineraries.length > 0) {
        Promise.resolve(onTripPlanned({
          from: {
            ...from,
            name: state.fromText || 'Start',
          },
          to: {
            ...to,
            name: state.toText || 'Destination',
          },
          itineraries: finalItineraries,
        })).catch((error) => {
          logger.warn('Could not save trip history', { message: error?.message || String(error) });
        });
      }
    } catch (err) {
      if (requestSeq !== tripSearchSeqRef.current) return;
      const errorCode = err instanceof TripPlanningError ? err.code : 'UNEXPECTED_ERROR';
      if (err instanceof TripPlanningError) {
        logger.warn('Trip planning search failed', {
          code: errorCode,
          message: err?.message || 'Unknown trip planning error',
        });
      } else {
        logger.error('Error searching trips:', err);
      }
      logger.warn('Trip planning failed', {
        code: errorCode,
        message: err?.message || 'Unknown trip planning error',
        timeMode: state.timeMode,
      });
      try {
        const { trackEvent } = require('../services/analyticsService');
        trackEvent('trip_planning_failed', {
          code: errorCode,
          time_mode: state.timeMode,
        });
      } catch {}
      if (err instanceof TripPlanningError) {
        // Preserve full error object so TripErrorDisplay can render rich UI
        dispatch({ type: SEARCH_ERROR, payload: err });
      } else {
        dispatch({ type: SEARCH_ERROR, payload: err.message || 'Could not find routes. Please try again.' });
      }
    }
  }, [ensureRoutingData, onItinerariesReady, onTripPlanned, applyDelays, delayOptions, activeDetours, detourStopDetailsByRouteId, state.timeMode, state.selectedTime, state.fromText, state.toText, onDemandZones, stops, invalidateTripSearches]);

  // ─── Address search (debounced) ──────────────────────────────
  const searchFromAddress = useCallback((text) => {
    cancelCurrentLocationUpdates();
    invalidateTripSearches();
    dispatch({ type: SET_FROM_USES_CURRENT_LOCATION, payload: false });
    dispatch({ type: SET_FROM_TEXT, payload: text });
    dispatch({ type: SET_FROM, payload: null });
    dispatch({ type: CLEAR_RESULTS });
    if (fromDebounceRef.current) clearTimeout(fromDebounceRef.current);
    if (text.length < 3) {
      fromRequestSeqRef.current += 1;
      dispatch({ type: SET_FROM_SUGGESTIONS, payload: [] });
      dispatch({ type: SHOW_FROM_SUGGESTIONS, payload: false });
      dispatch({ type: SET_FROM_TYPING, payload: false });
      return;
    }
    dispatch({ type: SET_FROM_TYPING, payload: true });
    fromDebounceRef.current = setTimeout(async () => {
      const requestSeq = ++fromRequestSeqRef.current;
      try {
        const results = await autocompleteAddress(text);
        if (requestSeq !== fromRequestSeqRef.current) return;
        const sorted = results.sort(
          (a, b) => getDistanceFromBarrie(a.lat, a.lon) - getDistanceFromBarrie(b.lat, b.lon)
        );
        dispatch({ type: SET_FROM_SUGGESTIONS, payload: sorted });
        dispatch({ type: SHOW_FROM_SUGGESTIONS, payload: sorted.length > 0 });
        dispatch({ type: SET_FROM_TYPING, payload: false });
      } catch {
        dispatch({ type: SET_FROM_TYPING, payload: false });
      }
    }, 300);
  }, [cancelCurrentLocationUpdates, invalidateTripSearches]);

  const searchToAddress = useCallback((text) => {
    invalidateTripSearches();
    dispatch({ type: SET_TO_TEXT, payload: text });
    dispatch({ type: SET_TO, payload: null });
    dispatch({ type: CLEAR_RESULTS });
    if (toDebounceRef.current) clearTimeout(toDebounceRef.current);
    if (text.length < 3) {
      toRequestSeqRef.current += 1;
      dispatch({ type: SET_TO_SUGGESTIONS, payload: [] });
      dispatch({ type: SHOW_TO_SUGGESTIONS, payload: false });
      dispatch({ type: SET_TO_TYPING, payload: false });
      return;
    }
    dispatch({ type: SET_TO_TYPING, payload: true });
    toDebounceRef.current = setTimeout(async () => {
      const requestSeq = ++toRequestSeqRef.current;
      try {
        const results = await autocompleteAddress(text);
        if (requestSeq !== toRequestSeqRef.current) return;
        const sorted = results.sort(
          (a, b) => getDistanceFromBarrie(a.lat, a.lon) - getDistanceFromBarrie(b.lat, b.lon)
        );
        dispatch({ type: SET_TO_SUGGESTIONS, payload: sorted });
        dispatch({ type: SHOW_TO_SUGGESTIONS, payload: sorted.length > 0 });
        dispatch({ type: SET_TO_TYPING, payload: false });
      } catch {
        dispatch({ type: SET_TO_TYPING, payload: false });
      }
    }, 300);
  }, [invalidateTripSearches]);

  // ─── Suggestion selection ────────────────────────────────────
  const selectFromSuggestion = useCallback((item) => {
    const loc = { lat: item.lat, lon: item.lon };
    cancelCurrentLocationUpdates();
    fromRequestSeqRef.current += 1;
    invalidateTripSearches();
    dispatch({ type: SET_FROM_USES_CURRENT_LOCATION, payload: false });
    dispatch({ type: SET_FROM_TEXT, payload: item.shortName });
    dispatch({ type: SET_FROM, payload: loc });
    dispatch({ type: SET_FROM_SUGGESTIONS, payload: [] });
    dispatch({ type: SHOW_FROM_SUGGESTIONS, payload: false });
    // Auto-search if both locations set
    if (state.to) {
      searchTrips(loc, state.to);
      return;
    }
    dispatch({ type: CLEAR_RESULTS });
  }, [state.to, searchTrips, cancelCurrentLocationUpdates, invalidateTripSearches]);

  const selectToSuggestion = useCallback((item) => {
    const loc = { lat: item.lat, lon: item.lon };
    toRequestSeqRef.current += 1;
    invalidateTripSearches();
    dispatch({ type: SET_TO_TEXT, payload: item.shortName });
    dispatch({ type: SET_TO, payload: loc });
    dispatch({ type: SET_TO_SUGGESTIONS, payload: [] });
    dispatch({ type: SHOW_TO_SUGGESTIONS, payload: false });
    if (state.from) {
      searchTrips(state.from, loc);
      return;
    }
    dispatch({ type: CLEAR_RESULTS });
  }, [state.from, searchTrips, invalidateTripSearches]);

  // ─── Swap ────────────────────────────────────────────────────
  const swap = useCallback(() => {
    const nextFrom = state.to;
    const nextTo = state.from;
    cancelCurrentLocationUpdates();
    invalidateTripSearches();
    dispatch({ type: SWAP });
    if (nextFrom && nextTo) {
      searchTrips(nextFrom, nextTo);
      return;
    }
    dispatch({ type: CLEAR_RESULTS });
  }, [state.from, state.to, searchTrips, cancelCurrentLocationUpdates, invalidateTripSearches]);

  // ─── Set locations directly (e.g. from map tap) ──────────────
  const setFrom = useCallback((location, text, options = {}) => {
    cancelCurrentLocationUpdates();
    invalidateTripSearches();
    dispatch({ type: SET_FROM_USES_CURRENT_LOCATION, payload: false });
    dispatch({ type: SET_FROM, payload: location });
    if (text) dispatch({ type: SET_FROM_TEXT, payload: text });
    if (options.suppressAutoSearch) {
      dispatch({ type: CLEAR_RESULTS });
      return;
    }
    if (state.to && location) {
      searchTrips(location, state.to);
      return;
    }
    dispatch({ type: CLEAR_RESULTS });
  }, [state.to, searchTrips, cancelCurrentLocationUpdates, invalidateTripSearches]);

  const setTo = useCallback((location, text, options = {}) => {
    invalidateTripSearches();
    dispatch({ type: SET_TO, payload: location });
    if (text) dispatch({ type: SET_TO_TEXT, payload: text });
    if (options.suppressAutoSearch) {
      dispatch({ type: CLEAR_RESULTS });
      return;
    }
    if (state.from && location) {
      searchTrips(state.from, location);
      return;
    }
    dispatch({ type: CLEAR_RESULTS });
  }, [state.from, searchTrips, invalidateTripSearches]);

  const setFromText = useCallback((text) => {
    cancelCurrentLocationUpdates();
    invalidateTripSearches();
    dispatch({ type: SET_FROM_USES_CURRENT_LOCATION, payload: false });
    dispatch({ type: SET_FROM_TEXT, payload: text });
    dispatch({ type: SET_FROM, payload: null });
    dispatch({ type: CLEAR_RESULTS });
  }, [cancelCurrentLocationUpdates, invalidateTripSearches]);

  const setToText = useCallback((text) => {
    invalidateTripSearches();
    dispatch({ type: SET_TO_TEXT, payload: text });
    dispatch({ type: SET_TO, payload: null });
    dispatch({ type: CLEAR_RESULTS });
  }, [invalidateTripSearches]);

  // ─── Select itinerary ────────────────────────────────────────
  const selectItinerary = useCallback((index) => {
    dispatch({ type: SELECT_ITINERARY, payload: index });
  }, []);

  // ─── Time mode control ──────────────────────────────────────
  const setTimeMode = useCallback((mode) => {
    dispatch({ type: SET_TIME_MODE, payload: mode });
  }, []);

  const setSelectedTime = useCallback((time) => {
    dispatch({ type: SET_DEPARTURE_TIME, payload: time });
  }, []);

  // ─── Mode control ───────────────────────────────────────────
  const enterPlanningMode = useCallback(() => {
    dispatch({ type: SET_PLANNING_MODE, payload: true });
  }, []);

  const reset = useCallback(() => {
    if (fromDebounceRef.current) clearTimeout(fromDebounceRef.current);
    if (toDebounceRef.current) clearTimeout(toDebounceRef.current);
    fromRequestSeqRef.current += 1;
    toRequestSeqRef.current += 1;
    locationRequestSeqRef.current += 1;
    invalidateTripSearches();
    dispatch({ type: RESET });
  }, [invalidateTripSearches]);

  useEffect(() => {
    return () => {
      if (fromDebounceRef.current) clearTimeout(fromDebounceRef.current);
      if (toDebounceRef.current) clearTimeout(toDebounceRef.current);
      fromRequestSeqRef.current += 1;
      toRequestSeqRef.current += 1;
      tripSearchSeqRef.current += 1;
      locationRequestSeqRef.current += 1;
    };
  }, []);

  // ─── Use current location ───────────────────────────────────
  const useCurrentLocation = useCallback(async (getCurrentPosition, options = {}) => {
    const requestSeq = ++locationRequestSeqRef.current;
    dispatch({ type: CURRENT_LOCATION_START });
    try {
      const coords = await getCurrentPosition();
      if (requestSeq !== locationRequestSeqRef.current) return;
      const loc = { lat: coords.lat, lon: coords.lon };
      invalidateTripSearches();
      dispatch({ type: CURRENT_LOCATION_SUCCESS, payload: loc });

      const destination = options.searchTo || state.to;
      if (destination) {
        searchTrips(loc, destination);
      } else {
        dispatch({ type: CLEAR_RESULTS });
      }

      reverseGeocode(loc.lat, loc.lon)
        .then((address) => {
          if (requestSeq !== locationRequestSeqRef.current) return;
          dispatch({ type: SET_FROM_TEXT, payload: address?.shortName || 'Current Location' });
        })
        .catch(() => {
          if (requestSeq !== locationRequestSeqRef.current) return;
          dispatch({ type: SET_FROM_TEXT, payload: 'Current Location' });
        });
    } catch {
      if (requestSeq !== locationRequestSeqRef.current) return;
      invalidateTripSearches();
      dispatch({ type: CURRENT_LOCATION_ERROR });
    }
  }, [state.to, searchTrips, invalidateTripSearches]);

  return {
    state,
    dispatch,
    searchTrips,
    searchFromAddress,
    searchToAddress,
    selectFromSuggestion,
    selectToSuggestion,
    swap,
    setFrom,
    setTo,
    setFromText,
    setToText,
    selectItinerary,
    enterPlanningMode,
    reset,
    useCurrentLocation,
    setTimeMode,
    setSelectedTime,
    cancelCurrentLocationUpdates,
  };
};
