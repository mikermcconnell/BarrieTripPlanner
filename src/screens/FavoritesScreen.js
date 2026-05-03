import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import Icon from '../components/Icon';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';

const FavoritesScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const {
    favorites,
    savedPlaces,
    savedTrips,
    removeFavoriteStop,
    removeFavoriteRoute,
    removeSavedPlace,
    removeSavedTrip,
    touchSavedPlace,
    touchSavedTrip,
    isAuthenticated,
  } = useAuth();
  const [activeTab, setActiveTab] = useState('places');

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Transit</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>⭐</Text>
          <Text style={styles.emptyText}>Sign in to save My Transit</Text>
          <Text style={styles.emptySubtext}>Your places, trips, stops, and routes will be saved here</Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => navigation.navigate('SignIn')}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderStopItem = ({ item }) => (
    <View style={styles.favoriteItem}>
      <View style={styles.itemIcon}>
        <Icon name="BusStop" size={20} color={COLORS.textSecondary} />
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{item.name}</Text>
        <Text style={styles.itemSubtitle}>Stop #{item.code}</Text>
      </View>
      <TouchableOpacity style={styles.removeButton} onPress={() => removeFavoriteStop(item.id)}>
        <Text style={styles.removeButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRouteItem = ({ item }) => (
    <View style={styles.favoriteItem}>
      <View style={[styles.routeIcon, { backgroundColor: item.color || COLORS.primary }]}>
        <Text style={styles.routeIconText}>{item.shortName}</Text>
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{item.longName || `Route ${item.shortName}`}</Text>
        <Text style={styles.itemSubtitle}>Route {item.shortName}</Text>
      </View>
      <TouchableOpacity style={styles.removeButton} onPress={() => removeFavoriteRoute(item.id)}>
        <Text style={styles.removeButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  const planSavedTrip = (trip) => {
    touchSavedTrip?.(trip.id);
    navigation.getParent()?.navigate('Map', {
      screen: 'MapMain',
      params: { savedTripToPlan: trip },
    });
  };

  const useSavedPlace = (place) => {
    touchSavedPlace?.(place.id);
    navigation.getParent()?.navigate('Map', {
      screen: 'MapMain',
      params: {
        selectedCoordinate: { latitude: place.lat, longitude: place.lon },
        selectedAddressLabel: place.name || place.addressText,
      },
    });
  };

  const confirmRemove = (title, onRemove) => {
    Alert.alert(title, 'This removes it from My Transit.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onRemove },
    ]);
  };

  const renderPlaceItem = ({ item }) => (
    <View style={styles.favoriteItem}>
      <View style={styles.itemIcon}>
        <Icon name={item.icon || 'MapPin'} size={20} color={COLORS.primary} />
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{item.name || 'Saved place'}</Text>
        <Text style={styles.itemSubtitle} numberOfLines={1}>{item.addressText}</Text>
      </View>
      <TouchableOpacity style={styles.useButton} onPress={() => useSavedPlace(item)}>
        <Text style={styles.useButtonText}>View</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => confirmRemove('Remove saved place?', () => removeSavedPlace(item.id))}
      >
        <Text style={styles.removeButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTripItem = ({ item }) => (
    <View style={styles.favoriteItem}>
      <View style={styles.itemIcon}>
        <Icon name={item.icon || 'Route'} size={20} color={COLORS.primary} />
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{item.name || 'Saved trip'}</Text>
        <Text style={styles.itemSubtitle} numberOfLines={1}>
          {item.from?.name || 'Start'} → {item.to?.name || 'Destination'}
        </Text>
      </View>
      <TouchableOpacity style={styles.useButton} onPress={() => planSavedTrip(item)}>
        <Text style={styles.useButtonText}>Plan</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => confirmRemove('Remove saved trip?', () => removeSavedTrip(item.id))}
      >
        <Text style={styles.removeButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  const tabs = [
    { key: 'places', label: 'Places', count: savedPlaces.length },
    { key: 'trips', label: 'Trips', count: savedTrips.length },
    { key: 'stops', label: 'Stops', count: favorites.stops.length },
    { key: 'routes', label: 'Routes', count: favorites.routes.length },
  ];

  const activeData = activeTab === 'places'
    ? savedPlaces
    : activeTab === 'trips'
      ? savedTrips
      : activeTab === 'stops'
        ? favorites.stops
        : favorites.routes;

  const renderActiveItem = activeTab === 'places'
    ? renderPlaceItem
    : activeTab === 'trips'
      ? renderTripItem
      : activeTab === 'stops'
        ? renderStopItem
        : renderRouteItem;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Transit</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.tabContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label} ({tab.count})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={activeData}
        keyExtractor={(item) => item.id}
        renderItem={renderActiveItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: addSafeBottomPadding(SPACING.xl, bottomInset) },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyListContainer}>
            <Icon name="Bus" size={48} color={COLORS.grey400} style={{ marginBottom: SPACING.md }} />
            <Text style={styles.emptyListText}>
              No saved {activeTab} yet
            </Text>
            <Text style={styles.emptyListSubtext}>
              Save common places, trips, stops, and routes for quick access
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  tabContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  tab: {
    flexBasis: '25%',
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  favoriteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.small,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  itemIconText: {
    fontSize: 22,
  },
  routeIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  routeIconText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: FONT_SIZES.md,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  useButton: {
    paddingVertical: 7,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primarySubtle,
    marginRight: SPACING.xs,
  },
  useButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  signInButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
  },
  signInButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  emptyListContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyListIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyListText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  emptyListSubtext: {
    fontSize: FONT_SIZES.md,
    color: COLORS.grey500,
  },
});

export default FavoritesScreen;
