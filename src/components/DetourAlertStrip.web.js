import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, FONT_FAMILIES, BORDER_RADIUS } from '../config/theme';
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
const DETAILS_PENDING_TEXT = 'Exact path and affected stops are still being confirmed.';

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
  routeColorByRouteId = {},
  style,
  inline = false,
}) => {
  const {
    expanded, minimized, toggleExpanded, minimize, restore, detourEvents, routeGroups,
    topOffset, getRouteName, getEventStatusLabel, visibleEvents, overflowCount, countText,
    shouldRender,
  } = useDetourAlertStrip({ activeDetours, alertBannerVisible, routes });

  if (!shouldRender) return null;

  if (minimized) {
    return (
      <View
        style={[
          styles.container,
          !inline && { top: topOffset },
          inline && styles.containerInline,
          style,
          styles.minimizedContainer,
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={restore}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="Expand active detour alert"
          accessibilityHint={countText}
        >
          <Icon name="Warning" size={14} color={COLORS.warning} />
          <Text style={styles.restoreButtonText}>Detour</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
      <View
        style={[styles.collapsedBar, inline && styles.collapsedBarInline]}
      >
        <TouchableOpacity
          style={styles.collapsedAction}
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
          <View style={styles.collapsedCopy}>
            <Text style={styles.countText} numberOfLines={1}>
              {countText}
            </Text>
            {detourEvents.length === 1 && detourEvents[0].detailsPending && (
              <Text style={styles.detailsPendingText}>{DETAILS_PENDING_TEXT}</Text>
            )}
          </View>
          <View style={[styles.pillsRow, inline && styles.pillsRowInline]}>
            {routeGroups.slice(0, 3).map((group) => {
              const color = getRouteColor(group.firstRouteId, group.familyId);
              return (
                <View key={group.familyId} style={[styles.routePill, { backgroundColor: color }]}>
                  <Text style={styles.routePillText}>{group.displayName}</Text>
                </View>
              );
            })}
            {routeGroups.length > 3 && (
              <Text style={styles.pillOverflow}>+{routeGroups.length - 3}</Text>
            )}
          </View>
          <Text style={[styles.chevron, expanded && styles.chevronExpanded]}>▼</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bannerMinimizeButton}
          onPress={minimize}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Minimize active detour alert"
          accessibilityHint="Replaces this alert with a small Detour button"
        >
          <Icon name="X" size={14} color={COLORS.textSecondary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* ── Expanded detail panel ───────────────────────────────────── */}
      {expanded && (
        <View style={[styles.expandedPanel, inline && styles.expandedPanelInline]}>
          <View style={styles.expandedHeader}>
            <Text style={styles.expandedHeaderText}>Active detours</Text>
            <TouchableOpacity
              style={styles.minimizeListButton}
              onPress={toggleExpanded}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Minimize active detour list"
            >
              <Text style={styles.minimizeListIcon}>−</Text>
              <Text style={styles.minimizeListText}>Minimize</Text>
            </TouchableOpacity>
          </View>
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
                  {event.detailsPending && (
                    <Text style={styles.detailsPendingText}>{DETAILS_PENDING_TEXT}</Text>
                  )}
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
  minimizedContainer: {
    alignItems: 'flex-end',
  },
  restoreButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 31, 0.28)',
    backgroundColor: 'rgba(255, 248, 236, 0.97)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    cursor: 'pointer',
  },
  restoreButtonText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xs,
    fontFamily: FONT_FAMILIES.semibold,
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
    paddingLeft: SPACING.md,
    paddingRight: 2,
    paddingVertical: SPACING.xs,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
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
  collapsedAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    cursor: 'pointer',
  },
  bannerMinimizeButton: {
    width: 36,
    height: 36,
    marginLeft: SPACING.xs,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  countText: {
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
    alignItems: 'flex-start',
    minHeight: 58,
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
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    lineHeight: 17,
  },
  collapsedCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailsPendingText: {
    marginTop: 2,
    fontSize: FONT_SIZES.xs,
    lineHeight: 15,
    color: COLORS.textSecondary,
  },
  expandedHeader: {
    minHeight: 42,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  expandedHeaderText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.semibold,
  },
  minimizeListButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
    cursor: 'pointer',
  },
  minimizeListIcon: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.lg,
    lineHeight: FONT_SIZES.lg,
  },
  minimizeListText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.xs,
    fontFamily: FONT_FAMILIES.semibold,
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
    cursor: 'pointer',
  },
  moreLinkText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.secondary,
  },
});

export default DetourAlertStrip;
