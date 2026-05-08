import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTransitRealtime } from '../context/TransitContext';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';

const MONTHS = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sept: 8, sep: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};
const MONTH_PATTERN = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept\\.?|Sep\\.?|Oct\\.?|Nov\\.?|Dec\\.?)';

function formatDate(timestamp) {
  if (!timestamp) return null;
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return String(timestamp);
}

function formatStartsAt(timestamp) {
  const formatted = formatDate(timestamp);
  return formatted ? `Starts ${formatted}` : 'Upcoming';
}

function parseMonthDate(match, fallbackYear, endOfDay = false) {
  if (!match) return null;
  const month = MONTHS[String(match[1] || '').toLowerCase().replace('.', '')];
  const day = Number(match[2]);
  const year = match[3] ? Number(match[3]) : fallbackYear;
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return null;
  const date = new Date(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function parseDateWindow(item) {
  const text = `${item?.title || ''}\n${item?.body || ''}`;
  const published = Number(item?.publishedAt);
  const fallbackYear = Number.isFinite(published) ? new Date(published).getFullYear() : new Date().getFullYear();
  const datePattern = `${MONTH_PATTERN}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`;
  const fromTo = new RegExp(`\\bfrom\\s+(${datePattern})\\s+(?:to|until|through|-)\\s+(${datePattern})`, 'i').exec(text);
  if (fromTo) {
    return {
      startsAt: parseMonthDate([null, fromTo[2], fromTo[3], fromTo[4]], fallbackYear),
      endsAt: parseMonthDate([null, fromTo[6], fromTo[7], fromTo[8]], fallbackYear, true),
    };
  }
  const fromOpen = new RegExp(`\\bfrom\\s+(${datePattern})\\b`, 'i').exec(text);
  const beginningOpen = new RegExp(`\\bbeginning\\s+(${datePattern})\\b`, 'i').exec(text);
  const firstDate = new RegExp(datePattern, 'i').exec(text);
  const chosen = fromOpen || beginningOpen || firstDate;
  return { startsAt: chosen ? parseMonthDate([null, chosen[2], chosen[3], chosen[4]], fallbackYear) : null, endsAt: null };
}

function statusForWindow(window) {
  const now = Date.now();
  if (Number.isFinite(window?.startsAt) && now < window.startsAt) return 'upcoming';
  if (Number.isFinite(window?.endsAt) && now > window.endsAt) return 'expired';
  return 'active';
}

function looksLikeStopClosure(item) {
  const text = `${item?.title || ''} ${item?.body || ''}`.toLowerCase();
  return /\bstops?\b/.test(text) && /(closure|closed|out[- ]of[- ]service|placed out of service)/.test(text);
}

function looksLikeDetour(item) {
  const text = `${item?.title || ''} ${item?.body || ''}`.toLowerCase();
  return /\bdetour\b/.test(text);
}

function ImpactCard({ item, tone = 'info', onPress }) {
  const toneStyle = tone === 'error'
    ? styles.cardError
    : tone === 'warning'
      ? styles.cardWarning
      : styles.cardInfo;
  const badgeStyle = tone === 'error'
    ? styles.badgeError
    : tone === 'warning'
      ? styles.badgeWarning
      : styles.badgeInfo;

  return (
    <TouchableOpacity style={[styles.impactCard, toneStyle]} activeOpacity={0.75} onPress={onPress}>
      <View style={styles.impactHeader}>
        <View style={styles.impactHeaderText}>
          <Text style={styles.impactTitle}>{item.title}</Text>
          {!!item.subtitle && <Text style={styles.impactSubtitle}>{item.subtitle}</Text>}
        </View>
        <View style={[styles.statusBadge, badgeStyle]}>
          <Text style={styles.statusBadgeText}>{item.badge}</Text>
        </View>
      </View>
      {!!item.body && <Text style={styles.impactBody} numberOfLines={3}>{item.body}</Text>}
      {item.routes?.length > 0 && (
        <View style={styles.routesRowCompact}>
          {item.routes.map((route) => (
            <View key={route} style={styles.routeBadgeSubtle}>
              <Text style={styles.routeTextSubtle}>Route {route}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function Section({ title, subtitle, children, emptyText }) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {hasChildren ? children : <Text style={styles.emptySectionText}>{emptyText}</Text>}
    </View>
  );
}

const NewsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const { transitNews, transitNewsImpacts, activeDetours } = useTransitRealtime();
  const [expandedId, setExpandedId] = useState(null);

  const buckets = useMemo(() => {
    const stopClosures = (transitNewsImpacts || []).filter((impact) => impact.type === 'stop_closure');
    const activeStopClosures = stopClosures.filter((impact) => impact.status === 'active');
    const upcomingStopClosures = stopClosures.filter((impact) => impact.status === 'upcoming');
    const activeDetourItems = Object.values(activeDetours || {}).filter((detour) => detour?.state !== 'archived');
    const detourNotices = (transitNews || [])
      .filter((item) => looksLikeDetour(item) && !looksLikeStopClosure(item))
      .map((item) => ({ ...item, window: parseDateWindow(item) }));
    const activeDetourNotices = detourNotices.filter((item) => statusForWindow(item.window) === 'active');
    const upcomingDetours = detourNotices.filter((item) => statusForWindow(item.window) === 'upcoming');
    const otherNews = (transitNews || []).filter((item) => (
      !looksLikeStopClosure(item) &&
      !looksLikeDetour(item)
    ));

    return { activeStopClosures, upcomingStopClosures, activeDetourItems, activeDetourNotices, upcomingDetours, otherNews };
  }, [activeDetours, transitNews, transitNewsImpacts]);

  const renderNewsItem = (item) => {
    const isExpanded = expandedId === item.id;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.newsCard}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.newsHeader}>
          <View style={styles.headerContent}>
            <Text style={styles.newsTitle}>{item.title}</Text>
            {(item.date || item.publishedAt) && (
              <Text style={styles.newsDate}>{item.date || formatDate(item.publishedAt)}</Text>
            )}
          </View>
          <Text style={styles.chevron}>{isExpanded ? '\u25BC' : '\u25B6'}</Text>
        </View>

        {item.affectedRoutes?.length > 0 && (
          <View style={styles.routesRow}>
            {item.affectedRoutes.map((route) => (
              <View key={route} style={styles.routeBadge}>
                <Text style={styles.routeText}>Route {route}</Text>
              </View>
            ))}
          </View>
        )}

        {isExpanded && (
          <View style={styles.newsDetails}>
            {item.body ? <Text style={styles.newsBody}>{item.body}</Text> : <Text style={styles.noBody}>No additional details available.</Text>}
            {item.url && (
              <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(item.url)}>
                <Text style={styles.linkText}>View on myridebarrie.ca →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{'\u2190'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transit News</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: addSafeBottomPadding(SPACING.xl, bottomInset) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Service impacts</Text>
          <Text style={styles.summaryText}>Detours appear first. Upcoming notices stay here until they begin.</Text>
        </View>

        <Section title="Active detours" subtitle="Route-level changes" emptyText="No active detected detours.">
          {buckets.activeDetourNotices.map((item) => (
            <ImpactCard
              key={`notice-${item.id}`}
              tone="info"
              item={{
                title: item.title,
                subtitle: 'Barrie Transit notice',
                badge: 'Active',
                body: item.body,
                routes: item.affectedRoutes,
              }}
              onPress={() => item.url && Linking.openURL(item.url)}
            />
          ))}
          {buckets.activeDetourItems.map((detour) => (
            <ImpactCard
              key={detour.routeId}
              tone="info"
              item={{
                title: `Route ${detour.routeId}`,
                subtitle: detour.detourPathLabel || 'Likely detour path',
                badge: 'Active',
                body: detour.likelyDetourRoadNames?.length ? `Likely using ${detour.likelyDetourRoadNames.join(', ')}` : 'Detected from live vehicle movement.',
                routes: [],
              }}
            />
          ))}
        </Section>

        <Section title="Upcoming detours" subtitle="Future route-level notices" emptyText="No upcoming detours found.">
          {buckets.upcomingDetours.map((item) => (
            <ImpactCard
              key={item.id}
              tone="warning"
              item={{
                title: item.title,
                subtitle: formatStartsAt(item.window.startsAt),
                badge: 'Upcoming',
                body: item.body,
                routes: item.affectedRoutes,
              }}
              onPress={() => item.url && Linking.openURL(item.url)}
            />
          ))}
        </Section>

        <Section title="Active stop closures" subtitle="Map marker when matched to a stop" emptyText="No active stop closures found.">
          {buckets.activeStopClosures.map((impact) => (
            <ImpactCard
              key={impact.id}
              tone="error"
              item={{
                title: `Stop ${impact.stopCode}${impact.stopName ? ` · ${impact.stopName}` : ''}`,
                subtitle: impact.sourceTitle,
                badge: 'Active',
                body: impact.message,
                routes: impact.affectedRoutes,
              }}
              onPress={() => impact.sourceUrl && Linking.openURL(impact.sourceUrl)}
            />
          ))}
        </Section>

        <Section title="Upcoming stop closures" subtitle="Not shown on the map yet" emptyText="No upcoming stop closures found.">
          {buckets.upcomingStopClosures.map((impact) => (
            <ImpactCard
              key={impact.id}
              tone="warning"
              item={{
                title: `Stop ${impact.stopCode}${impact.stopName ? ` · ${impact.stopName}` : ''}`,
                subtitle: impact.sourceTitle,
                badge: formatStartsAt(impact.startsAt),
                body: impact.message,
                routes: impact.affectedRoutes,
              }}
              onPress={() => impact.sourceUrl && Linking.openURL(impact.sourceUrl)}
            />
          ))}
        </Section>

        <Section title="Latest notices" subtitle={`${buckets.otherNews.length} item${buckets.otherNews.length === 1 ? '' : 's'}`} emptyText="No transit news right now.">
          {buckets.otherNews.map(renderNewsItem)}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  summaryCard: {
    backgroundColor: COLORS.infoSubtle,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primarySubtle,
  },
  summaryTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  summaryText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  emptySectionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  impactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
    ...SHADOWS.small,
  },
  cardError: { borderLeftColor: COLORS.error },
  cardWarning: { borderLeftColor: COLORS.warning },
  cardInfo: { borderLeftColor: COLORS.info },
  impactHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  impactHeaderText: {
    flex: 1,
  },
  impactTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  impactSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  impactBody: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    lineHeight: 19,
    marginTop: SPACING.sm,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.round,
  },
  badgeError: { backgroundColor: COLORS.error },
  badgeWarning: { backgroundColor: COLORS.warning },
  badgeInfo: { backgroundColor: COLORS.info },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  routesRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: SPACING.sm,
  },
  routeBadgeSubtle: {
    backgroundColor: COLORS.primarySubtle,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  routeTextSubtle: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  newsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.small,
    overflow: 'hidden',
  },
  newsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  headerContent: {
    flex: 1,
  },
  newsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  newsDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  chevron: {
    fontSize: 12,
    color: COLORS.grey400,
    marginLeft: SPACING.sm,
  },
  routesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: 4,
  },
  routeBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  routeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  newsDetails: {
    padding: SPACING.md,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  newsBody: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    lineHeight: 20,
    marginTop: SPACING.sm,
  },
  noBody: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
  },
  linkButton: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  linkText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
});

export default NewsScreen;
