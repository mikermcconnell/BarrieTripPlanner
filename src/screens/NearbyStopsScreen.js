import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as Location from 'expo-location';
import { useTransit } from '../context/TransitContext';
import { getNearbyStops } from '../services/arrivalService';
import { formatDistance, formatMinutes } from '../services/tripService';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

const NearbyStopsScreen = ({ navigation }) => {
  const { stops, isLoadingStatic } = useTransit();
  const [nearbyStops, setNearbyStops] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadNearbyStops = useCallback(async () => {
    try {
      setError(null);

      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission is required to find nearby stops');
        setIsLoading(false);
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      // Find nearby stops (within 1km, max 20)
      const nearby = getNearbyStops(
        stops,
        location.coords.latitude,
        location.coords.longitude,
        1000,
        20
      );

      setNearbyStops(nearby);
    } catch (err) {
      console.error('Error loading nearby stops:', err);
      setError('Unable to get your location');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [stops]);

  useEffect(() => {
    if (!isLoadingStatic && stops.length > 0) {
      loadNearbyStops();
    }
  }, [isLoadingStatic, stops.length, loadNearbyStops]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadNearbyStops();
  };

  const renderStopItem = ({ item }) => (
    <TouchableOpacity
      style={styles.stopItem}
      onPress={() => {
        // Navigate to map and select this stop
        navigation.navigate('Map', { screen: 'MapMain', params: { selectedStopId: item.id } });
      }}
    >
      <View style={styles.stopIcon}>
        <Text style={styles.stopIconText}>🚏</Text>
      </View>
      <View style={styles.stopContent}>
        <Text style={styles.stopName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.stopCode}>Stop #{item.code}</Text>
      </View>
      <View style={styles.distanceContainer}>
        <Text style={styles.distance}>{formatDistance(item.distance)}</Text>
        <Text style={styles.walkTime}>~{formatMinutes(Math.ceil(item.distance / 80))} walk</Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoadingStatic || isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nearby Stops</Text>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Finding stops near you...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nearby Stops</Text>
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>📍</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadNearbyStops}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nearby Stops</Text>
        {userLocation && (
          <Text style={styles.headerSubtitle}>
            Found {nearbyStops.length} stops within 1km
          </Text>
        )}
      </View>

      <FlatList
        data={nearbyStops}
        keyExtractor={(item) => item.id}
        renderItem={renderStopItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🚌</Text>
            <Text style={styles.emptyText}>No stops nearby</Text>
            <Text style={styles.emptySubtext}>
              There are no transit stops within 1km of your location
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  errorText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
  },
  retryButtonText: {
    color: COLORS.white,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.small,
  },
  stopIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  stopIconText: {
    fontSize: 22,
  },
  stopContent: {
    flex: 1,
  },
  stopName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  stopCode: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  distanceContainer: {
    alignItems: 'flex-end',
  },
  distance: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  walkTime: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
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
    textAlign: 'center',
  },
});

export default NearbyStopsScreen;
