import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ScaleButton from './ScaleButton';
import { COLORS, SPACING, SHADOWS, FONT_SIZES, BORDER_RADIUS } from '../config/theme';

const HomeScreenControls = ({
    routes,
    selectedRoutes, // Changed from selectedRoute to Set of selected routes
    onRouteSelect,
    getRouteColor, // pass function
    showStops,
    onToggleStops,
    showRoutes,
    onToggleRoutes,
    onCenterMap,
}) => {
    // Sort routes from largest to smallest as requested
    const sortedRoutes = [...routes].sort((a, b) => {
        const numA = parseInt(a.shortName, 10);
        const numB = parseInt(b.shortName, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numB - numA;
        }
        return b.shortName.localeCompare(a.shortName);
    });

    return (
        <>
            {/* Control Floating Buttons (Right Side) */}
            <View style={styles.controlsContainer}>
                <ScaleButton
                    style={[styles.controlButton, showStops && styles.controlButtonActive]}
                    onPress={onToggleStops}
                >
                    <Text style={styles.controlButtonText}>🚏</Text>
                </ScaleButton>

                <ScaleButton
                    style={[styles.controlButton, !showRoutes && styles.controlButtonInactive]}
                    onPress={onToggleRoutes}
                >
                    <Text style={styles.controlButtonText}>🚌</Text>
                </ScaleButton>

                <ScaleButton style={styles.controlButton} onPress={onCenterMap}>
                    <Text style={styles.controlButtonText}>📍</Text>
                </ScaleButton>
            </View>

            {/* Route Sidebar (Left Side) */}
            <View style={styles.sidebarContainer}>
                {/* All Routes Button - shows when no routes selected */}
                <ScaleButton
                    style={[
                        styles.sidebarButton,
                        selectedRoutes.size === 0 && styles.sidebarButtonActive
                    ]}
                    onPress={() => onRouteSelect(null)}
                >
                    <Text style={[
                        styles.sidebarButtonText,
                        selectedRoutes.size === 0 && styles.sidebarButtonTextActive
                    ]}>
                        All
                    </Text>
                </ScaleButton>

                {/* Route Buttons - toggle on/off */}
                {sortedRoutes.map((r) => (
                    <ScaleButton
                        key={r.id}
                        style={[
                            styles.sidebarButton,
                            selectedRoutes.has(r.id) && styles.sidebarButtonActive,
                        ]}
                        onPress={() => onRouteSelect(r.id)}
                    >
                        <View style={[styles.routeDot, { backgroundColor: getRouteColor(r.id) }]} />
                        <Text
                            style={[
                                styles.sidebarButtonText,
                                selectedRoutes.has(r.id) && styles.sidebarButtonTextActive
                            ]}
                        >
                            {r.shortName}
                        </Text>
                    </ScaleButton>
                ))}
            </View>
        </>
    );
};

const styles = StyleSheet.create({
    sidebarContainer: {
        position: 'absolute',
        top: 140, // Pushed down to balance with header
        left: SPACING.md,
        width: 60, // Fixed width for sidebar
        flexDirection: 'column', // Vertical stack
        gap: SPACING.sm,
        // No background, just floating buttons
    },
    sidebarButton: {
        width: 48,
        height: 48,
        borderRadius: 24, // Circular
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        flexDirection: 'row', // Keep row for dot + text (though it might be tight)
        justifyContent: 'center',
        alignItems: 'center',
        ...SHADOWS.small,
    },
    sidebarButtonActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
        transform: [{ scale: 1.1 }], // Slight pop when active
    },
    sidebarButtonText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginLeft: 2, // Space from dot
    },
    sidebarButtonTextActive: {
        color: COLORS.white,
    },
    routeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 2,
    },
    controlsContainer: {
        position: 'absolute',
        bottom: 100,
        right: SPACING.md,
        gap: SPACING.sm,
    },
    controlButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: COLORS.surface,
        justifyContent: 'center',
        alignItems: 'center',
        ...SHADOWS.medium,
    },
    controlButtonActive: {
        backgroundColor: COLORS.primaryLight,
    },
    controlButtonInactive: {
        opacity: 0.5,
    },
    controlButtonText: {
        fontSize: 24,
    },
});

export default HomeScreenControls;
