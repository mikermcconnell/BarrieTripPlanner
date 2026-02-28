import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import Icon from './Icon';

const BASE_TOP = 140;
const ALERT_OFFSET = 64;
const MAX_EXPANDED = 5;

/**
 * DetourAlertStrip (web) — collapsible amber banner showing active detours.
 *
 * Collapsed: single bar with Warning icon, count text, route-coloured pill badges, and a toggle chevron.
 * Expanded:  shows the collapsed bar (chevron flips) + a detail panel with one row per detour route.
 *
 * Props:
 *   activeDetours        — object keyed by routeId, each value has { state, ... }. 'cleared' entries are filtered.
 *   onPress(routeId)     — called when an expanded detail row is tapped.
 *   alertBannerVisible   — boolean; when true, shifts the strip down by ALERT_OFFSET.
 *   routes               — array of { id, shortName } for route name lookup.
 *   style                — optional additional View style.
 */
const DetourAlertStrip = ({ activeDetours, onPress, alertBannerVisible, routes = [], style }) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  if (!activeDetours || typeof activeDetours !== 'object') return null;

  const routeIds = Object.keys(activeDetours).filter(
    (id) => activeDetours[id]?.state !== 'cleared'
  );
  if (routeIds.length === 0) return null;

  const topOffset = alertBannerVisible ? BASE_TOP + ALERT_OFFSET : BASE_TOP;

  // Build a quick lookup from routes array
  const routeNameMap = {};
  routes.forEach((r) => {
    routeNameMap[r.id] = r.shortName || r.id;
  });

  const getRouteName = (routeId) => routeNameMap[routeId] || routeId;

  const visibleIds = routeIds.slice(0, MAX_EXPANDED);
  const overflowCount = routeIds.length - MAX_EXPANDED;

  const countText =
    routeIds.length === 1
      ? `Route ${getRouteName(routeIds[0])} on detour`
      : `${routeIds.length} routes on detour`;

  return (
    <View
      style={[styles.container, { top: topOffset }, style]}
      pointerEvents="box-none"
    >
      {/* ── Collapsed bar (always visible) ─────────────────────────── */}
      <TouchableOpacity
        style={styles.collapsedBar}
        onPress={toggleExpanded}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse detour list' : 'Expand detour list'}
        accessibilityHint={countText}
      >
        {/* Warning icon */}
        <Icon name="Warning" size={16} color={COLORS.warning} />

        {/* Count text */}
        <Text style={styles.countText} numberOfLines={1}>
          {countText}
        </Text>

        {/* Route pill badges (collapsed view) */}
        <View style={styles.pillsRow}>
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

        {/* Chevron toggle */}
        <Text style={[styles.chevron, expanded && styles.chevronExpanded]}>▼</Text>
      </TouchableOpacity>

      {/* ── Expanded detail panel ───────────────────────────────────── */}
      {expanded && (
        <View style={styles.expandedPanel}>
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
                {/* Route badge pill */}
                <View style={[styles.routePill, { backgroundColor: routeColor }]}>
                  <Text style={styles.routePillText}>{getRouteName(routeId)}</Text>
                </View>

                {/* Row label */}
                <Text style={styles.detailLabel} numberOfLines={1}>
                  Route {getRouteName(routeId)} — {isClearPending ? 'Clearing...' : 'On detour'}
                </Text>

                {/* Chevron right */}
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
  countText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
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
