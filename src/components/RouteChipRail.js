import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZES, FONT_FAMILIES, BORDER_RADIUS } from '../config/theme';
import { sortRoutesByNumber } from '../utils/routeSorting';
import { getRouteFamilyId } from '../utils/routeDetourMatching';
import { HOME_MAP_THEME } from '../config/homeMapTheme';

const RouteChipRail = ({
  visible = true,
  routes = [],
  selectedRoutes = new Set(),
  onRouteSelect,
  onRouteFamilySelect,
  getRouteColor,
  isRouteDetouring,
  embedded = false,
  style,
}) => {
  const routeFamilies = useMemo(() => {
    const familiesById = new Map();
    sortRoutesByNumber(routes).forEach((route) => {
      const routeId = route.id;
      const familyId = getRouteFamilyId(route.shortName || routeId);
      if (!familiesById.has(familyId)) {
        familiesById.set(familyId, {
          familyId,
          label: familyId,
          routes: [],
        });
      }
      familiesById.get(familyId).routes.push(route);
    });
    return Array.from(familiesById.values());
  }, [routes]);
  const hasSelection = selectedRoutes.size > 0;

  if (!visible || routeFamilies.length === 0) return null;

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded, style]} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={[styles.chip, styles.allChip, !hasSelection && styles.allChipActive]}
          onPress={() => onRouteSelect?.(null)}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="Show all routes"
          accessibilityState={{ selected: !hasSelection }}
        >
          <Text style={[styles.chipText, !hasSelection && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>

        {routeFamilies.map((family) => {
          const familyRouteIds = family.routes.map((route) => route.id).filter(Boolean);
          const representativeRouteId = familyRouteIds.find((routeId) => selectedRoutes.has(routeId)) || familyRouteIds[0];
          const routeColor = getRouteColor?.(representativeRouteId) || COLORS.primary;
          const isSelected = familyRouteIds.length > 0 && familyRouteIds.every((routeId) => selectedRoutes.has(routeId));
          const isDetouring = familyRouteIds.some((routeId) => isRouteDetouring?.(routeId));

          return (
            <View key={family.familyId} style={styles.chipWrap}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  styles.routeChip,
                  isSelected
                    ? { backgroundColor: routeColor, borderColor: routeColor }
                    : { borderLeftColor: routeColor },
                ]}
                onPress={() => onRouteFamilySelect?.(familyRouteIds)}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel={`${isSelected ? 'Hide' : 'Show'} route family ${family.label} on map`}
                accessibilityState={{ selected: isSelected }}
              >
                <View style={[styles.routeDot, { backgroundColor: isSelected ? COLORS.white : routeColor }]} />
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{family.label}</Text>
              </TouchableOpacity>
              {isDetouring && <View style={styles.detourDot} />}
            </View>
          );
        })}
      </ScrollView>
      <LinearGradient
        testID="route-chip-rail-scroll-fade"
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.96)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.scrollFade}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.sm,
    right: 64,
    zIndex: 1000,
  },
  containerEmbedded: {
    position: 'relative',
    left: undefined,
    right: undefined,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: 2,
    paddingRight: 28,
    paddingVertical: 0,
  },
  scrollFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 32,
    borderTopRightRadius: BORDER_RADIUS.round,
    borderBottomRightRadius: BORDER_RADIUS.round,
  },
  chipWrap: {
    position: 'relative',
  },
  chip: {
    minWidth: HOME_MAP_THEME.routeChipMinWidth,
    height: HOME_MAP_THEME.routeChipHeight,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  allChip: {
    borderColor: 'rgba(12, 140, 229, 0.24)',
  },
  allChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  routeChip: {
    flexDirection: 'row',
    gap: 6,
  },
  routeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  chipText: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textPrimary,
  },
  chipTextActive: {
    color: COLORS.white,
  },
  detourDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: COLORS.warning,
    borderWidth: 1,
    borderColor: COLORS.white,
  },
});

export default RouteChipRail;
