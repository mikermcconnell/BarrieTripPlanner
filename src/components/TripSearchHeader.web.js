/**
 * TripSearchHeader.web.js — Web-specific trip search header
 *
 * Extracted from HomeScreen.web.js to reduce file size and
 * keep rendering logic separate from trip planning state.
 */

import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';
import { getDistanceFromBarrie } from '../services/locationIQService';

// Close icon
const CloseIcon = ({ size = 20, color = COLORS.textSecondary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill={color} />
  </svg>
);

// Center/locate icon
const CenterIcon = ({ size = 20, color = COLORS.textPrimary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8ZM20.94 11C20.48 6.83 17.17 3.52 13 3.06V1H11V3.06C6.83 3.52 3.52 6.83 3.06 11H1V13H3.06C3.52 17.17 6.83 20.48 11 20.94V23H13V20.94C17.17 20.48 20.48 17.17 20.94 13H23V11H20.94ZM12 19C8.13 19 5 15.87 5 12C5 8.13 8.13 5 12 5C15.87 5 19 8.13 19 12C19 15.87 15.87 19 12 19Z" fill={color} />
  </svg>
);

const TripSearchHeaderWeb = ({
  fromText,
  toText,
  onFromChange,
  onToChange,
  onFromSelect,
  onToSelect,
  fromSuggestions,
  toSuggestions,
  showFromSuggestions,
  showToSuggestions,
  onSwap,
  onClose,
  onUseCurrentLocation,
}) => (
  <View style={styles.tripPlanHeader}>
    <View style={styles.tripPlanHeaderTop}>
      <Text style={styles.tripPlanTitle}>Plan Your Trip</Text>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={onClose}
        accessibilityLabel="Close trip planner"
        accessibilityRole="button"
      >
        <CloseIcon size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>
    </View>

    {/* From Field */}
    <View style={styles.tripInputRow}>
      <View style={styles.tripInputDot}>
        <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
        <View style={styles.dotConnector} />
      </View>
      <View style={styles.tripInputWrapper}>
        <TextInput
          style={styles.tripInput}
          value={fromText}
          onChangeText={onFromChange}
          placeholder="Your location"
          placeholderTextColor={COLORS.grey500}
          aria-label="Starting location"
        />
        <TouchableOpacity
          style={styles.locationBtn}
          onPress={onUseCurrentLocation}
          accessibilityLabel="Use current location"
          accessibilityRole="button"
        >
          <CenterIcon size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    </View>

    {showFromSuggestions && fromSuggestions.length > 0 && (
      <View style={styles.suggestionsDropdown} role="listbox" aria-label="Origin suggestions">
        {fromSuggestions.slice(0, 5).map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.suggestionItem}
            onPress={() => onFromSelect(item)}
            role="option"
          >
            <Text style={styles.suggestionText} numberOfLines={1}>{item.shortName}</Text>
            <Text style={styles.suggestionDistance}>
              {getDistanceFromBarrie(item.lat, item.lon).toFixed(1)}km
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    )}

    {/* To Field */}
    <View style={styles.tripInputRow}>
      <View style={styles.tripInputDot}>
        <View style={[styles.dot, { backgroundColor: COLORS.error }]} />
      </View>
      <View style={styles.tripInputWrapper}>
        <TextInput
          style={styles.tripInput}
          value={toText}
          onChangeText={onToChange}
          placeholder="Where to?"
          placeholderTextColor={COLORS.grey500}
          aria-label="Destination"
        />
      </View>
    </View>

    {showToSuggestions && toSuggestions.length > 0 && (
      <View style={styles.suggestionsDropdown} role="listbox" aria-label="Destination suggestions">
        {toSuggestions.slice(0, 5).map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.suggestionItem}
            onPress={() => onToSelect(item)}
            role="option"
          >
            <Text style={styles.suggestionText} numberOfLines={1}>{item.shortName}</Text>
            <Text style={styles.suggestionDistance}>
              {getDistanceFromBarrie(item.lat, item.lon).toFixed(1)}km
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    )}

    {/* Swap Button */}
    <TouchableOpacity
      style={styles.swapBtn}
      onPress={onSwap}
      accessibilityLabel="Swap origin and destination"
      accessibilityRole="button"
    >
      <Text style={styles.swapBtnText}>Swap</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  tripPlanHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: COLORS.surface,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    ...SHADOWS.medium,
  },
  tripPlanHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  tripPlanTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  tripInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  tripInputDot: {
    width: 20,
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotConnector: {
    width: 2,
    height: 14,
    backgroundColor: COLORS.grey300,
    marginTop: 2,
  },
  tripInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
  },
  tripInput: {
    flex: 1,
    height: 40,
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
  },
  locationBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  suggestionsDropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    marginLeft: 28,
    marginBottom: SPACING.xs,
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    minHeight: 44,
  },
  suggestionText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
  },
  suggestionDistance: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.grey500,
    marginLeft: SPACING.sm,
  },
  swapBtn: {
    alignSelf: 'flex-end',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.grey100,
    marginTop: SPACING.xs,
    minHeight: 44,
    justifyContent: 'center',
  },
  swapBtnText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default TripSearchHeaderWeb;
