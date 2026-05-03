/**
 * TripSearchHeader - Floating search bar with origin/destination fields
 *
 * Google Maps-style stacked search fields that slide down from the top
 * when trip planning mode is active.
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Animated, ActivityIndicator } from 'react-native';
import Icon from './Icon';
import AddressAutocomplete from './AddressAutocomplete';
import TimePicker from './TimePicker';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';

// Using centralized Icon component for rendering icons

const PICKER_TO_HOOK = { now: 'now', depart: 'departAt', arrive: 'arriveBy' };
const HOOK_TO_PICKER = { now: 'now', departAt: 'depart', arriveBy: 'arrive' };
const FIELD_INDICATOR_WIDTH = 20;
const FIELD_INDICATOR_GAP = SPACING.xs;
const FIELD_ACTION_GUTTER = 40;

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
  showUseCurrentLocation = true,
  isLocatingCurrentLocation = false,
  isLoading = false,
  fromSuggestions = [],
  toSuggestions = [],
  showFromSuggestions = false,
  showToSuggestions = false,
  isTypingFrom = false,
  isTypingTo = false,
  timeMode = 'now',
  selectedTime,
  onTimeModeChange,
  onSelectedTimeChange,
  onSearch,
  savedPlaces = [],
  savedTrips = [],
  onSelectSavedPlace,
  onSelectSavedTrip,
  onSaveFromPlace,
  onSaveToPlace,
}) => {
  void showFromSuggestions;
  void showToSuggestions;
  const visiblePlaces = savedPlaces.slice(0, 5);
  const visibleTrips = savedTrips.slice(0, 3);

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
          <View style={[styles.fieldWrapper, styles.fieldWrapperWithActionGutter, { zIndex: 2 }]}>
            <AddressAutocomplete
              value={fromText}
              onChangeText={onFromChange}
              onSelect={onFromSelect}
              placeholder="Your location"
              inputStyle={styles.input}
              accessibilityLabel="Starting location"
              accessibilityHint="Enter an address to search"
            />
          </View>
        </View>

        {showUseCurrentLocation && onUseCurrentLocation && (
          <View style={styles.useLocationRow}>
            <TouchableOpacity
              style={[styles.useLocationButton, isLocatingCurrentLocation && styles.useLocationButtonBusy]}
              onPress={() => onUseCurrentLocation()}
              disabled={isLocatingCurrentLocation}
              accessibilityLabel="Use current location"
              accessibilityRole="button"
              accessibilityState={{ busy: isLocatingCurrentLocation, disabled: isLocatingCurrentLocation }}
            >
              {isLocatingCurrentLocation ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Icon name="LocateFixed" size={16} color={COLORS.primary} strokeWidth={2.5} />
              )}
              <Text style={styles.useLocationText}>
                {isLocatingCurrentLocation ? 'Getting location…' : 'Use current location'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isTypingFrom && fromSuggestions.length === 0 && (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.typingText}>Searching...</Text>
          </View>
        )}

        {/* To field */}
        <View style={styles.fieldRow}>
          <View style={styles.fieldIndicator}>
            <View style={styles.toDot} />
          </View>
          <View style={[styles.fieldWrapper, styles.fieldWrapperWithActionGutter, { zIndex: 1 }]}>
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

        {isTypingTo && toSuggestions.length === 0 && (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.typingText}>Searching...</Text>
          </View>
        )}

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

      {(visiblePlaces.length > 0 || visibleTrips.length > 0) && (
        <View style={styles.shortcutsContainer}>
          {visiblePlaces.length > 0 && (
            <View style={styles.shortcutGroup}>
              <Text style={styles.shortcutTitle}>Saved places</Text>
              <View style={styles.shortcutChips}>
                {visiblePlaces.map((place) => (
                  <TouchableOpacity
                    key={place.id}
                    style={styles.shortcutChip}
                    onPress={() => onSelectSavedPlace?.(place)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use saved place ${place.name || place.addressText}`}
                  >
                    <Icon name={place.icon || 'MapPin'} size={14} color={COLORS.primary} />
                    <Text style={styles.shortcutChipText} numberOfLines={1}>
                      {place.name || place.addressText}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {visibleTrips.length > 0 && (
            <View style={styles.shortcutGroup}>
              <Text style={styles.shortcutTitle}>Saved trips</Text>
              <View style={styles.shortcutChips}>
                {visibleTrips.map((trip) => (
                  <TouchableOpacity
                    key={trip.id}
                    style={styles.shortcutChip}
                    onPress={() => onSelectSavedTrip?.(trip)}
                    accessibilityRole="button"
                    accessibilityLabel={`Plan saved trip ${trip.name}`}
                  >
                    <Icon name={trip.icon || 'Route'} size={14} color={COLORS.primary} />
                    <Text style={styles.shortcutChipText} numberOfLines={1}>
                      {trip.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {(onSaveFromPlace || onSaveToPlace) && (
        <View style={styles.savePlaceRow}>
          {onSaveFromPlace && (
            <TouchableOpacity style={styles.savePlaceButton} onPress={onSaveFromPlace}>
              <Icon name="Star" size={13} color={COLORS.textSecondary} />
              <Text style={styles.savePlaceButtonText}>Save start</Text>
            </TouchableOpacity>
          )}
          {onSaveToPlace && (
            <TouchableOpacity style={styles.savePlaceButton} onPress={onSaveToPlace}>
              <Icon name="Star" size={13} color={COLORS.textSecondary} />
              <Text style={styles.savePlaceButtonText}>Save destination</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Time picker (Leave Now / Depart At / Arrive By) */}
      <View style={styles.timePickerAligned}>
        <TimePicker
          value={selectedTime || new Date()}
          mode={HOOK_TO_PICKER[timeMode] || 'now'}
          onChange={(newTime, pickerMode) => {
            const hookMode = PICKER_TO_HOOK[pickerMode] || 'now';
            if (onTimeModeChange) onTimeModeChange(hookMode);
            if (hookMode === 'now') {
              onSelectedTimeChange && onSelectedTimeChange(null);
            } else {
              onSelectedTimeChange && onSelectedTimeChange(newTime);
            }
          }}
        />
      </View>

      {isLoading && (
        <View
          style={styles.planningStatus}
          accessibilityRole="progressbar"
          accessibilityLabel="Planning your trip"
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.planningStatusText}>Planning your trip…</Text>
        </View>
      )}

      {/* Search button (shown for non-'now' modes) */}
      {timeMode !== 'now' && onSearch && (
        <TouchableOpacity
          style={[styles.searchBtn, isLoading && styles.searchBtnDisabled]}
          onPress={onSearch}
          disabled={isLoading}
          accessibilityLabel="Search trips"
          accessibilityRole="button"
          accessibilityState={{ disabled: isLoading, busy: isLoading }}
        >
          <Text style={styles.searchBtnText}>{isLoading ? 'Searching…' : 'Search'}</Text>
        </TouchableOpacity>
      )}
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
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    position: 'relative',
  },
  shortcutsContainer: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
    gap: SPACING.xs,
  },
  shortcutGroup: {
    gap: 4,
  },
  shortcutTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
  },
  shortcutChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  shortcutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 148,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primarySubtle,
  },
  shortcutChipText: {
    flexShrink: 1,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
  },
  savePlaceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  savePlaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.grey100,
  },
  savePlaceButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xxs,
  },
  fieldIndicator: {
    width: FIELD_INDICATOR_WIDTH,
    alignItems: 'center',
    marginRight: FIELD_INDICATOR_GAP,
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
  fieldWrapperWithActionGutter: {
    paddingRight: FIELD_ACTION_GUTTER,
  },
  input: {
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    height: 38,
    fontSize: FONT_SIZES.sm,
  },
  useLocationRow: {
    marginLeft: FIELD_INDICATOR_WIDTH + FIELD_INDICATOR_GAP,
    marginRight: FIELD_ACTION_GUTTER,
    marginBottom: SPACING.xs,
    alignItems: 'flex-start',
  },
  useLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    minHeight: 34,
    paddingVertical: SPACING.xxs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primarySubtle,
  },
  useLocationButtonBusy: {
    opacity: 0.85,
  },
  useLocationText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
  },
  timePickerAligned: {
    marginLeft: FIELD_INDICATOR_WIDTH + FIELD_INDICATOR_GAP,
    marginRight: FIELD_ACTION_GUTTER,
  },
  planningStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: FIELD_INDICATOR_WIDTH + FIELD_INDICATOR_GAP,
    marginTop: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primarySubtle,
    gap: SPACING.xs,
  },
  planningStatusText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primaryDark,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  swapButton: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginLeft: 'auto',
  },
  searchBtnDisabled: {
    opacity: 0.75,
  },
  searchBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  typingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
});

export default TripSearchHeader;
