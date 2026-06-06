import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, UIManager } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, FONT_FAMILIES, SHADOWS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import Icon from './Icon';
import { useDetourAlertStrip } from '../hooks/useDetourAlertStrip';
import { formatDetourRoutesMetaLabel } from '../utils/detourLabeling';

const getStatusTone = (statusLabel) => {
  const label = String(statusLabel || '').toLowerCase();
  if (label.startsWith('active')) return 'active';
  if (label.startsWith('clearing')) return 'clearing';
  return 'likely';
};

const MAP_ROUTE_HINT = 'Tap or click a highlighted route line on the map for details.';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * DetourAlertStrip (native) — collapsible amber banner showing active detours.
 *
 * All state and logic lives in useDetourAlertStrip; this file is rendering only.
 */
const DetourAlertStrip = ({
  activeDetours,
  onPress,
  alertBannerVisible,
  routes = [],
  routeColorByRouteId = {},
  style,
  inline = false,
}) => {
  const {
    expanded, toggleExpanded, detourEvents, routeGroups, topOffset, getRouteName,
    getEventStatusLabel, visibleEvents, overflowCount, countText, shouldRender,
  } = useDetourAlertStrip({ activeDetours, alertBannerVisible, routes });

  if (!shouldRender) return null;

  const handleCollapsedPress = () => {
    if (detourEvents.length === 1) {
      const event = detourEvents[0];
      onPress?.(event.primaryRouteId, event);
      return;
    }
    toggleExpanded();
  };
  const getRouteColor = (routeId, familyId = null) => (
    routeColorByRouteId[routeId] ||
    (familyId ? routeColorByRouteId[familyId] : null) ||
    ROUTE_COLORS[routeId] ||
    (familyId ? ROUTE_COLORS[familyId] : null) ||
    ROUTE_COLORS.DEFAULT
  );
  const collapsedRouteBadges = detourEvents.length === 1
    ? detourEvents[0].routeIds.map((routeId) => ({
      key: routeId,
      routeId,
      label: getRouteName(routeId),
      familyId: null,
    }))
    : routeGroups.map((group) => ({
      key: group.familyId,
      routeId: group.firstRouteId,
      label: group.displayName,
      familyId: group.familyId,
    }));
  const visibleCollapsedRouteBadges = collapsedRouteBadges.slice(0, 3);
  const hiddenCollapsedRouteBadgeCount = Math.max(0, collapsedRouteBadges.length - visibleCollapsedRouteBadges.length);

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
          detourEvents.length === 1
            ? `Open ${detourEvents[0].title} detour details`
            : expanded ? 'Collapse detour list' : 'Expand detour list'
        }
        accessibilityHint={detourEvents.length === 1 ? 'Shows skipped stops and detour details' : countText}
      >
        <Icon name="Warning" size={16} color={COLORS.warning} />
        <Text style={styles.countText} numberOfLines={1}>
          {countText}
        </Text>
        {visibleCollapsedRouteBadges.length > 0 && (
          <View style={[styles.pillsRow, inline && styles.pillsRowInline]}>
            {visibleCollapsedRouteBadges.map((badge) => {
              const color = getRouteColor(badge.routeId, badge.familyId);
              return (
                <View
                  key={badge.key}
                  style={[
                    styles.routePill,
                    inline && styles.routeCircle,
                    { backgroundColor: color },
                  ]}
                >
                  <Text style={[styles.routePillText, inline && styles.routeCircleText]}>{badge.label}</Text>
                </View>
              );
            })}
            {hiddenCollapsedRouteBadgeCount > 0 && (
              <Text style={styles.pillOverflow}>+{hiddenCollapsedRouteBadgeCount}</Text>
            )}
          </View>
        )}
        <Text style={[styles.chevron, expanded && styles.chevronExpanded]}>▼</Text>
      </TouchableOpacity>

      {/* ── Expanded detail panel ───────────────────────────────────── */}
      {expanded && (
        <View style={[styles.expandedPanel, inline && styles.expandedPanelInline]}>
          {visibleEvents.map((event, eventIndex) => {
            const routeColor = getRouteColor(event.primaryRouteId);
            const isClearPending = event.state === 'clear-pending';
            const routeMetaLabel = formatDetourRoutesMetaLabel(event.routeIds);
            const statusLabel = getEventStatusLabel(event);
            const statusTone = getStatusTone(statusLabel);
            const visibleRouteIds = event.routeIds.slice(0, 4);
            const hiddenRouteCount = Math.max(0, event.routeIds.length - visibleRouteIds.length);
            const statusBadgeStyle = statusTone === 'active'
              ? styles.statusBadgeActive
              : statusTone === 'clearing'
                ? styles.statusBadgeClearing
                : styles.statusBadgeLikely;
            const statusBadgeTextStyle = statusTone === 'active'
              ? styles.statusBadgeTextActive
              : statusTone === 'clearing'
                ? styles.statusBadgeTextClearing
                : styles.statusBadgeTextLikely;

            return (
              <TouchableOpacity
                key={event.eventId}
                style={[
                  styles.detailRow,
                  { borderLeftColor: routeColor },
                  isClearPending && styles.detailRowFaded,
                ]}
                onPress={() => onPress?.(event.primaryRouteId, event)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${event.title}. ${statusLabel}${routeMetaLabel ? `. ${routeMetaLabel}` : ''}. View detour details`}
              >
                <View style={[styles.eventNumberBadge, { borderColor: routeColor }]}>
                  <Text style={[styles.eventNumberText, { color: routeColor }]}>{eventIndex + 1}</Text>
                </View>
                <View style={styles.eventCopy}>
                  <Text style={styles.detailLabel} numberOfLines={2}>{event.title}</Text>
                  <View style={styles.eventMetaRow}>
                    <View style={[styles.statusBadge, statusBadgeStyle]}>
                      <Text style={[styles.statusBadgeText, statusBadgeTextStyle]}>{statusLabel}</Text>
                    </View>
                    <View style={styles.eventRoutes}>
                      {visibleRouteIds.map((routeId) => (
                        <View key={`${event.eventId}-${routeId}`} style={[styles.routePill, { backgroundColor: getRouteColor(routeId) }]}>
                          <Text style={styles.routePillText}>{getRouteName(routeId)}</Text>
                        </View>
                      ))}
                      {hiddenRouteCount > 0 && (
                        <View style={styles.routeOverflowPill}>
                          <Text style={styles.routeOverflowText}>+{hiddenRouteCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <Text style={styles.chevronRight}>›</Text>
              </TouchableOpacity>
            );
          })}

          <View style={styles.mapRouteHint}>
            <Icon name="Route" size={15} color={COLORS.primaryDark} />
            <Text style={styles.mapRouteHintText}>{MAP_ROUTE_HINT}</Text>
          </View>

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
    alignSelf: 'flex-start',
    minHeight: 36,
    backgroundColor: 'rgba(255, 244, 229, 0.95)',
    borderRadius: BORDER_RADIUS.round,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
    ...SHADOWS.medium,
  },
  collapsedBarInline: {
    alignSelf: 'stretch',
    minHeight: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 31, 0.18)',
    backgroundColor: 'rgba(255, 248, 236, 0.94)',
    shadowOpacity: 0.08,
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
  routeCircle: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  routePillText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  routeCircleText: {
    fontSize: 10,
    lineHeight: 12,
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
    marginTop: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.medium,
  },
  expandedPanelInline: {
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 31, 0.14)',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 58,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderLeftWidth: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  detailRowFaded: {
    opacity: 0.5,
  },
  detailLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    lineHeight: 17,
  },
  eventNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    flexShrink: 0,
    marginTop: 1,
  },
  eventNumberText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: FONT_SIZES.xs,
  },
  eventRoutes: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 3,
    flexShrink: 1,
    minWidth: 0,
  },
  eventCopy: {
    flex: 1,
    minWidth: 0,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  statusBadge: {
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    flexShrink: 0,
  },
  statusBadgeActive: {
    backgroundColor: COLORS.successSubtle,
    borderColor: 'rgba(76, 175, 80, 0.32)',
  },
  statusBadgeLikely: {
    backgroundColor: COLORS.warningSubtle,
    borderColor: 'rgba(255, 153, 31, 0.32)',
  },
  statusBadgeClearing: {
    backgroundColor: COLORS.grey100,
    borderColor: COLORS.border,
  },
  statusBadgeText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  statusBadgeTextActive: {
    color: COLORS.ctaGreen,
  },
  statusBadgeTextLikely: {
    color: COLORS.accentDark,
  },
  statusBadgeTextClearing: {
    color: COLORS.textSecondary,
  },
  routeOverflowPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.grey100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  routeOverflowText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textSecondary,
  },
  chevronRight: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    lineHeight: FONT_SIZES.lg,
    alignSelf: 'center',
  },
  mapRouteHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.infoSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.primarySubtle,
  },
  mapRouteHintText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primaryDark,
  },
  moreLink: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  moreLinkText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.secondary,
  },
});

export default DetourAlertStrip;
