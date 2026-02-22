import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { planTripAuto, TripPlanningError } from '../services/tripService';
import { reverseGeocode } from '../services/locationIQService';
import logger from '../utils/logger';
import { applyDelaysToItineraries } from '../services/tripDelayService';
import { useTransit } from '../context/TransitContext';
import TripCard from '../components/TripCard';
import TripErrorDisplay from '../components/TripErrorDisplay';
import TimePicker from '../components/TimePicker';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { MAP_CONFIG } from '../config/constants';

const TripPlannerScreen = ({ navigation }) => {
  const { routingData, isRoutingReady } = useTransit();
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromLocation, setFromLocation] = useState(null);
  const [toLocation, setToLocation] = useState(null);
  const [departureTime, setDepartureTime] = useState(new Date());
  const [timeMode, setTimeMode] = useState('depart');
  const [itineraries, setItineraries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Use current location with reverse geocoding
  const useCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission required');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        lat: location.coords.latitude,
        lon: location.coords.longitude,
      };

      setFromLocation(coords);

      // Try to get address for current location
      try {
        const address = await reverseGeocode(coords.lat, coords.lon);
        if (address && address.shortName) {
          setFromText(address.shortName);
        } else {
          setFromText('Current Location');
        }
      } catch {
        // Fallback if reverse geocoding fails
        setFromText('Current Location');
      }
    } catch (err) {
      console.error('Error getting location:', err);
      setError('Could not get your location');
    }
  }, []);

  // Search for trips
  const searchTrips = useCallback(async () => {
    if (!fromLocation && !fromText) {
      setError('Please enter a starting point');
      return;
    }
    if (!toLocation && !toText) {
      setError('Please enter a destination');
      return;
    }

    setIsLoading(true);
    setError(null);
    setItineraries([]);

    try {
      // Use entered locations or default to downtown Barrie for demo
      const from = fromLocation || {
        lat: MAP_CONFIG.INITIAL_REGION.latitude,
        lon: MAP_CONFIG.INITIAL_REGION.longitude,
      };
      const to = toLocation || {
        lat: MAP_CONFIG.DOWNTOWN_TERMINAL.latitude + 0.02,
        lon: MAP_CONFIG.DOWNTOWN_TERMINAL.longitude + 0.01,
      };

      const result = await planTripAuto({
        fromLat: from.lat,
        fromLon: from.lon,
        toLat: to.lat,
        toLon: to.lon,
        date: departureTime,
        time: departureTime,
        arriveBy: timeMode === 'arrive',
        routingData: isRoutingReady ? routingData : null,
        enrichWalking: false, // Skip walking API calls for preview; enrich on navigation start
      });

      // Apply real-time delays to itineraries
      let itinerariesWithDelays = result.itineraries;
      try {
        itinerariesWithDelays = await applyDelaysToItineraries(result.itineraries);
      } catch (delayErr) {
        logger.warn('Could not apply delays:', delayErr);
        // Continue without delay info
      }

      setItineraries(itinerariesWithDelays);

      if (itinerariesWithDelays.length === 0) {
        setError(new TripPlanningError('NO_ROUTES_FOUND', 'No routes found for this trip'));
      }
    } catch (err) {
      console.error('Error searching trips:', err);
      if (err instanceof TripPlanningError) {
        setError(err);
      } else {
        setError(new TripPlanningError('NETWORK_ERROR', err.message || 'Could not find routes'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [fromLocation, toLocation, fromText, toText, departureTime, timeMode, routingData, isRoutingReady]);

  // Handle time change
  const handleTimeChange = (time, mode) => {
    setDepartureTime(time);
    setTimeMode(mode);
  };

  // View trip details
  const viewTripDetails = (itinerary) => {
    navigation.navigate('TripDetails', { itinerary });
  };

  // Swap from and to
  const swapLocations = () => {
    const tempText = fromText;
    const tempLocation = fromLocation;
    setFromText(toText);
    setFromLocation(toLocation);
    setToText(tempText);
    setToLocation(tempLocation);
  };

  // Handle "From" location selection from autocomplete
  const handleFromSelect = (location) => {
    setFromLocation({
      lat: location.lat,
      lon: location.lon,
    });
  };

  // Handle "To" location selection from autocomplete
  const handleToSelect = (location) => {
    setToLocation({
      lat: location.lat,
      lon: location.lon,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Plan Your Trip</Text>
        </View>

        {/* Search Form */}
        <View style={styles.searchForm}>
          {/* From Input with Autocomplete */}
          <View style={[styles.inputRow, { zIndex: 2 }]}>
            <AddressAutocomplete
              value={fromText}
              onChangeText={setFromText}
              onSelect={handleFromSelect}
              placeholder="From (starting point)"
              icon={<View style={styles.fromDot} />}
              rightIcon={
                <TouchableOpacity style={styles.locationButton} onPress={useCurrentLocation}>
                  <Text style={styles.locationButtonText}>📍</Text>
                </TouchableOpacity>
              }
              style={styles.autocompleteContainer}
            />
          </View>

          {/* Swap Button */}
          <TouchableOpacity style={styles.swapButton} onPress={swapLocations}>
            <Text style={styles.swapButtonText}>⇅</Text>
          </TouchableOpacity>

          {/* To Input with Autocomplete */}
          <View style={[styles.inputRow, { zIndex: 1 }]}>
            <AddressAutocomplete
              value={toText}
              onChangeText={setToText}
              onSelect={handleToSelect}
              placeholder="To (destination)"
              icon={<View style={styles.toDot} />}
              style={styles.autocompleteContainer}
            />
          </View>

          {/* Time Picker */}
          <TimePicker value={departureTime} onChange={handleTimeChange} mode={timeMode} />

          {/* Search Button */}
          <TouchableOpacity
            style={[styles.searchButton, isLoading && styles.searchButtonDisabled]}
            onPress={searchTrips}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.searchButtonText}>Find Routes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Error Message */}
        {error && (
          error.code ? (
            <TripErrorDisplay error={error} onRetry={searchTrips} />
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{typeof error === 'string' ? error : error.message}</Text>
            </View>
          )
        )}

        {/* Results */}
        <FlatList
          data={itineraries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TripCard
              itinerary={item}
              onPress={() => viewTripDetails(item)}
            />
          )}
          contentContainerStyle={styles.resultsList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            !isLoading &&
            !error && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🚌</Text>
                <Text style={styles.emptyText}>Enter your trip details above</Text>
                <Text style={styles.emptySubtext}>We'll find the best routes for you</Text>
              </View>
            )
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  searchForm: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.small,
  },
  inputRow: {
    marginBottom: SPACING.sm,
  },
  autocompleteContainer: {
    flex: 1,
  },
  fromDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.success,
  },
  toDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.error,
  },
  locationButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.xs,
  },
  locationButtonText: {
    fontSize: 20,
  },
  swapButton: {
    position: 'absolute',
    right: SPACING.md + 50,
    top: SPACING.md + 44 - 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 10,
  },
  swapButtonText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  searchButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  searchButtonDisabled: {
    backgroundColor: COLORS.grey400,
  },
  searchButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  errorContainer: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.error + '20',
    borderRadius: BORDER_RADIUS.md,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
  },
  resultsList: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.md,
    color: COLORS.grey500,
  },
});

export default TripPlannerScreen;
