import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../config/theme';

const RouteFilterSheet = ({
    sheetRef,
    routes,
    selectedRoutes,
    onRouteSelect,
    getRouteColor,
    isRouteDetouring,
}) => {
    const snapPoints = useMemo(() => ['45%'], []);

    const renderBackdrop = useCallback(
        (props) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.4}
            />
        ),
        []
    );

    // Sort routes from largest to smallest (same as HomeScreenControls)
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
        <BottomSheet
            ref={sheetRef}
            index={-1}
            snapPoints={snapPoints}
            enablePanDownToClose
            backdropComponent={renderBackdrop}
            backgroundStyle={styles.sheetBackground}
            handleIndicatorStyle={styles.handleIndicator}
        >
            <BottomSheetScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>Filter Routes</Text>
                <View style={styles.chipGrid}>
                    {/* All chip */}
                    <TouchableOpacity
                        style={[
                            styles.filterChip,
                            selectedRoutes.size === 0 && styles.filterChipAllActive,
                        ]}
                        onPress={() => onRouteSelect(null)}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.filterChipText,
                            selectedRoutes.size === 0 && styles.filterChipTextActive,
                        ]}>
                            All
                        </Text>
                    </TouchableOpacity>

                    {/* Route chips */}
                    {sortedRoutes.map((r) => {
                        const routeColor = getRouteColor(r.id);
                        const isActive = selectedRoutes.has(r.id);
                        const isDetouring = isRouteDetouring?.(r.id);
                        return (
                            <View key={r.id} style={styles.chipWrapper}>
                                <TouchableOpacity
                                    style={[
                                        styles.filterChip,
                                        isActive
                                            ? { backgroundColor: routeColor, borderLeftWidth: 0 }
                                            : { backgroundColor: COLORS.grey100, borderLeftWidth: 3, borderLeftColor: routeColor },
                                    ]}
                                    onPress={() => onRouteSelect(r.id)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.filterChipText,
                                        { color: isActive ? COLORS.white : COLORS.textPrimary },
                                    ]}>
                                        {r.shortName}
                                    </Text>
                                </TouchableOpacity>
                                {isDetouring && <View style={styles.detourDot} />}
                            </View>
                        );
                    })}
                </View>
            </BottomSheetScrollView>
        </BottomSheet>
    );
};

const styles = StyleSheet.create({
    sheetBackground: {
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: BORDER_RADIUS.xl,
        borderTopRightRadius: BORDER_RADIUS.xl,
    },
    handleIndicator: {
        backgroundColor: COLORS.grey300,
        width: 40,
    },
    content: {
        paddingHorizontal: SPACING.lg,
        paddingBottom: SPACING.xxl,
    },
    title: {
        fontSize: FONT_SIZES.lg,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.textPrimary,
        marginBottom: SPACING.md,
        marginTop: SPACING.xs,
    },
    chipGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.xs,
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
        height: 36,
        minWidth: 50,
        ...SHADOWS.small,
    },
    filterChipAllActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    filterChipText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.textPrimary,
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
        borderColor: COLORS.white,
    },
});

export default RouteFilterSheet;
