import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, FONT_FAMILIES, BORDER_RADIUS, SHADOWS } from '../config/theme';
import { sortRoutesByNumber } from '../utils/routeSorting';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import {
    buildOfficialImpactBody,
    findOfficialImpactsForRoute,
    PLANNED_DETOUR_NOTICE_LABEL,
} from '../utils/officialServiceImpacts';

const RouteFilterSheet = ({
    sheetRef,
    routes,
    selectedRoutes,
    onRouteSelect,
    getRouteColor,
    isRouteDetouring,
    officialServiceImpacts = [],
    onSheetChange,
}) => {
    const insets = useSafeAreaInsets();
    const bottomInset = useSafeBottomInset(insets.bottom);
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

    const sortedRoutes = useMemo(() => sortRoutesByNumber(routes), [routes]);
    const selectedOfficialImpacts = useMemo(() => {
        const selectedRouteIds = selectedRoutes?.size > 0
            ? [...selectedRoutes]
            : [];
        const seen = new Set();

        return selectedRouteIds.flatMap((routeId) => findOfficialImpactsForRoute(routeId, officialServiceImpacts))
            .filter((impact) => {
                const key = impact?.id || `${impact?.title}-${impact?.sourceUrl}`;
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, [officialServiceImpacts, selectedRoutes]);

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            snapPoints={snapPoints}
            enablePanDownToClose
            backdropComponent={renderBackdrop}
            backgroundStyle={styles.sheetBackground}
            handleIndicatorStyle={styles.handleIndicator}
            onChange={onSheetChange}
        >
            <BottomSheetScrollView
                contentContainerStyle={[
                    styles.content,
                    { paddingBottom: addSafeBottomPadding(SPACING.xxl, bottomInset) },
                ]}
            >
                <Text style={styles.eyebrow}>Map layers</Text>
                <Text style={styles.title}>Choose routes to show</Text>
                <Text style={styles.subtitle}>Keep the map calm by focusing on the routes you care about.</Text>
                {selectedOfficialImpacts.map((impact) => (
                    <View key={impact.id || impact.title} style={styles.officialNoticeCard}>
                        <Text style={styles.officialNoticeLabel}>{PLANNED_DETOUR_NOTICE_LABEL}</Text>
                        <Text style={styles.officialNoticeTitle}>{impact.title || 'Official service notice'}</Text>
                        <Text style={styles.officialNoticeBody}>{buildOfficialImpactBody(impact)}</Text>
                    </View>
                ))}
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
                        const hasOfficialImpact = findOfficialImpactsForRoute(r.id, officialServiceImpacts).length > 0;
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
                                {hasOfficialImpact && !isDetouring && <View style={styles.officialDot} />}
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
        backgroundColor: COLORS.grey50,
        borderTopLeftRadius: BORDER_RADIUS.xxl,
        borderTopRightRadius: BORDER_RADIUS.xxl,
    },
    handleIndicator: {
        backgroundColor: COLORS.primaryLight,
        width: 44,
    },
    content: {
        paddingHorizontal: SPACING.lg,
        paddingBottom: SPACING.xxl,
    },
    eyebrow: {
        fontSize: FONT_SIZES.xxs,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.primaryDark,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginTop: SPACING.xs,
        marginBottom: 2,
    },
    title: {
        fontSize: FONT_SIZES.lg,
        fontFamily: FONT_FAMILIES.semibold,
        color: COLORS.textPrimary,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.textSecondary,
        marginBottom: SPACING.md,
    },
    officialNoticeCard: {
        backgroundColor: COLORS.infoSubtle,
        borderWidth: 1,
        borderColor: COLORS.info,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.sm,
        marginBottom: SPACING.md,
    },
    officialNoticeLabel: {
        fontSize: FONT_SIZES.xxs,
        fontWeight: FONT_WEIGHTS.bold,
        color: COLORS.info,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 2,
    },
    officialNoticeTitle: {
        fontSize: FONT_SIZES.sm,
        fontFamily: FONT_FAMILIES.semibold,
        color: COLORS.textPrimary,
        marginBottom: 2,
    },
    officialNoticeBody: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.textSecondary,
        lineHeight: 18,
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
        borderRadius: BORDER_RADIUS.round,
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
        backgroundColor: COLORS.warning,
        borderWidth: 1,
        borderColor: COLORS.white,
    },
    officialDot: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.info,
        borderWidth: 1,
        borderColor: COLORS.white,
    },
});

export default RouteFilterSheet;
