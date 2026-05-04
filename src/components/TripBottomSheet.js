/**
 * TripBottomSheet - Swipeable results card showing trip options
 *
 * Snap points: 10% (peek), 38% (default), 85% (expanded)
 * Shows loading state, results, or empty state based on trip planning status.
 * Now includes preview modal for quick trip overview and direct navigation start.
 */

import React, { useMemo, useRef, useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TripResultCard from './TripResultCard';
import TripErrorDisplay from './TripErrorDisplay';
import FareCard from './FareCard';
import TripPreviewMapLegend from './TripPreviewMapLegend';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../config/theme';
import Icon from './Icon';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';

const getItineraryKey = (itinerary, index) => {
  const legSignature = Array.isArray(itinerary?.legs)
    ? itinerary.legs
        .map((leg, legIndex) => `${leg.mode || 'mode'}-${leg.route?.id || leg.route?.shortName || 'route'}-${leg.startTime || legIndex}`)
        .join('|')
    : 'no-legs';

  return [
    itinerary?.id || 'itinerary',
    itinerary?.startTime || 'start',
    itinerary?.endTime || 'end',
    itinerary?.duration || 'duration',
    legSignature,
    index,
  ].join('-');
};

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
  recentTrips = [],
  onSelectRecentTrip,
  savedTrips = [],
  onSelectSavedTrip,
  onSaveCurrentTrip,
  repeatTripSuggestion = null,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['10%', '28%', '85%'], []);
  const [isMapKeyExpanded, setIsMapKeyExpanded] = useState(false);

  const handleSheetChanges = useCallback((index) => {
    // Could handle sheet state changes here if needed
  }, []);
  const handleKeyDown = useCallback(() => {}, []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingTitle}>Finding your best route…</Text>
          <Text style={styles.loadingSubtext}>Checking live buses and walking time.</Text>
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
          {onRetry && (
            <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (!hasSearched) {
      return (
        <View style={styles.centerContainer}>
          <EmptyIcon size={48} color={COLORS.grey400} />
          <Text style={styles.emptyTitle}>Quick trips</Text>
          <Text style={styles.emptySubtext}>Pick a saved or recent route, or enter where you’re going above.</Text>
          {savedTrips.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>Saved routes</Text>
              {savedTrips.slice(0, 4).map((trip) => (
                <TouchableOpacity
                  key={trip.id}
                  style={styles.recentTripItem}
                  onPress={() => onSelectSavedTrip?.(trip)}
                  accessibilityRole="button"
                  accessibilityLabel={`Saved trip: ${trip.name}`}
                >
                  <Icon name={trip.icon || 'Route'} size={16} color={COLORS.primary} />
                  <View style={styles.recentTripContent}>
                    <Text style={styles.recentTripText} numberOfLines={1}>
                      {trip.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {recentTrips.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>Recent routes</Text>
              {recentTrips.slice(0, 5).map((trip, idx) => (
                <TouchableOpacity
                  key={`recent-trip-${idx}`}
                  style={styles.recentTripItem}
                  onPress={() => onSelectRecentTrip?.(trip)}
                  accessibilityRole="button"
                  accessibilityLabel={`Recent trip: ${trip.fromText} to ${trip.toText}`}
                >
                  <Icon name="Clock" size={16} color={COLORS.textSecondary} />
                  <View style={styles.recentTripContent}>
                    <Text style={styles.recentTripText} numberOfLines={1}>
                      {trip.fromText}
                    </Text>
                    <Text style={styles.recentTripArrow}>→</Text>
                    <Text style={styles.recentTripText} numberOfLines={1}>
                      {trip.toText}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      );
    }

    if (itineraries.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <EmptyIcon size={48} color={COLORS.grey400} />
          <Text style={styles.emptyTitle}>No routes available</Text>
          <Text style={styles.emptySubtext}>Try a nearby stop, a different time, or check alerts before you go.</Text>
        </View>
      );
    }

    return (
      <>
        <View style={styles.resultsHeader}>
          <View style={styles.resultsHeaderText}>
            <Text style={styles.resultsEyebrow}>Live trip options</Text>
            <Text style={styles.resultsTitle}>
              Choose your route
            </Text>
            <Text style={styles.resultsSubtitle}>Tap a card to preview it on the map.</Text>
            {repeatTripSuggestion && onSaveCurrentTrip && (
              <View style={styles.repeatTripPrompt}>
                <View style={styles.repeatTripPromptText}>
                  <Text style={styles.repeatTripPromptTitle}>
                    {`Save ${repeatTripSuggestion.name}?`}
                  </Text>
                  <Text style={styles.repeatTripPromptSubtext}>
                    You’ve planned this route {repeatTripSuggestion.count} times. Save it for one-tap access.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.repeatTripPromptButton}
                  onPress={onSaveCurrentTrip}
                  accessibilityRole="button"
                  accessibilityLabel={`Save recurring route ${repeatTripSuggestion.name}`}
                >
                  <Text style={styles.repeatTripPromptButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
            {onSaveCurrentTrip && (
              <TouchableOpacity
                style={styles.saveTripButton}
                onPress={onSaveCurrentTrip}
                accessibilityRole="button"
                accessibilityLabel="Save this route"
              >
                <Icon name="Star" size={14} color={COLORS.primary} />
                <Text style={styles.saveTripButtonText}>Save this route</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.mapKeyToggle}
              onPress={() => setIsMapKeyExpanded((expanded) => !expanded)}
              accessibilityRole="button"
              accessibilityLabel={isMapKeyExpanded ? 'Hide trip map key' : 'Show trip map key'}
              accessibilityState={{ expanded: isMapKeyExpanded }}
            >
              <Text style={styles.mapKeyToggleIcon}>ⓘ</Text>
              <Text style={styles.mapKeyToggleText}>Map key</Text>
              <Text style={styles.mapKeyToggleIcon}>{isMapKeyExpanded ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
            <TripPreviewMapLegend
              visible={isMapKeyExpanded}
              variant="inline"
              style={styles.inlineMapKey}
            />
          </View>
          <View style={styles.resultsCountPill}>
            <Text style={styles.resultsCountText}>
              {itineraries.length}
            </Text>
            <Text style={styles.resultsCountLabel}>
              route{itineraries.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <View style={styles.resultsList}>
          {itineraries.map((itinerary, index) => (
            <TripResultCard
              key={getItineraryKey(itinerary, index)}
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
      onAnimate={handleKeyDown}
    >
      <BottomSheetScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: addSafeBottomPadding(SPACING.xxl, bottomInset) },
        ]}
      >
        {renderContent()}
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  background: {
    backgroundColor: COLORS.grey50,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    ...SHADOWS.elevated,
  },
  handleIndicator: {
    backgroundColor: COLORS.primaryLight,
    width: 44,
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
  retryButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.round,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
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
  recentSection: {
    width: '100%',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  recentTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  recentTripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  recentTripIcon: {
    fontSize: 16,
    marginRight: SPACING.sm,
  },
  recentTripContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  recentTripText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    flex: 1,
  },
  recentTripArrow: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  resultsHeaderText: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  resultsEyebrow: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  resultsTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  resultsSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  repeatTripPrompt: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primarySubtle,
    borderWidth: 1,
    borderColor: 'rgba(26, 115, 232, 0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  repeatTripPromptText: {
    flex: 1,
  },
  repeatTripPromptTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  repeatTripPromptSubtext: {
    marginTop: 2,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  repeatTripPromptButton: {
    paddingVertical: 7,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primary,
  },
  repeatTripPromptButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  saveTripButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.xs,
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primarySubtle,
  },
  saveTripButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
  },
  mapKeyToggle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.xs,
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.secondarySubtle,
  },
  mapKeyToggleText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primaryDark,
  },
  mapKeyToggleIcon: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primaryDark,
  },
  inlineMapKey: {
    alignSelf: 'stretch',
  },
  resultsCountPill: {
    minWidth: 62,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primarySubtle,
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.18)',
  },
  resultsCountText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.primaryDark,
    lineHeight: 20,
  },
  resultsCountLabel: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primaryDark,
  },
  resultsList: {
    paddingTop: SPACING.xs,
  },
});

export default TripBottomSheet;
