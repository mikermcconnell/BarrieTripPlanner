/**
 * StopBottomSheet.web.js - Half-screen stop details panel for web
 *
 * A clean, half-screen overlay that displays stop information and arrivals.
 * Map remains visible on top half for context.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { useStopArrivals } from '../hooks/useStopArrivals';
import ArrivalRow from './ArrivalRow';
import { shareStop } from '../utils/shareUtils';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../config/theme';

// SVG Icons
const CloseIcon = ({ size = 24, color = COLORS.textSecondary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill={color}/>
  </svg>
);

const LocationIcon = ({ size = 24, color = COLORS.white }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill={color}/>
  </svg>
);

const RefreshIcon = ({ size = 20, color = COLORS.white }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4C7.58 4 4.01 7.58 4.01 12C4.01 16.42 7.58 20 12 20C15.73 20 18.84 17.45 19.73 14H17.65C16.83 16.33 14.61 18 12 18C8.69 18 6 15.31 6 12C6 8.69 8.69 6 12 6C13.66 6 15.14 6.69 16.22 7.78L13 11H20V4L17.65 6.35Z" fill={color}/>
  </svg>
);

const EmptyIcon = ({ size = 64, color = COLORS.grey300 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11.99 2C6.47 2 2 6.48 2 12C2 17.52 6.47 22 11.99 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 11.99 2ZM12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20ZM12.5 7H11V13L16.25 16.15L17 14.92L12.5 12.25V7Z" fill={color}/>
  </svg>
);

const ShareIcon = ({ size = 18, color = COLORS.primary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 16.08C17.24 16.08 16.56 16.38 16.04 16.85L8.91 12.7C8.96 12.47 9 12.24 9 12C9 11.76 8.96 11.53 8.91 11.3L15.96 7.19C16.5 7.69 17.21 8 18 8C19.66 8 21 6.66 21 5C21 3.34 19.66 2 18 2C16.34 2 15 3.34 15 5C15 5.24 15.04 5.47 15.09 5.7L8.04 9.81C7.5 9.31 6.79 9 6 9C4.34 9 3 10.34 3 12C3 13.66 4.34 15 6 15C6.79 15 7.5 14.69 8.04 14.19L15.16 18.35C15.11 18.56 15.08 18.78 15.08 19C15.08 20.61 16.39 21.92 18 21.92C19.61 21.92 20.92 20.61 20.92 19C20.92 17.39 19.61 16.08 18 16.08Z" fill={color}/>
  </svg>
);

const DirectionsFromIcon = ({ size = 20, color = COLORS.success }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill={color}/>
  </svg>
);

const DirectionsToIcon = ({ size = 20, color = COLORS.error }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20ZM12 10C10.9 10 10 10.9 10 12C10 13.1 10.9 14 12 14C13.1 14 14 13.1 14 12C14 10.9 13.1 10 12 10Z" fill={color}/>
  </svg>
);

const StopBottomSheet = ({ stop, onClose, onDirectionsFrom, onDirectionsTo }) => {
  const { arrivals, isLoading, error, loadArrivals } = useStopArrivals(stop);
  const [slideAnim] = useState(new Animated.Value(100)); // Start off-screen (100%)
  const handleSheetChanges = useCallback(() => {}, []);

  // Slide-in animation when component mounts
  useEffect(() => {
    handleSheetChanges(1);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, []);

  // Handle close with slide-out animation
  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      handleSheetChanges(-1);
      onClose?.();
    });
  }, [onClose, slideAnim, handleSheetChanges]);

  // Handle directions from this stop
  const handleDirectionsFrom = useCallback(() => {
    if (onDirectionsFrom && stop) {
      onDirectionsFrom({
        lat: stop.latitude,
        lon: stop.longitude,
        name: stop.name,
      });
    }
  }, [onDirectionsFrom, stop]);

  // Handle directions to this stop
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
      window.alert('Stop details copied to clipboard.');
    }
  }, [stop]);

  if (!stop) return null;

  return (
    <>
      {/* Semi-transparent backdrop for top half - clicking closes the sheet */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* Bottom sheet panel */}
      <Animated.View
        style={[
          styles.overlay,
          {
            transform: [{
              translateY: slideAnim.interpolate({
                inputRange: [0, 100],
                outputRange: [0, 500],
              }),
            }],
          },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.dragHandleContainer}>
          <View style={styles.dragHandle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.stopIconContainer}>
              <LocationIcon size={18} color={COLORS.white} />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={styles.stopName} numberOfLines={1}>{stop.name}</Text>
              <Text style={styles.stopCode}>Stop #{stop.code}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close stop details">
            <CloseIcon size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Actions */}
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

          <TouchableOpacity style={styles.shareButton} onPress={handleShare} accessibilityRole="button" accessibilityLabel="Share stop details">
            <ShareIcon size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Arrivals Section */}
        <View style={styles.arrivalsHeader}>
          <Text style={styles.arrivalsTitle}>Upcoming Arrivals</Text>
          {!isLoading && !error && arrivals.length > 0 && (
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={styles.realtimeDot} />
                <Text style={styles.legendText}>Real-time</Text>
              </View>
            </View>
          )}
        </View>

        {/* Scrollable Content */}
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.stateSubtext}>Loading arrivals...</Text>
            </View>
          ) : error ? (
            <View style={styles.stateContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadArrivals} accessibilityRole="button" accessibilityLabel="Retry loading arrivals">
                <RefreshIcon size={16} color={COLORS.white} />
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : arrivals.length === 0 ? (
            <View style={styles.stateContainer}>
              <EmptyIcon size={48} color={COLORS.grey300} />
              <Text style={styles.stateSubtext}>No upcoming arrivals</Text>
            </View>
          ) : (
            <View style={styles.arrivalsList}>
              {arrivals.map((arrival, index) => (
                <ArrivalRow
                  key={`${arrival.tripId}-${arrival.stopSequence}-${index}`}
                  arrival={arrival}
                  routeColor={arrival.routeColor}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    zIndex: 1999,
  },

  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    zIndex: 2000,
    boxShadow: '0 -4px 24px rgba(23, 43, 77, 0.15)',
  },

  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.grey300,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stopIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  headerTextContainer: {
    flex: 1,
  },
  stopName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  stopCode: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
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

  // Arrivals Header
  arrivalsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.grey50,
  },
  arrivalsTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
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
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
    marginRight: SPACING.xs,
  },
  legendText: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
  },

  // Scroll Container
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },

  // State Containers (loading, error, empty)
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
  },
  stateSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
    marginBottom: SPACING.sm,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.round,
    gap: SPACING.xs,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // Arrivals List
  arrivalsList: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.xs,
  },
});

export default StopBottomSheet;
