import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../config/theme';
import Icon from './Icon';

const getRouteServiceMessage = (routeId, skippedStopCount) => {
  if (!routeId) return 'Regular stops between the detour boundaries may not be served.';

  if (skippedStopCount > 0) {
    const noun = skippedStopCount === 1 ? 'stop is' : 'stops are';
    return `${skippedStopCount} regular Route ${routeId} ${noun} not served during this detour.`;
  }

  return `Regular Route ${routeId} stops between the detour boundaries are not served during this detour.`;
};

const DetourOverviewCard = ({ routeId, sections = [], roadNames = [], roadsLoading = false }) => {
  const normalizedSections = Array.isArray(sections) ? sections.filter(Boolean) : [];
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
    () => normalizedSections.reduce(
      (sum, section) => sum + (Array.isArray(section?.skippedStops) ? section.skippedStops.length : 0),
      0
    ),
    [normalizedSections]
  );

  const roadSummaryText = roadsLoading
    ? 'Resolving street names...'
    : roadNames.length > 0
      ? roadNames.join(' • ')
      : 'Street names unavailable for this detour yet.';

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Detour Overview</Text>

      <View style={styles.row}>
        <View style={[styles.iconWrap, styles.iconWrapStart]}>
          <Icon name="MapPin" size={14} color={COLORS.success} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.label}>Detour start</Text>
          <Text style={styles.value}>{startLabel}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.iconWrap, styles.iconWrapRoad]}>
          <Icon name="Route" size={14} color={COLORS.primary} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.label}>Detour via</Text>
          <Text style={styles.value}>{roadSummaryText}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.iconWrap, styles.iconWrapEnd]}>
          <Icon name="MapPin" size={14} color={COLORS.warning} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.label}>Detour end</Text>
          <Text style={styles.value}>{endLabel}</Text>
        </View>
      </View>

      <View style={styles.notice}>
        <Icon name="Warning" size={16} color={COLORS.error} />
        <Text style={styles.noticeText}>{getRouteServiceMessage(routeId, skippedStopCount)}</Text>
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
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
  iconWrapStart: {
    backgroundColor: '#e8f7ee',
  },
  iconWrapRoad: {
    backgroundColor: '#eef4ff',
  },
  iconWrapEnd: {
    backgroundColor: '#fff3e6',
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
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: '#ffd8b5',
  },
  noticeText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
});

export default DetourOverviewCard;
