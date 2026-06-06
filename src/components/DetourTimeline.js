import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';
import Icon from './Icon';
import { getUniqueDetourSections } from '../utils/detourHelpers';

/**
 * DetourTimeline — vertical timeline showing how a detour affects a route's stops.
 *
 * Props:
 *   sections        — array of segment objects with affectedStops / entryStopName / exitStopName
 */
const getDetourStopRole = (stop) => (
  stop?.detourStopRole == null ? null : String(stop.detourStopRole).trim().toLowerCase()
);

const TimelineSection = ({ affectedStops, skippedStops, entryStopName, exitStopName }) => {
  const contextStops = Array.isArray(affectedStops) && affectedStops.length > 0
    ? affectedStops
    : (Array.isArray(skippedStops) ? skippedStops : []);
  const closedStops = Array.isArray(skippedStops) && skippedStops.length > 0
    ? skippedStops
    : (Array.isArray(affectedStops)
      ? affectedStops.filter((stop) => getDetourStopRole(stop) === 'skipped')
      : []);
  const hasStops = contextStops.length > 0 || closedStops.length > 0;

  if (!hasStops) {
    return (
      <View style={styles.pendingContainer}>
        <Icon name="Hourglass" size={20} color={COLORS.textSecondary} />
        <Text style={styles.pendingText}>Affected stops unavailable yet.</Text>
      </View>
    );
  }

  const entryName = entryStopName || contextStops[0]?.name || closedStops[0]?.name;
  const exitName = exitStopName || contextStops[contextStops.length - 1]?.name || closedStops[closedStops.length - 1]?.name;

  return (
    <View style={styles.section}>
      {/* Normal service node (top) */}
      <View style={styles.nodeRow}>
        <View style={styles.nodeColumn}>
          <View style={styles.greenDot} />
          <View style={[styles.verticalLine, styles.greyLine]} />
        </View>
        <Text style={styles.normalText}>Normal service</Text>
      </View>

      {/* Entry stop node */}
      <View style={styles.nodeRow}>
        <View style={styles.nodeColumn}>
          <View style={styles.orangeDiamond} />
          <View style={[styles.verticalLine, styles.redLine]} />
        </View>
        <Text style={styles.entryExitText}>{entryName}</Text>
      </View>

      {/* Skipped stops */}
      {closedStops.length > 0 ? closedStops.map((stop, index) => (
        <View key={`${stop.stop_id || stop.id || 'stop'}-${index}`} style={styles.nodeRow}>
          <View style={styles.nodeColumn}>
            <View style={styles.xIconWrapper}>
              <Icon name="X" size={12} color={COLORS.error} />
            </View>
            <View style={[styles.verticalLine, styles.redLine]} />
          </View>
          <Text style={styles.skippedText}>{stop.name}</Text>
        </View>
      )) : (
        <View style={styles.nodeRow}>
          <View style={styles.nodeColumn}>
            <View style={[styles.verticalLine, styles.redLine]} />
          </View>
          <Text style={styles.openText}>No stops currently marked closed.</Text>
        </View>
      )}

      {/* Exit stop node */}
      <View style={styles.nodeRow}>
        <View style={styles.nodeColumn}>
          <View style={styles.orangeDiamond} />
          <View style={[styles.verticalLine, styles.greyLine]} />
        </View>
        <Text style={styles.entryExitText}>{exitName}</Text>
      </View>

      {/* Normal service resumes node (bottom) */}
      <View style={styles.nodeRow}>
        <View style={styles.nodeColumn}>
          <View style={styles.greenDot} />
          {/* No line below the last node */}
        </View>
        <Text style={styles.normalText}>Normal service resumes</Text>
      </View>
    </View>
  );
};

const DetourTimeline = ({ sections = [] }) => {
  const normalizedSections = getUniqueDetourSections(sections);

  if (normalizedSections.length === 0) {
    return <TimelineSection affectedStops={[]} entryStopName={null} exitStopName={null} />;
  }

  return (
    <View style={styles.container}>
      {normalizedSections.map((section, index) => (
        <View key={`detour-section-${index}`} style={styles.sectionWrapper}>
          {normalizedSections.length > 1 && (
            <Text style={styles.sectionTitle}>Detour section {index + 1}</Text>
          )}
          <TimelineSection
            affectedStops={section.affectedStops}
            skippedStops={section.skippedStops}
            entryStopName={section.entryStopName}
            exitStopName={section.exitStopName}
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.xs,
  },
  section: {
    paddingVertical: SPACING.xs,
  },
  sectionWrapper: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
    letterSpacing: 0.4,
  },
  pendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  pendingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  nodeRow: {
    flexDirection: 'row',
    minHeight: 32,
  },
  nodeColumn: {
    width: 24,
    alignItems: 'center',
  },
  greenDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
    marginTop: 2,
  },
  orangeDiamond: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: COLORS.warning,
    transform: [{ rotate: '45deg' }],
    marginTop: 2,
  },
  xIconWrapper: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  verticalLine: {
    flex: 1,
    width: 2,
    marginTop: 2,
  },
  greyLine: {
    backgroundColor: COLORS.grey300,
  },
  redLine: {
    backgroundColor: COLORS.error,
  },
  normalText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    paddingTop: 2,
  },
  entryExitText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginLeft: SPACING.sm,
    paddingTop: 2,
  },
  skippedText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textDecorationLine: 'line-through',
    marginLeft: SPACING.sm,
    paddingTop: 2,
  },
  openText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    paddingTop: 2,
  },
});

export default DetourTimeline;
