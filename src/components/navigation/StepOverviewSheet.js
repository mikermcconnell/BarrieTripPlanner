/**
 * StepOverviewSheet Component
 *
 * Collapsible bottom sheet showing all trip legs with status indicators.
 * Allows manual advancement through steps.
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';
import { formatDuration, formatDistance } from '../../services/tripService';

/** Format stop name with stop number when available */
const formatStopName = (stop) => {
  if (!stop) return '';
  const code = stop.stopCode || stop.stopId;
  return code ? `${stop.name} (#${code})` : stop.name;
};

const StepOverviewSheet = ({
  legs,
  currentLegIndex,
  onSelectLeg,
  onCompleteLeg,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const animatedHeight = useRef(new Animated.Value(0)).current;

  const toggleExpanded = () => {
    Animated.timing(animatedHeight, {
      toValue: isExpanded ? 0 : 1,
      duration: 250,
      useNativeDriver: false,
    }).start();
    setIsExpanded(!isExpanded);
  };

  const maxHeight = animatedHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 300],
  });

  return (
    <View style={styles.container}>
      {/* Toggle Header */}
      <TouchableOpacity style={styles.toggleHeader} onPress={toggleExpanded}>
        <View style={styles.handleBar} />
        <Text style={styles.toggleText}>
          {isExpanded ? '▼ Hide steps' : '▲ View all steps'}
        </Text>
      </TouchableOpacity>

      {/* Expandable Content */}
      <Animated.View style={[styles.content, { maxHeight }]}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          {legs.map((leg, index) => {
            const isCompleted = index < currentLegIndex;
            const isCurrent = index === currentLegIndex;
            const isUpcoming = index > currentLegIndex;
            const isWalk = leg.mode === 'WALK';

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.legItem,
                  isCurrent && styles.legItemCurrent,
                  isCompleted && styles.legItemCompleted,
                ]}
                onPress={() => isCurrent && onCompleteLeg?.()}
                disabled={!isCurrent}
              >
                {/* Timeline indicator */}
                <View style={styles.timeline}>
                  <View
                    style={[
                      styles.timelineDot,
                      isCompleted && styles.timelineDotCompleted,
                      isCurrent && styles.timelineDotCurrent,
                      isWalk && styles.timelineDotWalk,
                    ]}
                  >
                    {isCompleted && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  {index < legs.length - 1 && (
                    <View
                      style={[
                        styles.timelineLine,
                        isCompleted && styles.timelineLineCompleted,
                      ]}
                    />
                  )}
                </View>

                {/* Leg content */}
                <View style={styles.legContent}>
                  <View style={styles.legHeader}>
                    <Text style={styles.legIcon}>
                      {isWalk ? '🚶' : '🚌'}
                    </Text>
                    {!isWalk && leg.route && (
                      <View
                        style={[
                          styles.routeBadge,
                          { backgroundColor: leg.route.color || COLORS.primary },
                        ]}
                      >
                        <Text style={styles.routeBadgeText}>
                          {leg.route.shortName || '?'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.legDetails}>
                    <Text
                      style={[
                        styles.legTitle,
                        isCompleted && styles.legTitleCompleted,
                      ]}
                      numberOfLines={1}
                    >
                      {isWalk
                        ? `Walk to ${formatStopName(leg.to)}`
                        : leg.headsign || `Ride to ${formatStopName(leg.to)}`}
                    </Text>
                    <Text style={styles.legSubtitle}>
                      {formatDuration(leg.duration)}
                      {isWalk
                        ? ` • ${formatDistance(leg.distance)}`
                        : leg.intermediateStops
                        ? ` • ${leg.intermediateStops.length} stops`
                        : ''}
                    </Text>
                  </View>

                  {/* Manual complete button for current leg */}
                  {isCurrent && (
                    <TouchableOpacity
                      style={styles.completeButton}
                      onPress={onCompleteLeg}
                    >
                      <Text style={styles.completeButtonText}>Done</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Destination marker */}
          <View style={styles.destinationMarker}>
            <View style={styles.destinationDot}>
              <Text style={styles.destinationIcon}>📍</Text>
            </View>
            <Text style={styles.destinationText}>
              {formatStopName(legs[legs.length - 1]?.to) || 'Destination'}
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    ...SHADOWS.large,
  },
  toggleHeader: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.grey300,
    borderRadius: 2,
    marginBottom: SPACING.xs,
  },
  toggleText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  content: {
    overflow: 'hidden',
  },
  scrollView: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  legItem: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
  },
  legItemCurrent: {
    backgroundColor: COLORS.primarySubtle,
    marginHorizontal: -SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  legItemCompleted: {
    opacity: 0.6,
  },
  timeline: {
    width: 32,
    alignItems: 'center',
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.grey300,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.grey300,
  },
  timelineDotWalk: {
    backgroundColor: COLORS.grey400,
    borderColor: COLORS.grey400,
  },
  timelineDotCurrent: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  timelineDotCompleted: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  checkmark: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.grey300,
    marginVertical: 4,
  },
  timelineLineCompleted: {
    backgroundColor: COLORS.success,
  },
  legContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  legHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  legIcon: {
    fontSize: 18,
  },
  routeBadge: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.xs,
    marginLeft: 4,
  },
  routeBadgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xxs,
    fontWeight: '700',
  },
  legDetails: {
    flex: 1,
  },
  legTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  legTitleCompleted: {
    textDecorationLine: 'line-through',
  },
  legSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  completeButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
  },
  completeButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  destinationMarker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginLeft: 6,
  },
  destinationDot: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  destinationIcon: {
    fontSize: 16,
  },
  destinationText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginLeft: SPACING.md,
  },
});

export default StepOverviewSheet;
