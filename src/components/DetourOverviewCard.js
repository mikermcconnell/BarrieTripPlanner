import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../config/theme';
import Icon from './Icon';
import { getUniqueDetourSections } from '../utils/detourHelpers';

const uniqueStops = (stops = []) => {
  const seen = new Set();
  return stops.filter((stop) => {
    const key = String(stop?.id ?? stop?.stop_id ?? stop?.code ?? stop?.name ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getRouteServiceMessage = (routeId, skippedStopCount) => {
  if (!routeId) return 'Some regular stops may not be served.';

  if (skippedStopCount > 0) {
    const noun = skippedStopCount === 1 ? 'stop is' : 'stops are';
    return `${skippedStopCount} regular Route ${routeId} ${noun} not served.`;
  }

  return `Some regular Route ${routeId} stops may not be served.`;
};

const DetourOverviewCard = ({ routeId, sections = [], roadNames = [], roadsLoading = false }) => {
  const normalizedSections = getUniqueDetourSections(sections);
  const firstSection = normalizedSections[0] || null;
  const lastSection = normalizedSections[normalizedSections.length - 1] || null;

  const startLabel =
    firstSection?.entryStopName ||
    firstSection?.entryStop?.name ||
    'Boundary still resolving';
  const endLabel =
    lastSection?.exitStopName ||
    lastSection?.exitStop?.name ||
    'Boundary still resolving';

  const skippedStopCount = useMemo(
    () => uniqueStops(normalizedSections.flatMap((section) => (
      Array.isArray(section?.skippedStops) ? section.skippedStops : []
    ))).length,
    [normalizedSections]
  );

  const compactRoadNames = roadNames.slice(0, 3);
  const roadSummaryText = roadsLoading
    ? 'Resolving likely street names...'
    : compactRoadNames.length > 0
      ? compactRoadNames.join(' • ')
      : 'Likely street names unavailable for this detour yet.';

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Route {routeId} detour</Text>
      <Text style={styles.summaryText}>{getRouteServiceMessage(routeId, skippedStopCount)}</Text>
      <Text style={styles.hintText}>Use an open stop before the detour starts or after the route rejoins.</Text>

      <View style={styles.row}>
        <View style={[styles.iconWrap, styles.iconWrapRoad]}>
          <Icon name="Route" size={14} color={COLORS.primary} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.label}>Likely detour path</Text>
          <Text style={styles.value}>{roadSummaryText}</Text>
        </View>
      </View>

      <View style={styles.boundaryRow}>
        <Text style={styles.boundaryText}>Starts near {startLabel}</Text>
        <Text style={styles.boundaryText}>Rejoins near {endLabel}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff8f2',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#ffd8b5',
    gap: SPACING.md,
  },
  heading: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  summaryText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  hintText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  iconWrapRoad: {
    backgroundColor: '#eef4ff',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  value: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  boundaryRow: {
    gap: 2,
    paddingTop: SPACING.xs,
  },
  boundaryText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});

export default DetourOverviewCard;
