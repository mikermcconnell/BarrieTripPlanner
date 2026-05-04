/**
 * TripSearchHeader.web.js — Web-specific trip search header
 *
 * Extracted from HomeScreen.web.js to reduce file size and
 * keep rendering logic separate from trip planning state.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';
import { getDistanceFromBarrie } from '../services/locationIQService';
import { findMatchingSavedPlaces, getSavedPlaceIconName } from '../utils/savedTransitUtils';

const getSuggestionKey = (item, index) => [
  item?.id || 'suggestion',
  item?.lat ?? 'lat',
  item?.lon ?? 'lon',
  item?.shortName || item?.displayName || 'location',
  index,
].join('-');

const FIELD_INDICATOR_WIDTH = 20;
const FIELD_INDICATOR_GAP = SPACING.sm;

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

const SAVED_PLACE_GLYPHS = {
  Home: '🏠',
  Work: '💼',
  School: '🎓',
  Grocery: '🛒',
  Gym: '🏋️',
  Doctor: '✚',
  MapPin: '📍',
};

const SavedPlaceGlyph = ({ place }) => (
  <Text style={styles.shortcutChipIcon}>
    {SAVED_PLACE_GLYPHS[getSavedPlaceIconName(place)] || SAVED_PLACE_GLYPHS.MapPin}
  </Text>
);

const formatTripTimeSummary = (timeMode, selectedTime) => {
  if (timeMode === 'now') return 'Leave now';

  const prefix = timeMode === 'arriveBy' ? 'Arrive by' : 'Depart at';
  return `${prefix} ${formatTimeDisplay(selectedTime || new Date())}`;
};

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
  isTypingFrom = false,
  isTypingTo = false,
  onSwap,
  onClose,
  onUseCurrentLocation,
  showUseCurrentLocation = true,
  isLocatingCurrentLocation = false,
  isLoading = false,
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
  compact = false,
}) => {
  const [activeField, setActiveField] = useState(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const visiblePlaces = savedPlaces.slice(0, 5);
  const visibleTrips = savedTrips.slice(0, 3);
  const fromSavedPlaceSuggestions = findMatchingSavedPlaces(fromText, savedPlaces);
  const toSavedPlaceSuggestions = findMatchingSavedPlaces(toText, savedPlaces);

  useEffect(() => {
    if (!compact) {
      setIsEditingSearch(false);
    }
  }, [compact]);

  useEffect(() => {
    if (activeField === 'from' && (showFromSuggestions || fromSavedPlaceSuggestions.length > 0) && (fromSavedPlaceSuggestions.length + fromSuggestions.length) > 0) {
      setActiveSuggestionIndex((prev) => Math.min(Math.max(prev, 0), fromSavedPlaceSuggestions.length + fromSuggestions.length - 1));
      return;
    }

    if (activeField === 'to' && (showToSuggestions || toSavedPlaceSuggestions.length > 0) && (toSavedPlaceSuggestions.length + toSuggestions.length) > 0) {
      setActiveSuggestionIndex((prev) => Math.min(Math.max(prev, 0), toSavedPlaceSuggestions.length + toSuggestions.length - 1));
      return;
    }

    setActiveSuggestionIndex(-1);
  }, [activeField, fromSavedPlaceSuggestions.length, fromSuggestions, toSavedPlaceSuggestions.length, toSuggestions, showFromSuggestions, showToSuggestions]);

  const handleSuggestionKeyDown = useCallback((field, suggestions, onSelect) => (e) => {
    if (!suggestions.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault?.();
      setActiveField(field);
      setActiveSuggestionIndex((prev) => {
        if (prev < 0) return 0;
        return Math.min(prev + 1, suggestions.length - 1);
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault?.();
      setActiveField(field);
      setActiveSuggestionIndex((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
      return;
    }

    if (e.key === 'Enter') {
      const index = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
      const selectedSuggestion = suggestions[index];
      if (selectedSuggestion) {
        e.preventDefault?.();
        onSelect(selectedSuggestion);
      }
    }
  }, [activeSuggestionIndex]);

  if (compact && !isEditingSearch) {
    return (
      <View style={[styles.tripPlanHeader, styles.compactTripPlanHeader]}>
        <View style={styles.compactHeaderTop}>
          <View style={styles.compactTitleGroup}>
            <Text style={styles.compactEyebrow}>Trip planned</Text>
            <Text style={styles.compactTime}>{formatTripTimeSummary(timeMode, selectedTime)}</Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityLabel="Close trip planner"
            accessibilityRole="button"
          >
            <CloseIcon size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.compactRouteRow}>
          <View style={styles.compactDots}>
            <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
            <View style={styles.compactDotConnector} />
            <View style={[styles.dot, { backgroundColor: COLORS.error }]} />
          </View>
          <View style={styles.compactRouteText}>
            <Text style={styles.compactPlaceText} numberOfLines={1}>
              {fromText || 'Your location'}
            </Text>
            <Text style={styles.compactPlaceText} numberOfLines={1}>
              {toText || 'Destination'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setIsEditingSearch(true)}
            accessibilityLabel="Edit trip search"
            accessibilityRole="button"
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
  <View style={styles.tripPlanHeader}>
    <View style={styles.tripPlanHeaderTop}>
      <Text style={styles.tripPlanTitle}>Plan Your Trip</Text>
      {compact && (
        <TouchableOpacity
          style={styles.doneEditingButton}
          onPress={() => setIsEditingSearch(false)}
          accessibilityLabel="Show compact trip search"
          accessibilityRole="button"
        >
          <Text style={styles.doneEditingButtonText}>Done</Text>
        </TouchableOpacity>
      )}
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
          onFocus={() => setActiveField('from')}
          onKeyDown={handleSuggestionKeyDown('from', showFromSuggestions ? fromSuggestions : [], onFromSelect)}
          placeholder="Your location"
          placeholderTextColor={COLORS.grey500}
          aria-label="Starting location"
        />
      </View>
    </View>

    {showUseCurrentLocation && onUseCurrentLocation && (
      <View style={styles.useLocationRow}>
        <TouchableOpacity
          style={[styles.useLocationBtn, isLocatingCurrentLocation && styles.useLocationBtnBusy]}
          onPress={() => onUseCurrentLocation()}
          disabled={isLocatingCurrentLocation}
          accessibilityLabel="Use current location"
          accessibilityRole="button"
          accessibilityState={{ busy: isLocatingCurrentLocation, disabled: isLocatingCurrentLocation }}
        >
          {isLocatingCurrentLocation ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <CenterIcon size={16} color={COLORS.primary} />
          )}
          <Text style={styles.useLocationText}>
            {isLocatingCurrentLocation ? 'Getting location…' : 'Use current location'}
          </Text>
        </TouchableOpacity>
      </View>
    )}

    {(fromSavedPlaceSuggestions.length > 0 || (showFromSuggestions && fromSuggestions.length > 0)) && (
        <View style={styles.suggestionsDropdown} role="listbox" aria-label="Origin suggestions">
        {fromSavedPlaceSuggestions.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.suggestionItem}
            onPress={() => onFromSelect(item)}
            accessibilityRole="button"
            accessibilityLabel={`Saved place: ${item.shortName}`}
          >
            <Text style={styles.suggestionSavedIcon}>★</Text>
            <Text style={styles.suggestionText} numberOfLines={1}>{item.shortName}</Text>
            <Text style={styles.suggestionDistance}>Saved</Text>
          </TouchableOpacity>
        ))}
        {fromSuggestions.slice(0, 5).map((item, index) => (
          <TouchableOpacity
            key={getSuggestionKey(item, index)}
            style={[
              styles.suggestionItem,
              activeField === 'from' && index === activeSuggestionIndex && styles.suggestionItemActive,
            ]}
            onPress={() => onFromSelect(item)}
            role="option"
            aria-selected={activeField === 'from' && index === activeSuggestionIndex}
          >
            <Text style={styles.suggestionText} numberOfLines={1}>{item.shortName}</Text>
            <Text style={styles.suggestionDistance}>
              {getDistanceFromBarrie(item.lat, item.lon).toFixed(1)}km
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    )}

    {isTypingFrom && fromSuggestions.length === 0 && (
      <View style={styles.typingIndicator}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.typingText}>Searching...</Text>
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
          onFocus={() => setActiveField('to')}
          onKeyDown={handleSuggestionKeyDown('to', showToSuggestions ? toSuggestions : [], onToSelect)}
          placeholder="Where to?"
          placeholderTextColor={COLORS.grey500}
          aria-label="Destination"
        />
      </View>
    </View>

    {(toSavedPlaceSuggestions.length > 0 || (showToSuggestions && toSuggestions.length > 0)) && (
        <View style={styles.suggestionsDropdown} role="listbox" aria-label="Destination suggestions">
        {toSavedPlaceSuggestions.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.suggestionItem}
            onPress={() => onToSelect(item)}
            accessibilityRole="button"
            accessibilityLabel={`Saved place: ${item.shortName}`}
          >
            <Text style={styles.suggestionSavedIcon}>★</Text>
            <Text style={styles.suggestionText} numberOfLines={1}>{item.shortName}</Text>
            <Text style={styles.suggestionDistance}>Saved</Text>
          </TouchableOpacity>
        ))}
        {toSuggestions.slice(0, 5).map((item, index) => (
          <TouchableOpacity
            key={getSuggestionKey(item, index)}
            style={[
              styles.suggestionItem,
              activeField === 'to' && index === activeSuggestionIndex && styles.suggestionItemActive,
            ]}
            onPress={() => onToSelect(item)}
            role="option"
            aria-selected={activeField === 'to' && index === activeSuggestionIndex}
          >
            <Text style={styles.suggestionText} numberOfLines={1}>{item.shortName}</Text>
            <Text style={styles.suggestionDistance}>
              {getDistanceFromBarrie(item.lat, item.lon).toFixed(1)}km
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    )}

    {isTypingTo && toSuggestions.length === 0 && (
      <View style={styles.typingIndicator}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.typingText}>Searching...</Text>
      </View>
    )}

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
                  <SavedPlaceGlyph place={place} />
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
            <Text style={styles.savePlaceButtonText}>Save start</Text>
          </TouchableOpacity>
        )}
        {onSaveToPlace && (
          <TouchableOpacity style={styles.savePlaceButton} onPress={onSaveToPlace}>
            <Text style={styles.savePlaceButtonText}>Save destination</Text>
          </TouchableOpacity>
        )}
      </View>
    )}

    {/* Swap + Time Row */}
    <View style={styles.controlsRow}>
      {/* Time Mode Picker */}
      <View style={styles.timePickerRow}>
        <select
          value={timeMode}
          onChange={(e) => onTimeModeChange && onTimeModeChange(e.target.value)}
          style={{
            height: 34,
            borderRadius: 8,
            border: `1px solid ${COLORS.borderLight}`,
            backgroundColor: COLORS.grey100,
            color: COLORS.textPrimary,
            fontSize: 13,
            paddingLeft: 8,
            paddingRight: 4,
            cursor: 'pointer',
          }}
          aria-label="Trip time mode"
        >
          <option value="now">Leave Now</option>
          <option value="departAt">Depart At</option>
          <option value="arriveBy">Arrive By</option>
        </select>

        {timeMode !== 'now' && (
          <input
            type="datetime-local"
            value={selectedTime ? formatDateTimeLocal(selectedTime) : ''}
            onChange={(e) => {
              if (onSelectedTimeChange && e.target.value) {
                onSelectedTimeChange(new Date(e.target.value));
              }
            }}
            style={{
              height: 34,
              borderRadius: 8,
              border: `1px solid ${COLORS.borderLight}`,
              backgroundColor: COLORS.grey100,
              color: COLORS.textPrimary,
              fontSize: 13,
              paddingLeft: 8,
              paddingRight: 8,
              marginLeft: 6,
              flex: 1,
              minWidth: 0,
            }}
            aria-label="Select date and time"
          />
        )}

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

      <TouchableOpacity
        style={styles.swapBtn}
        onPress={onSwap}
        accessibilityLabel="Swap origin and destination"
        accessibilityRole="button"
      >
        <Text style={styles.swapBtnText}>Swap</Text>
      </TouchableOpacity>
    </View>

    {isLoading && (
      <View
        style={styles.planningStatus}
        accessibilityRole="progressbar"
        accessibilityLabel="Planning your trip"
        aria-busy={true}
        aria-live="polite"
      >
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.planningStatusText}>Planning your trip…</Text>
      </View>
    )}
  </View>
  );
};

const formatTimeDisplay = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

/** Format Date to datetime-local input value (YYYY-MM-DDTHH:MM) */
const formatDateTimeLocal = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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
  compactTripPlanHeader: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  tripPlanHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  tripPlanTitle: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  doneEditingButton: {
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primarySubtle,
    marginRight: SPACING.xs,
  },
  doneEditingButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
  },
  compactHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xxs,
  },
  compactTitleGroup: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  compactEyebrow: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  compactTime: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginTop: 1,
  },
  compactRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  compactDots: {
    width: 18,
    alignItems: 'center',
  },
  compactDotConnector: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.grey300,
    marginVertical: 2,
  },
  compactRouteText: {
    flex: 1,
    gap: 2,
  },
  compactPlaceText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  editButton: {
    paddingVertical: 7,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primarySubtle,
  },
  editButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: 'transparent',
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
    width: FIELD_INDICATOR_WIDTH,
    alignItems: 'center',
    marginRight: FIELD_INDICATOR_GAP,
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
  shortcutsContainer: {
    marginLeft: FIELD_INDICATOR_WIDTH + FIELD_INDICATOR_GAP,
    marginTop: SPACING.xxs,
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
    maxWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primarySubtle,
  },
  shortcutChipIcon: {
    fontSize: FONT_SIZES.xs,
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
    marginLeft: FIELD_INDICATOR_WIDTH + FIELD_INDICATOR_GAP,
    marginBottom: SPACING.xs,
  },
  savePlaceButton: {
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
  useLocationRow: {
    marginLeft: FIELD_INDICATOR_WIDTH + FIELD_INDICATOR_GAP,
    marginBottom: SPACING.xs,
    alignItems: 'flex-start',
  },
  useLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    minHeight: 34,
    paddingVertical: SPACING.xxs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primarySubtle,
  },
  useLocationBtnBusy: {
    opacity: 0.85,
  },
  useLocationText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold,
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
  suggestionItemActive: {
    backgroundColor: COLORS.primarySubtle,
  },
  suggestionSavedIcon: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    marginRight: SPACING.xs,
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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    marginLeft: FIELD_INDICATOR_WIDTH + FIELD_INDICATOR_GAP,
    gap: SPACING.sm,
  },
  swapBtn: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'transparent',
    minHeight: 34,
    justifyContent: 'center',
  },
  swapBtnText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  timePickerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginLeft: 6,
    minHeight: 34,
    justifyContent: 'center',
  },
  searchBtnDisabled: {
    opacity: 0.75,
  },
  searchBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
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

export default TripSearchHeaderWeb;
