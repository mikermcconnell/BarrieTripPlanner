import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';
import Icon from './Icon';

/**
 * DetourTimeline — vertical timeline showing how a detour affects a route's stops.
 *
 * Props:
 *   affectedStops   — array of stop objects ({ name, ... }). Includes entry and exit.
 *   entryStopName   — name of the first affected stop (detour begins here)
 *   exitStopName    — name of the last affected stop (service resumes after here)
 */
const DetourTimeline = ({ affectedStops, entryStopName, exitStopName }) => {
  const hasStops = affectedStops && affectedStops.length > 0;

  if (!hasStops) {
    return (
      <View style={styles.pendingContainer}>
        <Icon name="Hourglass" size={20} color={COLORS.textSecondary} />
        <Text style={styles.pendingText}>Detecting affected stops...</Text>
      </View>
    );
  }

  const entryName = entryStopName || affectedStops[0]?.name;
  const exitName = exitStopName || affectedStops[affectedStops.length - 1]?.name;
  const skippedStops = affectedStops.slice(1, -1);

  return (
    <View style={styles.container}>
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
      {skippedStops.map((stop, index) => (
        <View key={stop.stop_id || stop.id || index} style={styles.nodeRow}>
          <View style={styles.nodeColumn}>
            <View style={styles.xIconWrapper}>
              <Icon name="X" size={12} color={COLORS.error} />
            </View>
            <View style={[styles.verticalLine, styles.redLine]} />
          </View>
          <Text style={styles.skippedText}>{stop.name}</Text>
        </View>
      ))}

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

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.xs,
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
});

export default DetourTimeline;
