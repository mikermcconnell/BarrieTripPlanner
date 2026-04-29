import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, FONT_FAMILIES, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import Icon from './Icon';
import { useDetourAlertStrip } from '../hooks/useDetourAlertStrip';

/**
 * DetourAlertStrip (web) — collapsible amber banner showing active detours.
 *
 * All state and logic lives in useDetourAlertStrip; this file is rendering only.
 * Differs from native only in styles (boxShadow, cursor).
 */
const DetourAlertStrip = ({
  activeDetours,
  onPress,
  alertBannerVisible,
  routes = [],
  style,
  inline = false,
}) => {
  const {
    expanded, toggleExpanded, routeIds, topOffset, getRouteName,
    visibleIds, overflowCount, countText, shouldRender,
  } = useDetourAlertStrip({ activeDetours, alertBannerVisible, routes });

  if (!shouldRender) return null;

  const handleCollapsedPress = () => {
    if (routeIds.length === 1) {
      onPress?.(routeIds[0]);
      return;
    }
    toggleExpanded();
  };

  return (
    <View
      style={[
        styles.container,
        !inline && { top: topOffset },
        inline && styles.containerInline,
        style,
      ]}
      pointerEvents="box-none"
    >
      {/* ── Collapsed bar (always visible) ─────────────────────────── */}
      <TouchableOpacity
        style={[styles.collapsedBar, inline && styles.collapsedBarInline]}
        onPress={handleCollapsedPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          routeIds.length === 1
            ? `Open Route ${getRouteName(routeIds[0])} detour details`
            : expanded ? 'Collapse detour list' : 'Expand detour list'
        }
        accessibilityHint={routeIds.length === 1 ? 'Shows skipped stops and detour details' : countText}
      >
        <Icon name="Warning" size={16} color={COLORS.warning} />
        <Text style={styles.countText} numberOfLines={1}>
          {countText}
        </Text>
        <View style={[styles.pillsRow, inline && styles.pillsRowInline]}>
          {routeIds.slice(0, 3).map((routeId) => {
            const color = ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
            return (
              <View key={routeId} style={[styles.routePill, { backgroundColor: color }]}>
                <Text style={styles.routePillText}>{getRouteName(routeId)}</Text>
              </View>
            );
          })}
          {routeIds.length > 3 && (
            <Text style={styles.pillOverflow}>+{routeIds.length - 3}</Text>
          )}
        </View>
        <Text style={[styles.chevron, expanded && styles.chevronExpanded]}>▼</Text>
      </TouchableOpacity>

      {/* ── Expanded detail panel ───────────────────────────────────── */}
      {expanded && (
        <View style={[styles.expandedPanel, inline && styles.expandedPanelInline]}>
          {visibleIds.map((routeId) => {
            const routeColor = ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
            const detour = activeDetours[routeId];
            const isClearPending = detour?.state === 'clear-pending';

            return (
              <TouchableOpacity
                key={routeId}
                style={[
                  styles.detailRow,
                  { borderLeftColor: routeColor },
                  isClearPending && styles.detailRowFaded,
                ]}
                onPress={() => onPress?.(routeId)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Route ${getRouteName(routeId)} detour details`}
              >
                <View style={[styles.routePill, { backgroundColor: routeColor }]}>
                  <Text style={styles.routePillText}>{getRouteName(routeId)}</Text>
                </View>
                <Text style={styles.detailLabel} numberOfLines={1}>
                  Route {getRouteName(routeId)} — {isClearPending ? 'Clearing...' : 'On detour'}
                </Text>
                <Text style={styles.chevronRight}>›</Text>
              </TouchableOpacity>
            );
          })}

          {overflowCount > 0 && (
            <TouchableOpacity
              style={styles.moreLink}
              onPress={() => onPress?.(null)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Show ${overflowCount} more detours`}
            >
              <Text style={styles.moreLinkText}>+{overflowCount} more</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
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
    flex: 1,
  },

  // ── Collapsed bar ────────────────────────────────────────────────
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    backgroundColor: COLORS.warningSubtle,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    cursor: 'pointer',
  },
  collapsedBarInline: {
    alignSelf: 'stretch',
    minHeight: 40,
    borderLeftWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 31, 0.18)',
    backgroundColor: 'rgba(255, 248, 236, 0.94)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  countText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.textPrimary,
    letterSpacing: 0.2,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  pillsRowInline: {
    marginLeft: 'auto',
  },
  routePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
  },
  routePillText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  pillOverflow: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  chevron: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },

  // ── Expanded detail panel ────────────────────────────────────────
  expandedPanel: {
    marginTop: 2,
    backgroundColor: COLORS.warningSubtle,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  expandedPanelInline: {
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 31, 0.14)',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderLeftWidth: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    cursor: 'pointer',
  },
  detailRowFaded: {
    opacity: 0.5,
  },
  detailLabel: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
  },
  chevronRight: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    lineHeight: FONT_SIZES.lg,
  },
  moreLink: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    cursor: 'pointer',
  },
  moreLinkText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.secondary,
  },
});

export default DetourAlertStrip;
