import React, { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, FONT_WEIGHTS, SHADOWS, SPACING } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import { BASE_TOP, ALERT_OFFSET } from '../hooks/useDetourAlertStrip';

const getNoticeUrl = (notice) => notice?.url || notice?.sourceUrl || null;

const ROUTE_FAMILY_COLOR_FALLBACKS = {
  '1': '#E31837',
  '2': '#00A651',
  '3': '#0072BC',
  '4': '#F7941D',
  '5': '#8B4513',
  '6': '#9B59B6',
  '7': '#F1C40F',
  '8': '#E91E63',
  '12': '#F39AC2',
  '90': '#607D8B',
  '100': '#795548',
};

const openNotice = (notice) => {
  const url = getNoticeUrl(notice);
  if (url) Linking.openURL(url).catch(() => {});
};

const formatDateText = (notice) => {
  const startsText = stripDateYear(notice?.startsText);
  const endsText = stripDateYear(notice?.endsText);
  if (startsText && endsText && startsText === endsText) {
    return startsText;
  }
  if (startsText && endsText) {
    return `${startsText}–${endsText}`;
  }
  if (startsText) return startsText;
  if (endsText) return `Ends ${endsText}`;
  return null;
};

const stripDateYear = (value) => String(value || '')
  .replace(/,\s*\d{4}\b/g, '')
  .replace(/\s+\d{4}\b/g, '')
  .trim();

const keepDateTogether = (value) => String(value || '')
  .replace(/\s+/g, '\u00A0')
  .replace(/[–-]/g, '\u2060–\u2060');

const cleanRouteDirections = (value) => String(value || '')
  .replace(/\b(\d{1,3}[A-Z]?)-(?:NB|SB|EB|WB|Northbound|Southbound|Eastbound|Westbound)\b/gi, '$1');

const cleanDetourTitle = (title) => {
  const cleaned = cleanRouteDirections(title)
    .replace(/\s*[-–—]\s*Routes?\s+[\dA-Za-z,\s/&]+$/i, '')
    .replace(/\s*\(\s*Routes?\s+[\dA-Za-z,\s/&]+\s*\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Upcoming detour';
};

const getRouteRoot = (route) => String(route || '').toUpperCase().match(/^\d+/)?.[0] || String(route || '').toUpperCase();

export const getUpcomingDetourRouteColor = (route, routeColorByRouteId = {}) => {
  const routeKey = String(route || '').toUpperCase();
  const rootKey = getRouteRoot(routeKey);

  return routeColorByRouteId[rootKey] ||
    routeColorByRouteId[routeKey] ||
    ROUTE_COLORS[rootKey] ||
    ROUTE_FAMILY_COLOR_FALLBACKS[rootKey] ||
    ROUTE_COLORS[routeKey] ||
    ROUTE_FAMILY_COLOR_FALLBACKS[routeKey] ||
    ROUTE_COLORS.DEFAULT ||
    '#1a73e8';
};

export const buildUpcomingDetourHeadline = (notice) => {
  const title = cleanDetourTitle(notice?.title);
  const parts = [title];
  const dateText = formatDateText(notice);

  if (dateText) parts.push(dateText);

  return parts.map((part, index) => (index === parts.length - 1 && dateText ? keepDateTogether(part) : part)).join(' · ');
};

const UpcomingDetourStrip = ({
  notices = [],
  alertBannerVisible = false,
  routeColorByRouteId = {},
  autoHideMs = 10000,
  collapsedByDefault = false,
  onCollapsedChange,
  inline = false,
  style,
}) => {
  const [collapsed, setCollapsed] = useState(collapsedByDefault);
  const noticeSignature = useMemo(() => (
    notices.map((notice) => `${notice?.id || notice?.title || ''}:${notice?.startsText || ''}:${notice?.endsText || ''}`).join('|')
  ), [notices]);

  useEffect(() => {
    if (!notices.length) return undefined;

    setCollapsed(collapsedByDefault);
    if (!Number.isFinite(autoHideMs) || autoHideMs <= 0) return undefined;

    const timer = setTimeout(() => {
      setCollapsed(true);
    }, autoHideMs);

    return () => clearTimeout(timer);
  }, [autoHideMs, collapsedByDefault, noticeSignature, notices.length]);

  useEffect(() => {
    if (notices.length > 0) {
      onCollapsedChange?.(collapsed);
    }
  }, [collapsed, notices.length, onCollapsedChange]);

  if (!notices.length) return null;

  const topOffset = (alertBannerVisible ? BASE_TOP + ALERT_OFFSET : BASE_TOP) + 92;
  const countText = `${notices.length} upcoming detour${notices.length === 1 ? '' : 's'}`;

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
      {collapsed ? (
        <TouchableOpacity
          style={[styles.collapsedCard, inline && styles.collapsedCardInline]}
          activeOpacity={0.85}
          onPress={() => setCollapsed(false)}
          accessibilityRole="button"
          accessibilityLabel="Expand upcoming detours"
        >
          <Text style={styles.iconSmall}>📅</Text>
          <Text style={styles.collapsedTitle}>{countText}</Text>
          <Text style={styles.expandText}>Expand</Text>
        </TouchableOpacity>
      ) : (
      <View
        style={[styles.headerCard, inline && styles.headerCardInline]}
      >
        <Text style={styles.icon}>📅</Text>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{countText}</Text>
          <View style={styles.headlineList}>
          {notices.map((notice) => {
            const routes = notice.routes || notice.affectedRoutes || [];
            const url = getNoticeUrl(notice);
            return (
              <TouchableOpacity
                key={notice.id || notice.title}
                style={styles.headlineRow}
                activeOpacity={0.78}
                disabled={!url}
                onPress={() => openNotice(notice)}
                accessibilityRole={url ? 'link' : 'text'}
                accessibilityLabel={url ? `Open ${notice.title}` : notice.title}
              >
                {routes.length > 0 && (
                  <View style={styles.routeCircleRow}>
                    {routes.slice(0, 8).map((route) => (
                      <View
                        key={`${notice.id || notice.title}-${route}`}
                        style={[styles.routeCircle, { backgroundColor: getUpcomingDetourRouteColor(route, routeColorByRouteId) }]}
                      >
                        <Text style={styles.routeCircleText}>{String(route).toUpperCase()}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.headlineText} numberOfLines={2}>{buildUpcomingDetourHeadline({ ...notice, routes })}</Text>
              </TouchableOpacity>
            );
          })}
          </View>
        </View>
        <TouchableOpacity
          style={styles.dismissButton}
          activeOpacity={0.75}
          onPress={() => setCollapsed(true)}
          accessibilityRole="button"
          accessibilityLabel="Hide upcoming detours"
        >
          <Text style={styles.dismissText}>×</Text>
        </TouchableOpacity>
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
    alignSelf: 'stretch',
  },
  headerCard: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 31, 0.22)',
    ...SHADOWS.medium,
  },
  headerCardInline: {
    alignSelf: 'stretch',
  },
  collapsedCard: {
    alignSelf: 'flex-start',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255, 153, 31, 0.22)',
    ...SHADOWS.small,
  },
  collapsedCardInline: {
    alignSelf: 'stretch',
  },
  icon: {
    fontSize: FONT_SIZES.lg,
  },
  iconSmall: {
    fontSize: FONT_SIZES.sm,
  },
  collapsedTitle: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textPrimary,
  },
  expandText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textPrimary,
  },
  headlineList: {
    marginTop: SPACING.xs,
    gap: 2,
  },
  headlineRow: {
    paddingVertical: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  routeCircleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  routeCircle: {
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCircleText: {
    fontSize: 9,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  headlineText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  dismissButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },
  dismissText: {
    fontSize: FONT_SIZES.lg,
    lineHeight: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default UpcomingDetourStrip;
