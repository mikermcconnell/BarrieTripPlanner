/**
 * NavigationProgressBar Component
 *
 * Visual progress indicator showing dots for each leg of the trip.
 * Different colors for walk vs transit, with current/completed/upcoming states.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES } from '../../config/theme';

const NavigationProgressBar = ({ legs, currentLegIndex }) => {
  if (!legs || legs.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        {legs.map((leg, index) => {
          const isCompleted = index < currentLegIndex;
          const isCurrent = index === currentLegIndex;
          const isWalk = leg.mode === 'WALK';

          return (
            <React.Fragment key={index}>
              {/* Connector line (except before first dot) */}
              {index > 0 && (
                <View
                  style={[
                    styles.connector,
                    isCompleted && styles.connectorCompleted,
                    isCurrent && styles.connectorCurrent,
                  ]}
                />
              )}

              {/* Leg dot */}
              <View
                style={[
                  styles.dot,
                  isCurrent && styles.dotCurrent,
                  isCompleted && styles.dotCompleted,
                  isWalk ? styles.dotWalk : styles.dotTransit,
                  isCompleted && isWalk && styles.dotWalkCompleted,
                  isCompleted && !isWalk && styles.dotTransitCompleted,
                ]}
              >
                {isCurrent && (
                  <View style={styles.currentIndicator} />
                )}
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {/* Step label */}
      <Text style={styles.stepLabel}>
        Step {currentLegIndex + 1} of {legs.length}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: {
    height: 3,
    flex: 1,
    maxWidth: 40,
    backgroundColor: COLORS.grey300,
    marginHorizontal: 2,
  },
  connectorCompleted: {
    backgroundColor: COLORS.success,
  },
  connectorCurrent: {
    backgroundColor: COLORS.grey300,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotWalk: {
    backgroundColor: COLORS.grey400,
    borderWidth: 2,
    borderColor: COLORS.grey400,
  },
  dotTransit: {
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  dotCurrent: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
  },
  dotCompleted: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  dotWalkCompleted: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  dotTransitCompleted: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  currentIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  stepLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});

export default NavigationProgressBar;
