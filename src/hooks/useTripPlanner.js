/**
 * useTripPlanner Hook
 *
 * Extracts all trip planning state and logic shared between
 * HomeScreen.js (native) and HomeScreen.web.js into a single hook.
 *
 * Both platforms consume this hook and only add platform-specific
 * rendering (Leaflet vs react-native-maps).
 */

import { useReducer, useCallback, useRef } from 'react';
import { planTripAuto, TripPlanningError } from '../services/tripService';
import { autocompleteAddress, reverseGeocode, getDistanceFromBarrie } from '../services/locationIQService';
import { validateTripInputs } from '../utils/tripValidation';

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

// ─── Initial State ────────────────────────────────────────────────
const initialState = {
  isTripPlanningMode: false,
  from: null,         // { lat, lon }
  to: null,           // { lat, lon }
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
};

// ─── Reducer ──────────────────────────────────────────────────────
function tripReducer(state, action) {
  switch (action.type) {
    case SET_PLANNING_MODE:
      return { ...state, isTripPlanningMode: action.payload };
    case SET_FROM:
      return { ...state, from: action.payload };
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
    case SEARCH_SUCCESS:
      return {
        ...state,
        isLoading: false,
        itineraries: action.payload,
        selectedIndex: 0,
        error: action.payload.length === 0 ? 'No routes found for this trip' : null,
      };
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
    case SET_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────

/**
 * @param {Object} options
 * @param {Object|null} options.routingData - RAPTOR routing data from TransitContext
 * @param {boolean} options.isRoutingReady - Whether local routing data is loaded
 * @param {Function} [options.onItinerariesReady] - Callback after successful search (e.g. fit map bounds)
 * @param {Function} [options.applyDelays] - Optional function to apply real-time delays to itineraries
 */
export const useTripPlanner = ({
  routingData,
  isRoutingReady,
  onItinerariesReady,
  applyDelays,
} = {}) => {
  const [state, dispatch] = useReducer(tripReducer, initialState);
  const fromDebounceRef = useRef(null);
  const toDebounceRef = useRef(null);

  // ─── Search ──────────────────────────────────────────────────
  const searchTrips = useCallback(async (from, to) => {
    if (!from || !to) return;

    const validation = validateTripInputs({ from, to });
    if (!validation.valid) {
      dispatch({ type: SET_ERROR, payload: validation.errorMessage });
      return;
    }

    dispatch({ type: SEARCH_START });

    try {
      const result = await planTripAuto({
        fromLat: from.lat,
        fromLon: from.lon,
        toLat: to.lat,
        toLon: to.lon,
        date: new Date(),
        time: new Date(),
        arriveBy: false,
        routingData: isRoutingReady ? routingData : null,
        enrichWalking: false, // Skip walking API calls for preview; enrich on navigation start
      });

      let finalItineraries = result.itineraries;

      // Apply real-time delays if the platform provides the function
      if (applyDelays && finalItineraries.length > 0) {
        try {
          finalItineraries = await applyDelays(finalItineraries);
        } catch {
          // Continue without delay info
        }
      }

      dispatch({ type: SEARCH_SUCCESS, payload: finalItineraries });

      if (onItinerariesReady && finalItineraries.length > 0) {
        onItinerariesReady(finalItineraries[0]);
      }
    } catch (err) {
      console.error('Error searching trips:', err);
      const message = err instanceof TripPlanningError
        ? err.message
        : (err.message || 'Could not find routes. Please try again.');
      dispatch({ type: SEARCH_ERROR, payload: message });
    }
  }, [routingData, isRoutingReady, onItinerariesReady, applyDelays]);

  // ─── Address search (debounced) ──────────────────────────────
  const searchFromAddress = useCallback((text) => {
    dispatch({ type: SET_FROM_TEXT, payload: text });
    if (fromDebounceRef.current) clearTimeout(fromDebounceRef.current);
    if (text.length < 3) {
      dispatch({ type: SET_FROM_SUGGESTIONS, payload: [] });
      dispatch({ type: SHOW_FROM_SUGGESTIONS, payload: false });
      return;
    }
    fromDebounceRef.current = setTimeout(async () => {
      try {
        const results = await autocompleteAddress(text);
        const sorted = results.sort(
          (a, b) => getDistanceFromBarrie(a.lat, a.lon) - getDistanceFromBarrie(b.lat, b.lon)
        );
        dispatch({ type: SET_FROM_SUGGESTIONS, payload: sorted });
        dispatch({ type: SHOW_FROM_SUGGESTIONS, payload: sorted.length > 0 });
      } catch {
        // Silently fail — user can still manually select
      }
    }, 300);
  }, []);

  const searchToAddress = useCallback((text) => {
    dispatch({ type: SET_TO_TEXT, payload: text });
    if (toDebounceRef.current) clearTimeout(toDebounceRef.current);
    if (text.length < 3) {
      dispatch({ type: SET_TO_SUGGESTIONS, payload: [] });
      dispatch({ type: SHOW_TO_SUGGESTIONS, payload: false });
      return;
    }
    toDebounceRef.current = setTimeout(async () => {
      try {
        const results = await autocompleteAddress(text);
        const sorted = results.sort(
          (a, b) => getDistanceFromBarrie(a.lat, a.lon) - getDistanceFromBarrie(b.lat, b.lon)
        );
        dispatch({ type: SET_TO_SUGGESTIONS, payload: sorted });
        dispatch({ type: SHOW_TO_SUGGESTIONS, payload: sorted.length > 0 });
      } catch {
        // Silently fail
      }
    }, 300);
  }, []);

  // ─── Suggestion selection ────────────────────────────────────
  const selectFromSuggestion = useCallback((item) => {
    const loc = { lat: item.lat, lon: item.lon };
    dispatch({ type: SET_FROM_TEXT, payload: item.shortName });
    dispatch({ type: SET_FROM, payload: loc });
    dispatch({ type: SET_FROM_SUGGESTIONS, payload: [] });
    dispatch({ type: SHOW_FROM_SUGGESTIONS, payload: false });
    // Auto-search if both locations set
    if (state.to) searchTrips(loc, state.to);
  }, [state.to, searchTrips]);

  const selectToSuggestion = useCallback((item) => {
    const loc = { lat: item.lat, lon: item.lon };
    dispatch({ type: SET_TO_TEXT, payload: item.shortName });
    dispatch({ type: SET_TO, payload: loc });
    dispatch({ type: SET_TO_SUGGESTIONS, payload: [] });
    dispatch({ type: SHOW_TO_SUGGESTIONS, payload: false });
    if (state.from) searchTrips(state.from, loc);
  }, [state.from, searchTrips]);

  // ─── Swap ────────────────────────────────────────────────────
  const swap = useCallback(() => {
    dispatch({ type: SWAP });
  }, []);

  // ─── Set locations directly (e.g. from map tap) ──────────────
  const setFrom = useCallback((location, text) => {
    dispatch({ type: SET_FROM, payload: location });
    if (text) dispatch({ type: SET_FROM_TEXT, payload: text });
    if (state.to && location) searchTrips(location, state.to);
  }, [state.to, searchTrips]);

  const setTo = useCallback((location, text) => {
    dispatch({ type: SET_TO, payload: location });
    if (text) dispatch({ type: SET_TO_TEXT, payload: text });
    if (state.from && location) searchTrips(state.from, location);
  }, [state.from, searchTrips]);

  // ─── Select itinerary ────────────────────────────────────────
  const selectItinerary = useCallback((index) => {
    dispatch({ type: SELECT_ITINERARY, payload: index });
  }, []);

  // ─── Mode control ───────────────────────────────────────────
  const enterPlanningMode = useCallback(() => {
    dispatch({ type: SET_PLANNING_MODE, payload: true });
  }, []);

  const reset = useCallback(() => {
    if (fromDebounceRef.current) clearTimeout(fromDebounceRef.current);
    if (toDebounceRef.current) clearTimeout(toDebounceRef.current);
    dispatch({ type: RESET });
  }, []);

  // ─── Use current location ───────────────────────────────────
  const useCurrentLocation = useCallback(async (getCurrentPosition) => {
    try {
      const coords = await getCurrentPosition();
      const loc = { lat: coords.lat, lon: coords.lon };
      dispatch({ type: SET_FROM, payload: loc });

      try {
        const address = await reverseGeocode(loc.lat, loc.lon);
        dispatch({ type: SET_FROM_TEXT, payload: address?.shortName || 'Current Location' });
      } catch {
        dispatch({ type: SET_FROM_TEXT, payload: 'Current Location' });
      }

      if (state.to) searchTrips(loc, state.to);
    } catch {
      dispatch({ type: SET_ERROR, payload: 'Could not get your location' });
    }
  }, [state.to, searchTrips]);

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
    selectItinerary,
    enterPlanningMode,
    reset,
    useCurrentLocation,
  };
};
