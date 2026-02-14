/**
 * FavoriteStopCard — Shows next departures from user's top favorited stop.
 * Native version — uses react-native-svg for icons.
 * Only activates polling when the Map tab is focused.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useStopArrivals } from '../hooks/useStopArrivals';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';

const FavoriteStopCard = ({ onPress }) => {
  const { favorites } = useAuth();
  const isFocused = useIsFocused();

  // Only use the first favorited stop
  const favoriteStop = favorites.stops.length > 0 ? favorites.stops[0] : null;

  // Only poll when focused AND we have a favorite stop
  const stop = isFocused && favoriteStop ? favoriteStop : null;
  const { arrivals, isLoading } = useStopArrivals(stop);

  if (!favoriteStop || (!isLoading && arrivals.length === 0)) return null;

  const nextArrivals = arrivals.slice(0, 2);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress?.(favoriteStop)}
      activeOpacity={0.85}
    >
      <View style={styles.header}>
        <Text style={styles.stopName} numberOfLines={1}>
          ⭐ {favoriteStop.name}
        </Text>
        {favoriteStop.code && (
          <Text style={styles.stopCode}>#{favoriteStop.code}</Text>
        )}
      </View>
      {isLoading ? (
        <Text style={styles.loadingText}>Loading...</Text>
      ) : (
        <View style={styles.arrivalsList}>
          {nextArrivals.map((arrival, idx) => (
            <View key={idx} style={styles.arrivalRow}>
              <View style={[styles.routeBadge, { backgroundColor: arrival.routeColor || COLORS.primary }]}>
                <Text style={styles.routeBadgeText}>{arrival.routeShortName || '?'}</Text>
              </View>
              <Text style={styles.arrivalTime}>
                {arrival.minutesUntil <= 0 ? 'Now' : `${arrival.minutesUntil} min`}
              </Text>
              {arrival.delay > 0 && (
                <Text style={styles.delayText}>+{Math.round(arrival.delay / 60)}m</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    zIndex: 998,
    ...SHADOWS.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  stopName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    flex: 1,
  },
  stopCode: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  loadingText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  arrivalsList: {
    gap: SPACING.xs,
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  routeBadge: {
    paddingVertical: 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    minWidth: 36,
    alignItems: 'center',
  },
  routeBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  arrivalTime: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  delayText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.error,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default FavoriteStopCard;
