/**
 * NavigationProgressBar Component
 *
 * Visual progress indicator showing dots for each leg of the trip.
 * Different colors for walk vs transit, with current/completed/upcoming states.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';

const NavigationProgressBar = ({ legs, currentLegIndex }) => {
  if (!legs || legs.length === 0) return null;

  const getLegLabel = (leg, index) => {
    if (leg.isOnDemand) return 'On-demand';
    if (leg.mode === 'WALK') {
      return index === legs.length - 1 ? 'Final walk' : 'Walk';
    }
    return leg.route?.shortName ? `Bus ${leg.route.shortName}` : 'Bus';
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.progressRow}>
        {legs.map((leg, index) => {
          const isCompleted = index < currentLegIndex;
          const isCurrent = index === currentLegIndex;
          const isWalk = leg.mode === 'WALK';
          const label = getLegLabel(leg, index);

          return (
            <View
              key={`${label}-${index}`}
              style={[
                styles.stageChip,
                isCompleted && styles.stageChipCompleted,
                isCurrent && styles.stageChipCurrent,
              ]}
            >
              <View
                style={[
                  styles.stageIcon,
                  isWalk && styles.stageIconWalk,
                  !isWalk && !leg.isOnDemand && styles.stageIconTransit,
                  leg.isOnDemand && styles.stageIconOnDemand,
                  isCurrent && styles.stageIconCurrent,
                  isCompleted && styles.stageIconCompleted,
                ]}
              >
                <View style={styles.stageIconCore} />
              </View>
              <Text
                style={[
                  styles.stageLabel,
                  isCurrent && styles.stageLabelCurrent,
                  isCompleted && styles.stageLabelCompleted,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
              {isCurrent ? (
                <View style={styles.nowPill}>
                  <Text style={styles.nowPillText}>Now</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.md,
    marginBottom: 6,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: 2,
  },
  stageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 34,
    ...SHADOWS.small,
  },
  stageChipCurrent: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySubtle,
  },
  stageChipCompleted: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.successSubtle,
  },
  stageIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.xs,
    backgroundColor: COLORS.grey300,
  },
  stageIconWalk: {
    backgroundColor: COLORS.grey500,
  },
  stageIconTransit: {
    backgroundColor: COLORS.primary,
  },
  stageIconOnDemand: {
    backgroundColor: COLORS.secondary,
  },
  stageIconCurrent: {
    backgroundColor: COLORS.primaryDark,
  },
  stageIconCompleted: {
    backgroundColor: COLORS.success,
  },
  stageIconCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.white,
  },
  stageLabel: {
    maxWidth: 82,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xxs,
    fontWeight: '700',
  },
  stageLabelCurrent: {
    color: COLORS.primaryDark,
  },
  stageLabelCompleted: {
    color: COLORS.primaryDark,
  },
  nowPill: {
    marginLeft: 5,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  nowPillText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xxs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});

export default NavigationProgressBar;
