import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Platform, Alert } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useStopArrivals } from '../hooks/useStopArrivals';
import ArrivalRow from './ArrivalRow';
import Svg, { Path } from 'react-native-svg';
import { shareStop } from '../utils/shareUtils';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../config/theme';

// SVG Icons
const CloseIcon = ({ size = 20, color = COLORS.textSecondary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill={color}/>
  </Svg>
);

const LocationIcon = ({ size = 20, color = COLORS.primary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill={color}/>
  </Svg>
);

const RefreshIcon = ({ size = 20, color = COLORS.white }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M17.65 6.35C16.2 4.9 14.21 4 12 4C7.58 4 4.01 7.58 4.01 12C4.01 16.42 7.58 20 12 20C15.73 20 18.84 17.45 19.73 14H17.65C16.83 16.33 14.61 18 12 18C8.69 18 6 15.31 6 12C6 8.69 8.69 6 12 6C13.66 6 15.14 6.69 16.22 7.78L13 11H20V4L17.65 6.35Z" fill={color}/>
  </Svg>
);

const EmptyIcon = ({ size = 48, color = COLORS.grey400 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M11.99 2C6.47 2 2 6.48 2 12C2 17.52 6.47 22 11.99 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 11.99 2ZM12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20ZM12.5 7H11V13L16.25 16.15L17 14.92L12.5 12.25V7Z" fill={color}/>
  </Svg>
);

const ShareIcon = ({ size = 18, color = COLORS.primary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 16.08C17.24 16.08 16.56 16.38 16.04 16.85L8.91 12.7C8.96 12.47 9 12.24 9 12C9 11.76 8.96 11.53 8.91 11.3L15.96 7.19C16.5 7.69 17.21 8 18 8C19.66 8 21 6.66 21 5C21 3.34 19.66 2 18 2C16.34 2 15 3.34 15 5C15 5.24 15.04 5.47 15.09 5.7L8.04 9.81C7.5 9.31 6.79 9 6 9C4.34 9 3 10.34 3 12C3 13.66 4.34 15 6 15C6.79 15 7.5 14.69 8.04 14.19L15.16 18.35C15.11 18.56 15.08 18.78 15.08 19C15.08 20.61 16.39 21.92 18 21.92C19.61 21.92 20.92 20.61 20.92 19C20.92 17.39 19.61 16.08 18 16.08Z" fill={color}/>
  </Svg>
);

// Direction button icons
const DirectionsFromIcon = ({ size = 18, color = COLORS.success }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill={color}/>
  </Svg>
);

const DirectionsToIcon = ({ size = 18, color = COLORS.error }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20ZM12 10C10.9 10 10 10.9 10 12C10 13.1 10.9 14 12 14C13.1 14 14 13.1 14 12C14 10.9 13.1 10 12 10Z" fill={color}/>
  </Svg>
);

const StopBottomSheet = ({ stop, onClose, onDirectionsFrom, onDirectionsTo }) => {
  const bottomSheetRef = useRef(null);
  const { arrivals, isLoading, error, loadArrivals } = useStopArrivals(stop);

  const snapPoints = useMemo(() => ['30%', '55%', '90%'], []);
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleSheetChanges = useCallback(
    (index) => {
      if (index === -1) {
        onClose?.();
      }
    },
    [onClose]
  );

  const handleDirectionsFrom = useCallback(() => {
    if (onDirectionsFrom && stop) {
      onDirectionsFrom({
        lat: stop.latitude,
        lon: stop.longitude,
        name: stop.name,
      });
    }
  }, [onDirectionsFrom, stop]);

  const handleDirectionsTo = useCallback(() => {
    if (onDirectionsTo && stop) {
      onDirectionsTo({
        lat: stop.latitude,
        lon: stop.longitude,
        name: stop.name,
      });
    }
  }, [onDirectionsTo, stop]);

  const handleShare = useCallback(async () => {
    if (!stop) return;
    const result = await shareStop(stop);
    if (result.copied) {
      Alert.alert('Link Copied', 'Stop details copied to clipboard.');
    }
  }, [stop]);

  if (!stop) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handleIndicator}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.stopIconContainer}>
            <LocationIcon size={24} color={COLORS.white} />
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.stopName} numberOfLines={2}>{stop.name}</Text>
            <View style={styles.stopMeta}>
              <View style={styles.stopCodeBadge}>
                <Text style={styles.stopCodeText}>Stop #{stop.code}</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare} accessibilityRole="button" accessibilityLabel="Share stop details">
            <ShareIcon size={18} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close stop details">
            <CloseIcon size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Direction Buttons */}
      <View style={styles.directionsContainer}>
        <TouchableOpacity
          style={[styles.directionButton, styles.fromButton]}
          onPress={handleDirectionsFrom}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Plan trip from ${stop.name}`}
        >
          <DirectionsFromIcon size={18} color={COLORS.success} />
          <Text style={styles.directionButtonText}>Trip from here</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.directionButton, styles.toButton]}
          onPress={handleDirectionsTo}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Plan trip to ${stop.name}`}
        >
          <DirectionsToIcon size={18} color={COLORS.error} />
          <Text style={styles.directionButtonText}>Trip to here</Text>
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingSpinner}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
            <Text style={styles.loadingTitle}>Loading arrivals</Text>
            <Text style={styles.loadingText}>Fetching real-time data...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <View style={styles.errorIconContainer}>
              <Text style={styles.errorIcon}>!</Text>
            </View>
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadArrivals} accessibilityRole="button" accessibilityLabel="Retry loading arrivals">
              <RefreshIcon size={18} color={COLORS.white} />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : arrivals.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyIcon size={56} color={COLORS.grey300} />
            <Text style={styles.emptyTitle}>No upcoming arrivals</Text>
            <Text style={styles.emptyText}>
              There are no buses scheduled to arrive at this stop right now.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.arrivalsHeader}>
              <Text style={styles.arrivalsTitle}>Upcoming Arrivals</Text>
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={styles.realtimeDot} />
                  <Text style={styles.legendText}>Real-time</Text>
                </View>
              </View>
            </View>
            <View style={styles.arrivalsList}>
              {arrivals.map((arrival, index) => (
                <ArrivalRow
                  key={`${arrival.tripId}-${arrival.stopSequence}-${index}`}
                  arrival={arrival}
                  routeColor={arrival.routeColor}
                />
              ))}
            </View>
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  background: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    ...SHADOWS.elevated,
  },
  handleIndicator: {
    backgroundColor: COLORS.grey300,
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerLeft: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'flex-start',
  },
  stopIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  headerContent: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  stopName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
    lineHeight: FONT_SIZES.xl * 1.3,
  },
  stopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  stopCodeBadge: {
    backgroundColor: COLORS.grey100,
    paddingVertical: SPACING.xxs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  stopCodeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  shareButton: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingBottom: SPACING.xxl,
  },

  // Direction Buttons
  directionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  directionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  fromButton: {
    backgroundColor: COLORS.successSubtle,
  },
  toButton: {
    backgroundColor: COLORS.errorSubtle,
  },
  directionButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },

  // Loading State
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  loadingSpinner: {
    marginBottom: SPACING.lg,
  },
  loadingTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },

  // Error State
  errorContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  errorIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.errorSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  errorIcon: {
    fontSize: 28,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.error,
  },
  errorTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: FONT_SIZES.sm * 1.5,
  },

  // Arrivals List
  arrivalsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.grey50,
  },
  arrivalsTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  legend: {
    flexDirection: 'row',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  realtimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: SPACING.xs,
  },
  legendText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  arrivalsList: {
    paddingHorizontal: SPACING.sm,
  },
});

export default StopBottomSheet;
