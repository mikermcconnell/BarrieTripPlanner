/**
 * TripSearchHeader - Floating search bar with origin/destination fields
 *
 * Google Maps-style stacked search fields that slide down from the top
 * when trip planning mode is active.
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Animated } from 'react-native';
import Icon from './Icon';
import AddressAutocomplete from './AddressAutocomplete';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';

// Using centralized Icon component for rendering icons

const TIME_MODES = ['now', 'departAt', 'arriveBy'];
const TIME_MODE_LABELS = { now: 'Depart Now', departAt: 'Depart At', arriveBy: 'Arrive By' };

const formatTimeDisplay = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

const formatDateTimeLocal = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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
  fromSuggestions = [],
  toSuggestions = [],
  showFromSuggestions = false,
  showToSuggestions = false,
  timeMode = 'now',
  selectedTime,
  onTimeModeChange,
  onSelectedTimeChange,
  onSearch,
}) => {
  void isLoading;
  void fromSuggestions;
  void toSuggestions;
  void showFromSuggestions;
  void showToSuggestions;
  void formatDateTimeLocal;

  const cycleTimeMode = () => {
    if (!onTimeModeChange) return;
    const idx = TIME_MODES.indexOf(timeMode);
    const next = TIME_MODES[(idx + 1) % TIME_MODES.length];
    onTimeModeChange(next);
    if (next !== 'now' && !selectedTime) {
      onSelectedTimeChange && onSelectedTimeChange(new Date());
    }
  };
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
          <Icon name="X" size={20} color={COLORS.textSecondary} />
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
                  <Icon name="LocateFixed" size={20} color={COLORS.primary} strokeWidth={2.5} />
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
          <View style={[styles.fieldWrapper, { zIndex: 1, paddingRight: 40 }]}>
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
          <Icon name="ArrowUpDown" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Time Mode Row */}
      <View style={styles.timeRow}>
        <TouchableOpacity
          style={styles.timeModeBtn}
          onPress={cycleTimeMode}
          accessibilityLabel={`Time mode: ${TIME_MODE_LABELS[timeMode]}. Tap to change.`}
          accessibilityRole="button"
        >
          <Text style={styles.timeModeBtnText}>{TIME_MODE_LABELS[timeMode]}</Text>
        </TouchableOpacity>
        {timeMode !== 'now' && selectedTime && (
          <Text style={styles.timeDisplay}>{formatTimeDisplay(selectedTime)}</Text>
        )}
        {timeMode !== 'now' && onSearch && (
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={onSearch}
            accessibilityLabel="Search trips"
            accessibilityRole="button"
          >
            <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>
        )}
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
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    gap: SPACING.sm,
  },
  timeModeBtn: {
    backgroundColor: COLORS.grey100,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  timeModeBtnText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  timeDisplay: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  searchBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginLeft: 'auto',
  },
  searchBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default TripSearchHeader;
