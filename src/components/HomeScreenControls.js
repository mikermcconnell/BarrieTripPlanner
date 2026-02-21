import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Constants from 'expo-constants';
import { COLORS, SPACING, SHADOWS, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';

const STATUS_BAR_OFFSET = Platform.OS === 'android' ? Constants.statusBarHeight : 0;

const HomeScreenControls = ({
    routes,
    selectedRoutes,
    onRouteSelect,
    getRouteColor,
    isRouteDetouring,
}) => {
    // Sort routes from largest to smallest
    const sortedRoutes = [...routes].sort((a, b) => {
        const numA = parseInt(a.shortName, 10);
        const numB = parseInt(b.shortName, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numB - numA;
        }
        return b.shortName.localeCompare(a.shortName);
    });

    return (
        <View style={styles.filterContainer}>
            <View style={styles.chipScrollContent}>
                {/* All Routes Chip */}
                <TouchableOpacity
                    style={[
                        styles.filterChip,
                        selectedRoutes.size === 0 && styles.filterChipAllActive
                    ]}
                    onPress={() => onRouteSelect(null)}
                    activeOpacity={0.7}
                >
                    <Text style={[
                        styles.filterChipText,
                        selectedRoutes.size === 0 && styles.filterChipTextActive
                    ]}>
                        All
                    </Text>
                </TouchableOpacity>

                {/* Route Chips */}
                {sortedRoutes.map((r) => {
                    const routeColor = getRouteColor(r.id);
                    const isActive = selectedRoutes.has(r.id);
                    return (
                        <View key={r.id} style={styles.chipWrapper}>
                            <TouchableOpacity
                                style={[
                                    styles.filterChip,
                                    isActive && { backgroundColor: routeColor, borderColor: routeColor },
                                ]}
                                onPress={() => onRouteSelect(r.id)}
                                activeOpacity={0.7}
                            >
                                <Text style={[
                                    styles.filterChipText,
                                    { color: isActive ? COLORS.white : routeColor }
                                ]}>
                                    {r.shortName}
                                </Text>
                            </TouchableOpacity>
                            {isRouteDetouring?.(r.id) && (
                                <View style={styles.detourDot} />
                            )}
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    filterContainer: {
        position: 'absolute',
        top: 76 + STATUS_BAR_OFFSET, // Tucked elegantly under the search bar
        left: SPACING.sm,
        right: SPACING.sm, // Full width — map controls moved to bottom-left
        zIndex: 998,
    },
    chipScrollContent: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.xs,
        paddingBottom: SPACING.xs,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        paddingHorizontal: SPACING.sm + 4,
        borderRadius: BORDER_RADIUS.xl,
        backgroundColor: COLORS.white,
        borderWidth: 1.5,
        borderColor: COLORS.grey200,
        ...SHADOWS.small,
        height: 36,
        minWidth: 50,
    },
    filterChipAllActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    filterChipText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: FONT_WEIGHTS.bold,
    },
    filterChipTextActive: {
        color: COLORS.white,
    },
    chipWrapper: {
        position: 'relative',
    },
    detourDot: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF8C00',
        borderWidth: 1,
        borderColor: 'white',
    },
});

export default HomeScreenControls;
