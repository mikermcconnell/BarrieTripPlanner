import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, FONT_WEIGHTS, SHADOWS, SPACING } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import {
  buildOfficialImpactBody,
  getOfficialImpactRouteIds,
  PLANNED_DETOUR_NOTICE_LABEL,
} from '../utils/officialServiceImpacts';

const getRouteColor = (route, routeColorByRouteId = {}) => {
  const routeKey = String(route || '').toUpperCase();
  const rootKey = routeKey.match(/^\d+/)?.[0] || routeKey;
  return routeColorByRouteId[routeKey] ||
    routeColorByRouteId[rootKey] ||
    ROUTE_COLORS[routeKey] ||
    ROUTE_COLORS[rootKey] ||
    ROUTE_COLORS.DEFAULT ||
    '#1a73e8';
};

const openImpact = (impact) => {
  const url = impact?.sourceUrl || impact?.url;
  if (url) Linking.openURL(url).catch(() => {});
};

const OfficialImpactStrip = ({
  impacts = [],
  routeColorByRouteId = {},
  inline = false,
  style,
  onDismiss,
  onPress,
}) => {
  if (!impacts.length) return null;

  const firstImpact = impacts[0];
  const countText = impacts.length === 1
    ? PLANNED_DETOUR_NOTICE_LABEL
    : `${impacts.length} planned detour notices`;
  const routeIds = getOfficialImpactRouteIds(firstImpact);
  const handlePress = () => {
    if (onPress) {
      onPress(firstImpact, routeIds);
      return;
    }
    openImpact(firstImpact);
  };

  return (
    <View style={[styles.container, inline && styles.containerInline, style]} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.card, inline && styles.cardInline]}
        activeOpacity={0.84}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${countText}: ${firstImpact.title}`}
      >
        <View style={styles.infoBadge}><Text style={styles.infoText}>i</Text></View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{countText}</Text>
          <Text style={styles.title} numberOfLines={1}>{firstImpact.title}</Text>
          <Text style={styles.body} numberOfLines={1}>{buildOfficialImpactBody(firstImpact)}</Text>
        </View>
        <View style={styles.routeRow}>
          {routeIds.slice(0, 4).map((route) => (
            <View
              key={`${firstImpact.id}-${route}`}
              style={[styles.routeBadge, { backgroundColor: getRouteColor(route, routeColorByRouteId) }]}
            >
              <Text style={styles.routeText}>{String(route).toUpperCase()}</Text>
            </View>
          ))}
        </View>
        {onDismiss && (
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={() => onDismiss(firstImpact.id)}
            accessibilityRole="button"
            accessibilityLabel="Hide planned detour notice"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.dismissText}>×</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 996,
  },
  containerInline: {
    position: 'relative',
    left: undefined,
    right: undefined,
    alignSelf: 'stretch',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 44,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(26, 115, 232, 0.22)',
    backgroundColor: 'rgba(238, 246, 255, 0.97)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...SHADOWS.small,
  },
  cardInline: {
    alignSelf: 'stretch',
  },
  infoBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySubtle,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.24)',
  },
  infoText: {
    fontSize: FONT_SIZES.md,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.primaryDark,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    marginTop: 1,
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textPrimary,
  },
  body: {
    marginTop: 1,
    fontSize: FONT_SIZES.xs,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  routeBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  routeText: {
    fontSize: 9,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  dismissButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  dismissText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.grey600,
    lineHeight: 20,
  },
});

export default OfficialImpactStrip;
