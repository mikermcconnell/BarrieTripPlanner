import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useTransit } from '../context/TransitContext';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { autocompleteAddress } from '../services/locationIQService';

const SearchScreen = () => {
  const { stops, routes, isLoadingStatic } = useTransit();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('stops'); // 'stops', 'routes', or 'addresses'
  const [addressResults, setAddressResults] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const debounceRef = useRef(null);

  // Debounced address search
  useEffect(() => {
    if (searchType !== 'addresses') return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = searchQuery.trim();
    if (query.length < 3) {
      setAddressResults([]);
      setAddressLoading(false);
      return;
    }

    setAddressLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await autocompleteAddress(query);
        setAddressResults(results);
      } catch {
        setAddressResults([]);
      } finally {
        setAddressLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, searchType]);

  // Filter stops or routes based on search query
  const filteredResults = useMemo(() => {
    if (searchType === 'addresses') return addressResults;

    const query = searchQuery.toLowerCase().trim();

    if (!query) {
      if (searchType === 'stops') {
        return stops.slice(0, 20); // Show first 20 stops
      }
      return routes;
    }

    if (searchType === 'stops') {
      return stops.filter(
        (stop) =>
          stop.name.toLowerCase().includes(query) ||
          stop.code.toLowerCase().includes(query) ||
          stop.id.toLowerCase().includes(query)
      );
    }

    return routes.filter(
      (route) =>
        route.shortName.toLowerCase().includes(query) ||
        route.longName.toLowerCase().includes(query)
    );
  }, [searchQuery, searchType, stops, routes, addressResults]);

  const renderStopItem = ({ item }) => (
    <TouchableOpacity style={styles.resultItem}>
      <View style={styles.stopIcon}>
        <Text style={styles.stopIconText}>🚏</Text>
      </View>
      <View style={styles.resultContent}>
        <Text style={styles.resultTitle}>{item.name}</Text>
        <Text style={styles.resultSubtitle}>Stop #{item.code}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const renderRouteItem = ({ item }) => (
    <TouchableOpacity style={styles.resultItem}>
      <View style={[styles.routeIcon, { backgroundColor: item.color || COLORS.primary }]}>
        <Text style={styles.routeIconText}>{item.shortName}</Text>
      </View>
      <View style={styles.resultContent}>
        <Text style={styles.resultTitle}>{item.longName || `Route ${item.shortName}`}</Text>
        <Text style={styles.resultSubtitle}>Route {item.shortName}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const renderAddressItem = ({ item }) => (
    <TouchableOpacity style={styles.resultItem}>
      <View style={styles.addressIcon}>
        <Text style={styles.addressIconText}>{'\uD83D\uDCCD'}</Text>
      </View>
      <View style={styles.resultContent}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {item.shortName || item.displayName}
        </Text>
        {item.displayName && item.shortName && item.displayName !== item.shortName && (
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            {item.displayName}
          </Text>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const getRenderItem = () => {
    if (searchType === 'stops') return renderStopItem;
    if (searchType === 'routes') return renderRouteItem;
    return renderAddressItem;
  };

  const getPlaceholder = () => {
    if (searchType === 'stops') return 'Search stops...';
    if (searchType === 'routes') return 'Search routes...';
    return 'Search addresses...';
  };

  const getResultsLabel = () => {
    if (searchType === 'addresses') {
      if (addressLoading) return 'Searching...';
      if (searchQuery.trim().length < 3) return 'Type at least 3 characters';
      return `${filteredResults.length} address${filteredResults.length !== 1 ? 'es' : ''} found`;
    }
    return `${filteredResults.length} ${searchType === 'stops' ? 'stops' : 'routes'} found`;
  };

  if (isLoadingStatic) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={getPlaceholder()}
            placeholderTextColor={COLORS.grey500}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearButton}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search Type Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, searchType === 'stops' && styles.toggleButtonActive]}
          onPress={() => setSearchType('stops')}
        >
          <Text
            style={[styles.toggleButtonText, searchType === 'stops' && styles.toggleButtonTextActive]}
          >
            Stops
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, searchType === 'routes' && styles.toggleButtonActive]}
          onPress={() => setSearchType('routes')}
        >
          <Text
            style={[
              styles.toggleButtonText,
              searchType === 'routes' && styles.toggleButtonTextActive,
            ]}
          >
            Routes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, searchType === 'addresses' && styles.toggleButtonActive]}
          onPress={() => setSearchType('addresses')}
        >
          <Text
            style={[
              styles.toggleButtonText,
              searchType === 'addresses' && styles.toggleButtonTextActive,
            ]}
          >
            Addresses
          </Text>
        </TouchableOpacity>
      </View>

      {/* Results Count */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsCount}>{getResultsLabel()}</Text>
      </View>

      {/* Loading indicator for address search */}
      {searchType === 'addresses' && addressLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      )}

      {/* Results List */}
      <FlatList
        data={filteredResults}
        keyExtractor={(item) => item.id?.toString()}
        renderItem={getRenderItem()}
        style={styles.resultsList}
        contentContainerStyle={styles.resultsContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No results found</Text>
            <Text style={styles.emptySubtext}>Try a different search term</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    ...SHADOWS.small,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
  },
  clearButton: {
    fontSize: 18,
    color: COLORS.grey500,
    padding: SPACING.xs,
  },
  toggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  toggleButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  toggleButtonTextActive: {
    color: COLORS.white,
  },
  resultsHeader: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  resultsCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  resultsList: {
    flex: 1,
  },
  resultsContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.small,
  },
  stopIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  stopIconText: {
    fontSize: 20,
  },
  routeIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  routeIconText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: FONT_SIZES.md,
  },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  addressIconText: {
    fontSize: 20,
  },
  loadingRow: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  resultSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.grey400,
    marginLeft: SPACING.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: SPACING.xxl,
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.md,
    color: COLORS.grey500,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
});

export default SearchScreen;
