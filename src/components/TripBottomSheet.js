/**
 * TripBottomSheet - Swipeable results card showing trip options
 *
 * Snap points: 10% (peek), 38% (default), 85% (expanded)
 * Shows loading state, results, or empty state based on trip planning status.
 * Now includes preview modal for quick trip overview and direct navigation start.
 */

import React, { useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import TripResultCard from './TripResultCard';
import TripErrorDisplay from './TripErrorDisplay';
import FareCard from './FareCard';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../config/theme';

// Empty state icon
const EmptyIcon = ({ size = 48, color = COLORS.grey400 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21.71 11.29L12.71 2.29C12.32 1.9 11.69 1.9 11.3 2.29L2.3 11.29C1.91 11.68 1.91 12.31 2.3 12.7L11.3 21.7C11.5 21.9 11.74 22 12 22C12.26 22 12.5 21.9 12.71 21.71L21.71 12.71C22.1 12.32 22.1 11.68 21.71 11.29ZM14 14.5V12H10V15H8V11C8 10.45 8.45 10 9 10H14V7.5L17.5 11L14 14.5Z" fill={color}/>
  </Svg>
);

// Error icon
const ErrorIcon = ({ size = 48, color = COLORS.error }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill={color}/>
  </Svg>
);

const TripBottomSheet = ({
  itineraries,
  selectedIndex,
  onSelectItinerary,
  onViewDetails,
  onStartNavigation,
  isLoading,
  error,
  hasSearched,
  onRetry,
}) => {
  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['10%', '38%', '85%'], []);

  const handleSheetChanges = useCallback((index) => {
    // Could handle sheet state changes here if needed
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingTitle}>Finding routes...</Text>
          <Text style={styles.loadingSubtext}>Calculating the best options</Text>
        </View>
      );
    }

    if (error) {
      // Check if error is a TripPlanningError with a code
      if (error.code) {
        return <TripErrorDisplay error={error} onRetry={onRetry} />;
      }
      // Legacy string error handling
      return (
        <View style={styles.centerContainer}>
          <ErrorIcon size={48} color={COLORS.error} />
          <Text style={styles.errorTitle}>No routes found</Text>
          <Text style={styles.errorSubtext}>{typeof error === 'string' ? error : error.message}</Text>
        </View>
      );
    }

    if (!hasSearched) {
      return (
        <View style={styles.centerContainer}>
          <EmptyIcon size={48} color={COLORS.grey400} />
          <Text style={styles.emptyTitle}>Plan your trip</Text>
          <Text style={styles.emptySubtext}>Enter your destination above to see available routes</Text>
        </View>
      );
    }

    if (itineraries.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <EmptyIcon size={48} color={COLORS.grey400} />
          <Text style={styles.emptyTitle}>No routes available</Text>
          <Text style={styles.emptySubtext}>Try a different time or destination</Text>
        </View>
      );
    }

    return (
      <>
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>
            {itineraries.length} route{itineraries.length !== 1 ? 's' : ''} found
          </Text>
          <Text style={styles.resultsSubtitle}>Select a route to preview on map</Text>
        </View>
        <View style={styles.resultsList}>
          {itineraries.map((itinerary, index) => (
            <TripResultCard
              key={itinerary.id || index}
              itinerary={itinerary}
              isSelected={index === selectedIndex}
              onPress={() => onSelectItinerary(index)}
              onViewDetails={onViewDetails}
              onStartNavigation={onStartNavigation}
            />
          ))}
        </View>
        {selectedIndex >= 0 && <FareCard />}
      </>
    );
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {renderContent()}
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
  content: {
    paddingBottom: SPACING.xxl,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
  },
  loadingTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  loadingSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  errorTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  errorSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  resultsHeader: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  resultsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  resultsSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  resultsList: {
    paddingTop: SPACING.xs,
  },
});

export default TripBottomSheet;
