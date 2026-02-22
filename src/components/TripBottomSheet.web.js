/**
 * TripBottomSheet.web.js - Web-specific version using fixed positioning
 *
 * Provides same interface as native TripBottomSheet but uses CSS positioning
 * instead of @gorhom/bottom-sheet for better web compatibility.
 * Now includes preview modal for quick trip overview and direct navigation start.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import TripResultCard from './TripResultCard';
import FareCard from './FareCard';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../config/theme';

// Empty state icon
const EmptyIcon = ({ size = 48, color = COLORS.grey400 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.71 11.29L12.71 2.29C12.32 1.9 11.69 1.9 11.3 2.29L2.3 11.29C1.91 11.68 1.91 12.31 2.3 12.7L11.3 21.7C11.5 21.9 11.74 22 12 22C12.26 22 12.5 21.9 12.71 21.71L21.71 12.71C22.1 12.32 22.1 11.68 21.71 11.29ZM14 14.5V12H10V15H8V11C8 10.45 8.45 10 9 10H14V7.5L17.5 11L14 14.5Z" fill={color}/>
  </svg>
);

// Error icon
const ErrorIcon = ({ size = 48, color = COLORS.error }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill={color}/>
  </svg>
);

// Expand/collapse icons
const ChevronUpIcon = ({ size = 24, color = COLORS.grey500 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.41 15.41L12 10.83L16.59 15.41L18 14L12 8L6 14L7.41 15.41Z" fill={color}/>
  </svg>
);

const ChevronDownIcon = ({ size = 24, color = COLORS.grey500 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.41 8.59L12 13.17L16.59 8.59L18 10L12 16L6 10L7.41 8.59Z" fill={color}/>
  </svg>
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
}) => {
  // Sheet states: 'peek' (10%), 'default' (42%), 'expanded' (60%)
  const [sheetState, setSheetState] = useState('default');
  const handleSheetChanges = useCallback((_nextState) => {}, []);

  const getSheetHeight = () => {
    switch (sheetState) {
      case 'peek': return '10%';
      case 'expanded': return '60%';
      default: return '42%';
    }
  };

  const toggleSheet = useCallback(() => {
    if (sheetState === 'peek') {
      setSheetState('default');
      handleSheetChanges('default');
    } else if (sheetState === 'default') {
      setSheetState('expanded');
      handleSheetChanges('expanded');
    } else {
      setSheetState('default');
      handleSheetChanges('default');
    }
  }, [sheetState, handleSheetChanges]);

  // Keyboard support: Escape to collapse, Enter/Space to toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && sheetState !== 'peek') {
        setSheetState('peek');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sheetState]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer} aria-busy={true} accessibilityRole="progressbar">
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingTitle}>Finding routes...</Text>
          <Text style={styles.loadingSubtext}>Calculating the best options</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer} accessibilityRole="alert">
          <ErrorIcon size={48} color={COLORS.error} />
          <Text style={styles.errorTitle}>No routes found</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
          {onRetry && (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry trip search"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (!hasSearched) {
      return (
        <View style={styles.centerContainer}>
          <EmptyIcon size={48} color={COLORS.grey400} />
          <Text style={styles.emptyTitle}>Plan your trip</Text>
          <Text style={styles.emptySubtext}>Enter your destination above to see available routes</Text>
          {recentTrips.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>Recent Trips</Text>
              {recentTrips.slice(0, 5).map((trip, idx) => (
                <TouchableOpacity
                  key={`recent-trip-${idx}`}
                  style={styles.recentTripItem}
                  onPress={() => onSelectRecentTrip?.(trip)}
                  accessibilityRole="button"
                  accessibilityLabel={`Recent trip: ${trip.fromText} to ${trip.toText}`}
                >
                  <Text style={styles.recentTripIcon}>🕐</Text>
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
          <Text style={styles.emptySubtext}>Try a different time or destination</Text>
        </View>
      );
    }

    return (
      <>
        <View style={styles.resultsHeader} aria-live="polite">
          <Text style={styles.resultsTitle}>
            {itineraries.length} route{itineraries.length !== 1 ? 's' : ''} found
          </Text>
          <Text style={styles.resultsSubtitle}>Select a route to preview on map</Text>
        </View>
        <ScrollView style={styles.resultsList} contentContainerStyle={styles.resultsContent}>
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
          {selectedIndex >= 0 && <FareCard />}
        </ScrollView>
      </>
    );
  };

  return (
    <View style={[styles.container, { height: getSheetHeight() }]}>
      {/* Handle bar / header */}
      <TouchableOpacity
        style={styles.handleContainer}
        onPress={toggleSheet}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Trip results panel, ${sheetState === 'expanded' ? 'collapse' : 'expand'}`}
        aria-expanded={sheetState === 'expanded'}
      >
        <View style={styles.handleIndicator} />
        <View style={styles.handleActions}>
          {sheetState === 'expanded' ? (
            <ChevronDownIcon size={20} color={COLORS.grey500} />
          ) : (
            <ChevronUpIcon size={20} color={COLORS.grey500} />
          )}
        </View>
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    ...SHADOWS.elevated,
    zIndex: 1000,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
  },
  handleIndicator: {
    backgroundColor: COLORS.grey300,
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  handleActions: {
    marginTop: SPACING.xs,
  },
  content: {
    flex: 1,
    paddingBottom: SPACING.xs,
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
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
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
    cursor: 'pointer',
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
    flex: 1,
  },
  resultsContent: {
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
  },
});

export default TripBottomSheet;
