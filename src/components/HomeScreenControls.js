import React from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, SHADOWS, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const HomeScreenControls = ({
    routes,
    selectedRoutes,
    onRouteSelect,
    getRouteColor,
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
        <View style={styles.filterPanel}>
            <Text style={styles.filterPanelTitle}>Routes</Text>
            <ScrollView
                style={styles.chipScroll}
                contentContainerStyle={styles.chipScrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
            >
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
                        <TouchableOpacity
                            key={r.id}
                            style={[
                                styles.filterChip,
                                isActive && { backgroundColor: routeColor, borderColor: routeColor },
                            ]}
                            onPress={() => onRouteSelect(r.id)}
                            activeOpacity={0.7}
                        >
                            <View style={[
                                styles.filterDot,
                                { backgroundColor: isActive ? COLORS.white : routeColor }
                            ]} />
                            <Text style={[
                                styles.filterChipText,
                                isActive && styles.filterChipTextActive
                            ]}>
                                {r.shortName}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    filterPanel: {
        position: 'absolute',
        top: 64,
        left: SPACING.sm,
        width: 64,
        maxHeight: SCREEN_HEIGHT - 170,
        backgroundColor: COLORS.white,
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.xs,
        alignItems: 'center',
        borderRadius: BORDER_RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.grey200,
        ...SHADOWS.medium,
        zIndex: 998,
    },
    filterPanelTitle: {
        fontSize: FONT_SIZES.xxs,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: SPACING.xs,
    },
    chipScroll: {
        flexGrow: 0,
        flexShrink: 1,
        width: '100%',
    },
    chipScrollContent: {
        alignItems: 'center',
        paddingBottom: SPACING.xs,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: SPACING.xs + 2,
        paddingHorizontal: SPACING.sm,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: COLORS.grey100,
        borderWidth: 1.5,
        borderColor: 'transparent',
        marginBottom: SPACING.xs,
        minWidth: 52,
        height: 32,
    },
    filterChipAllActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    filterDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 4,
    },
    filterChipText: {
        fontSize: FONT_SIZES.xs,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.textPrimary,
    },
    filterChipTextActive: {
        color: COLORS.white,
    },
});

export default HomeScreenControls;
