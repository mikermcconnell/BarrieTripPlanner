import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, Animated } from 'react-native';
import Constants from 'expo-constants';
import { COLORS, SPACING, SHADOWS, FONT_SIZES, FONT_WEIGHTS, FONT_FAMILIES, BORDER_RADIUS } from '../config/theme';
import { sortRoutesByNumber } from '../utils/routeSorting';
import Icon from './Icon';

const STATUS_BAR_OFFSET = Platform.OS === 'android' ? Constants.statusBarHeight : 0;

const PulsingDetourDot = () => {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scaleAnim]);

  return (
    <Animated.View
      accessible={true}
      accessibilityLabel="Route is on detour"
      style={[
        styles.detourDot,
        { transform: [{ scale: scaleAnim }] },
      ]}
    />
  );
};

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
    onOpenFilterSheet,
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

    const sortedRoutes = useMemo(() => sortRoutesByNumber(routes), [routes]);
    const selectedRouteList = useMemo(
        () => sortedRoutes.filter((route) => selectedRoutes.has(route.id)),
        [selectedRoutes, sortedRoutes]
    );
    const detourCount = useMemo(
        () => routes.filter((route) => isRouteDetouring?.(route.id)).length,
        [routes, isRouteDetouring]
    );
    const selectedCount = selectedRoutes.size;

    return (
        <View style={styles.filterContainer}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Alert Count Badge */}
                {serviceAlerts.length > 0 && (
                    <TouchableOpacity
                        style={styles.alertHeaderChip}
                        onPress={onAlertPress}
                        activeOpacity={0.7}
                    >
                        <Icon name="Warning" size={14} color={COLORS.warning} />
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

                {/* Compact route filter summary. Full route list lives in the sheet. */}
                <TouchableOpacity
                    style={[
                        styles.filterChip,
                        styles.routeSummaryChip,
                        selectedCount > 0 && styles.routeSummaryChipActive,
                    ]}
                    onPress={onOpenFilterSheet}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Open route filter${selectedCount ? `, ${selectedCount} selected` : ''}`}
                >
                    <Icon name="Route" size={14} color={selectedCount > 0 ? COLORS.white : COLORS.primary} />
                    <Text style={[
                        styles.filterChipText,
                        selectedCount > 0 && styles.filterChipTextActive,
                    ]}>
                        {selectedCount > 0 ? `${selectedCount} route${selectedCount > 1 ? 's' : ''}` : 'Routes'}
                    </Text>
                    {detourCount > 0 && <PulsingDetourDot />}
                </TouchableOpacity>

                {/* Selected routes stay visible for quick context and toggling. */}
                {selectedRouteList.slice(0, 3).map((r) => {
                    const routeColor = getRouteColor(r.id);
                    const hasAlert = hasRouteAlert(r.id);
                    return (
                        <View key={r.id} style={styles.chipWrapper}>
                            <TouchableOpacity
                                style={[
                                    styles.filterChip,
                                    styles.filterChipActive,
                                    { backgroundColor: routeColor, borderColor: routeColor },
                                ]}
                                onPress={() => onRouteSelect(r.id)}
                                onLongPress={() => hasAlert && onAlertPress?.()}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove route ${r.shortName} from map filter`}
                            >
                                <Text style={[
                                    styles.filterChipText,
                                    styles.filterChipTextActive,
                                ]}>
                                    {r.shortName}
                                </Text>
                            </TouchableOpacity>
                            {isRouteDetouring?.(r.id) && <PulsingDetourDot />}
                            {hasAlert && (
                                <View style={styles.alertDot} />
                            )}
                        </View>
                    );
                })}
                {selectedCount > 3 && (
                    <TouchableOpacity
                        style={[styles.filterChip, styles.moreRoutesChip]}
                        onPress={onOpenFilterSheet}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Open route filter, ${selectedCount - 3} more selected routes`}
                    >
                        <Text style={styles.moreRoutesText}>+{selectedCount - 3}</Text>
                    </TouchableOpacity>
                )}
                {selectedCount > 0 && (
                    <TouchableOpacity
                        style={[styles.filterChip, styles.clearChip]}
                        onPress={() => onRouteSelect(null)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Show all routes"
                    >
                        <Text style={styles.clearChipText}>All</Text>
                    </TouchableOpacity>
                )}

                {/* Spacer to separate chips from filter button */}
                <View style={styles.spacer} />
            </ScrollView>

            {/* Filter/Grid button at the right end */}
            <TouchableOpacity
                style={styles.filterIconButton}
                onPress={onOpenFilterSheet}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Open route filter"
            >
                <Icon name="Settings" size={16} color={COLORS.primaryDark} />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    filterContainer: {
        position: 'absolute',
        top: 68 + STATUS_BAR_OFFSET,
        left: SPACING.sm,
        right: SPACING.sm,
        zIndex: 998,
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        padding: 4,
        borderRadius: BORDER_RADIUS.xxl,
        backgroundColor: 'rgba(255, 255, 255, 0.62)',
        borderWidth: 1,
        borderColor: 'rgba(223, 225, 230, 0.58)',
        ...SHADOWS.small,
    },
    scrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.xs,
        paddingRight: SPACING.xs + 2,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 5,
        paddingHorizontal: SPACING.sm + 4,
        borderRadius: BORDER_RADIUS.round,
        height: 30,
        minWidth: 50,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(223, 225, 230, 0.8)',
        gap: 6,
    },
    routeSummaryChip: {
        minWidth: 92,
        borderColor: 'rgba(12, 140, 229, 0.28)',
        backgroundColor: COLORS.primarySubtle,
    },
    routeSummaryChipActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    filterChipActive: {
        borderWidth: 1,
        ...SHADOWS.small,
    },
    filterChipAllActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    filterChipText: {
        fontSize: FONT_SIZES.sm,
        fontFamily: FONT_FAMILIES.semibold,
        color: COLORS.textPrimary,
        letterSpacing: 0.3,
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
        backgroundColor: COLORS.warning,
        borderWidth: 1,
        borderColor: 'white',
    },
    alertHeaderChip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.warningSubtle,
        paddingVertical: 5,
        paddingHorizontal: SPACING.sm + 4,
        borderRadius: BORDER_RADIUS.round,
        gap: 3,
        height: 32,
        minWidth: 50,
        borderWidth: 1,
        borderColor: COLORS.warning,
    },
    alertHeaderText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.warning,
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
    spacer: {
        width: SPACING.xs,
    },
    clearChip: {
        backgroundColor: 'rgba(255,255,255,0.92)',
        minWidth: 42,
        paddingHorizontal: SPACING.sm,
    },
    clearChipText: {
        fontSize: FONT_SIZES.sm,
        fontFamily: FONT_FAMILIES.semibold,
        color: COLORS.primaryDark,
    },
    moreRoutesChip: {
        minWidth: 36,
        paddingHorizontal: SPACING.sm,
        backgroundColor: COLORS.secondarySubtle,
        borderColor: 'rgba(2, 60, 105, 0.16)',
    },
    moreRoutesText: {
        fontSize: FONT_SIZES.sm,
        fontFamily: FONT_FAMILIES.semibold,
        color: COLORS.secondaryDark,
    },
    filterIconButton: {
        width: 30,
        height: 30,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: 'rgba(255,255,255,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: SPACING.xs + 2,
        flexShrink: 0,
        borderWidth: 1,
        borderColor: 'rgba(223, 225, 230, 0.8)',
    },
});

export default HomeScreenControls;
