/**
 * TripSearchHeader - Floating search bar with origin/destination fields
 *
 * Google Maps-style stacked search fields that slide down from the top
 * when trip planning mode is active.
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Animated } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import AddressAutocomplete from './AddressAutocomplete';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';

// Close icon SVG
const CloseIcon = ({ size = 20, color = COLORS.textSecondary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill={color}/>
  </Svg>
);

// Swap icon SVG
const SwapIcon = ({ size = 20, color = COLORS.textSecondary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M16 17.01V10H14V17.01H11L15 21L19 17.01H16ZM9 3L5 6.99H8V14H10V6.99H13L9 3Z" fill={color}/>
  </Svg>
);

// Location icon SVG
const MyLocationIcon = ({ size = 20, color = COLORS.primary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8ZM20.94 11C20.48 6.83 17.17 3.52 13 3.06V1H11V3.06C6.83 3.52 3.52 6.83 3.06 11H1V13H3.06C3.52 17.17 6.83 20.48 11 20.94V23H13V20.94C17.17 20.48 20.48 17.17 20.94 13H23V11H20.94ZM12 19C8.13 19 5 15.87 5 12C5 8.13 8.13 5 12 5C15.87 5 19 8.13 19 12C19 15.87 15.87 19 12 19Z" fill={color}/>
  </Svg>
);

const TripSearchHeader = ({
  fromText,
  toText,
  onFromChange,
  onToChange,
  onFromSelect,
  onToSelect,
  onSwap,
  onClose,
  onUseCurrentLocation,
  isLoading = false,
}) => {
  return (
    <View style={styles.container}>
      {/* Header with close button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Plan Your Trip</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          accessibilityLabel="Close trip planner"
          accessibilityRole="button"
        >
          <CloseIcon size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Search Fields */}
      <View style={styles.searchContainer}>
        {/* From field */}
        <View style={styles.fieldRow}>
          <View style={styles.fieldIndicator}>
            <View style={styles.fromDot} />
            <View style={styles.connectorLine} />
          </View>
          <View style={[styles.fieldWrapper, { zIndex: 2 }]}>
            <AddressAutocomplete
              value={fromText}
              onChangeText={onFromChange}
              onSelect={onFromSelect}
              placeholder="Your location"
              inputStyle={styles.input}
              accessibilityLabel="Starting location"
              accessibilityHint="Enter an address to search"
              rightIcon={
                <TouchableOpacity
                  style={styles.locationButton}
                  onPress={onUseCurrentLocation}
                  accessibilityLabel="Use current location"
                  accessibilityRole="button"
                >
                  <MyLocationIcon size={20} color={COLORS.primary} />
                </TouchableOpacity>
              }
            />
          </View>
        </View>

        {/* To field */}
        <View style={styles.fieldRow}>
          <View style={styles.fieldIndicator}>
            <View style={styles.toDot} />
          </View>
          <View style={[styles.fieldWrapper, { zIndex: 1 }]}>
            <AddressAutocomplete
              value={toText}
              onChangeText={onToChange}
              onSelect={onToSelect}
              placeholder="Where to?"
              inputStyle={styles.input}
              accessibilityLabel="Destination"
              accessibilityHint="Enter an address to search"
            />
          </View>
        </View>

        {/* Swap button */}
        <TouchableOpacity
          style={styles.swapButton}
          onPress={onSwap}
          accessibilityLabel="Swap origin and destination"
          accessibilityRole="button"
        >
          <SwapIcon size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 44,
    left: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
    ...SHADOWS.elevated,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    position: 'relative',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xxs,
  },
  fieldIndicator: {
    width: 20,
    alignItems: 'center',
    marginRight: SPACING.xs,
  },
  fromDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
  },
  toDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.error,
  },
  connectorLine: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.grey300,
    marginTop: 2,
  },
  fieldWrapper: {
    flex: 1,
  },
  input: {
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    height: 38,
    fontSize: FONT_SIZES.sm,
  },
  locationButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swapButton: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
});

export default TripSearchHeader;
