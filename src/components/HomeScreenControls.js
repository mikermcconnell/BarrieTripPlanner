import React, { useMemo, useCallback } from 'react';
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
    serviceAlerts = [],
    onAlertPress,
    showZones,
    onToggleZones,
    zoneCount = 0,
}) => {
    const routeAlertsMap = useMemo(() => {
        const map = new Map();
        serviceAlerts.forEach((alert) => {
            const affectedRoutes = Array.isArray(alert?.affectedRoutes) ? alert.affectedRoutes : [];
            affectedRoutes.forEach((routeId) => {
                map.set(routeId, (map.get(routeId) || 0) + 1);
            });
        });
        return map;
    }, [serviceAlerts]);

    const hasRouteAlert = useCallback((routeId) => (routeAlertsMap.get(routeId) || 0) > 0, [routeAlertsMap]);

    // Sort routes from largest to smallest
    const sortedRoutes = useMemo(() => [...routes].sort((a, b) => {
        const labelA = String(a?.shortName ?? a?.id ?? '');
        const labelB = String(b?.shortName ?? b?.id ?? '');
        const numA = parseInt(labelA, 10);
        const numB = parseInt(labelB, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numB - numA;
        }
        return labelB.localeCompare(labelA);
    }), [routes]);

    return (
        <View style={styles.filterContainer}>
            <View style={styles.chipScrollContent}>
                {/* Alert Count Badge */}
                {serviceAlerts.length > 0 && (
                    <TouchableOpacity
                        style={styles.alertHeaderChip}
                        onPress={onAlertPress}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.alertHeaderIcon}>⚠️</Text>
                        <Text style={styles.alertHeaderText}>{serviceAlerts.length}</Text>
                    </TouchableOpacity>
                )}
                {/* Zones Toggle Chip */}
                {zoneCount > 0 && (
                    <TouchableOpacity
                        style={[
                            styles.filterChip,
                            showZones && styles.filterChipZonesActive
                        ]}
                        onPress={onToggleZones}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.filterChipText,
                            showZones && styles.filterChipTextActive
                        ]}>
                            Zones
                        </Text>
                        <View style={[styles.zoneCountBadge, showZones && styles.zoneCountBadgeActive]}>
                            <Text style={[styles.zoneCountText, showZones && styles.zoneCountTextActive]}>
                                {zoneCount}
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}
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
                    const hasAlert = hasRouteAlert(r.id);
                    return (
                        <View key={r.id} style={styles.chipWrapper}>
                            <TouchableOpacity
                                style={[
                                    styles.filterChip,
                                    isActive && { backgroundColor: routeColor, borderColor: routeColor },
                                    hasAlert && !isActive && styles.filterChipWithAlert,
                                ]}
                                onPress={() => onRouteSelect(r.id)}
                                onLongPress={() => hasAlert && onAlertPress?.()}
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
                                <View
                                    accessible={true}
                                    accessibilityLabel={`Route ${r.shortName} is on detour`}
                                    style={styles.detourDot}
                                />
                            )}
                            {hasAlert && (
                                <View style={[styles.alertDot, isActive && styles.alertDotActive]} />
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
        justifyContent: 'center',
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
    alertHeaderChip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.warningSubtle,
        paddingVertical: 6,
        paddingHorizontal: SPACING.sm + 4,
        borderRadius: BORDER_RADIUS.xl,
        gap: 3,
        height: 36,
        minWidth: 50,
        borderWidth: 1.5,
        borderColor: COLORS.warning,
    },
    alertHeaderIcon: {
        fontSize: 14,
    },
    alertHeaderText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.warning,
    },
    filterChipWithAlert: {
        borderColor: COLORS.warning,
    },
    alertDot: {
        position: 'absolute',
        top: -2,
        left: -2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.warning,
        borderWidth: 1,
        borderColor: 'white',
    },
    alertDotActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
    },
    filterChipZonesActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    zoneCountBadge: {
        backgroundColor: COLORS.grey200,
        borderRadius: 8,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4,
        paddingHorizontal: 4,
    },
    zoneCountBadgeActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    zoneCountText: {
        fontSize: FONT_SIZES.xxs,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.textSecondary,
    },
    zoneCountTextActive: {
        color: COLORS.white,
    },
});

export default HomeScreenControls;
