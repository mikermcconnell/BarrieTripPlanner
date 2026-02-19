/**
 * AddressAutocomplete Component
 *
 * A text input with dropdown suggestions for addresses.
 * Uses LocationIQ API with debouncing to minimize API calls.
 *
 * HOW IT WORKS:
 * 1. User types in the input field
 * 2. After 300ms of no typing (debounce), we call LocationIQ
 * 3. Suggestions appear in a dropdown below the input
 * 4. User taps a suggestion to select it
 * 5. onSelect callback is called with the location data
 *
 * PROPS:
 * - value: string - Current text value
 * - onChangeText: function - Called when text changes
 * - onSelect: function - Called when user selects a suggestion
 * - placeholder: string - Input placeholder text
 * - icon: React element - Icon to show on left side
 * - rightIcon: React element - Icon/button on right side
 * - style: object - Additional styles for container
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { autocompleteAddress, getDistanceFromBarrie } from '../services/locationIQService';
import { LOCATIONIQ_CONFIG } from '../config/constants';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

const AddressAutocomplete = ({
  value,
  onChangeText,
  onSelect,
  placeholder = 'Search for an address',
  icon,
  rightIcon,
  style,
  inputStyle,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
}) => {
  // State for suggestions dropdown
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Track the last search to avoid duplicate requests
  const lastSearchRef = useRef('');
  const debounceTimerRef = useRef(null);
  const isFocusedRef = useRef(false);

  /**
   * Debounced search function
   *
   * Waits for user to stop typing before making API call.
   * This reduces API calls from ~10 per search to ~3-5.
   */
  const debouncedSearch = useCallback((searchText) => {
    // Clear any existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Don't search for very short queries
    if (!searchText || searchText.trim().length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    // Don't search if it's the same as last search
    if (searchText === lastSearchRef.current) {
      return;
    }

    // Set a timer to search after debounce delay
    debounceTimerRef.current = setTimeout(async () => {
      lastSearchRef.current = searchText;
      setIsLoading(true);
      setSearchError(null);

      try {
        const results = await autocompleteAddress(searchText);

        // Sort results by distance from Barrie (closest first)
        const sortedResults = results.sort((a, b) => {
          const distA = getDistanceFromBarrie(a.lat, a.lon);
          const distB = getDistanceFromBarrie(b.lat, b.lon);
          return distA - distB;
        });

        setSuggestions(sortedResults);
        setShowDropdown(isFocusedRef.current && sortedResults.length > 0);
      } catch (error) {
        console.error('Autocomplete search error:', error);
        setSuggestions([]);
        setSearchError(error.message || 'Address search unavailable');
      } finally {
        setIsLoading(false);
      }
    }, LOCATIONIQ_CONFIG.DEBOUNCE_MS);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  /**
   * Handle text input change
   */
  const handleChangeText = (text) => {
    onChangeText(text);
    debouncedSearch(text);
  };

  /**
   * Handle suggestion selection
   */
  const handleSelect = (item) => {
    // Cancel pending searches so a selection doesn't immediately reopen dropdown
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Mark this value as already searched to avoid duplicate lookup on same text
    lastSearchRef.current = item.shortName;

    // Update the text input
    onChangeText(item.shortName);

    // Hide dropdown
    setShowDropdown(false);
    setSuggestions([]);
    Keyboard.dismiss();

    // Call the onSelect callback with full location data
    onSelect({
      lat: item.lat,
      lon: item.lon,
      displayName: item.displayName,
      shortName: item.shortName,
      address: item.address,
    });
  };

  /**
   * Handle input focus
   */
  const handleFocus = () => {
    isFocusedRef.current = true;

    // Show dropdown if we have suggestions
    if (suggestions.length > 0) {
      setShowDropdown(true);
    }
  };

  /**
   * Handle input blur
   */
  const handleBlur = () => {
    isFocusedRef.current = false;

    // Delay hiding dropdown to allow tap on suggestion
    setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  };

  /**
   * Render a single suggestion item
   */
  const renderSuggestion = ({ item }) => {
    const distance = getDistanceFromBarrie(item.lat, item.lon);
    const distanceText = distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`;

    return (
      <TouchableOpacity
        style={styles.suggestionItem}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.suggestionIcon}>
          <Text style={styles.suggestionIconText}>📍</Text>
        </View>
        <View style={styles.suggestionContent}>
          <Text style={styles.suggestionMain} numberOfLines={1}>
            {item.shortName}
          </Text>
          <Text style={styles.suggestionSecondary} numberOfLines={1}>
            {item.displayName}
          </Text>
        </View>
        <Text style={styles.suggestionDistance}>{distanceText}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, style]}>
      {/* Input Row */}
      <View style={styles.inputContainer}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}

        <TextInput
          style={[styles.input, inputStyle, disabled && styles.inputDisabled]}
          value={value}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={COLORS.grey500}
          editable={!disabled}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="words"
          accessibilityLabel={accessibilityLabel || placeholder}
          accessibilityHint={accessibilityHint}
        />

        {isLoading && (
          <ActivityIndicator
            size="small"
            color={COLORS.primary}
            style={styles.loadingIndicator}
          />
        )}

        {rightIcon && <View style={styles.rightIconContainer}>{rightIcon}</View>}
      </View>

      {/* Error Message */}
      {searchError && !showDropdown && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{searchError}</Text>
        </View>
      )}

      {/* Suggestions Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderSuggestion}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={styles.suggestionsList}
          />
          {/* Attribution — show source of results */}
          <View style={styles.attribution}>
            <Text style={styles.attributionText}>
              {suggestions.every((s) => s.source === 'local')
                ? 'Address data: City of Barrie Open Data'
                : 'Powered by LocationIQ'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 24,
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
  },
  inputDisabled: {
    backgroundColor: COLORS.grey200,
    color: COLORS.textDisabled,
  },
  loadingIndicator: {
    position: 'absolute',
    right: 56,
  },
  rightIconContainer: {
    marginLeft: SPACING.xs,
  },
  dropdown: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    ...SHADOWS.medium,
    maxHeight: 250,
    zIndex: 1000,
  },
  suggestionsList: {
    maxHeight: 220,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  suggestionIconText: {
    fontSize: 14,
  },
  suggestionContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  suggestionMain: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  suggestionSecondary: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  suggestionDistance: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.grey500,
    minWidth: 40,
    textAlign: 'right',
  },
  attribution: {
    padding: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    alignItems: 'center',
  },
  attributionText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.grey500,
  },
  errorContainer: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  errorText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.error,
  },
});

export default AddressAutocomplete;
