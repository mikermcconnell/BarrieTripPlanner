/**
 * TripPreviewModal - Quick preview of trip with Start Navigation option
 *
 * Shows a modal overlay with trip summary, condensed steps, and quick actions.
 * Allows users to start navigation directly without going to full details.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  FONT_SIZES,
  FONT_WEIGHTS,
  SHADOWS,
} from '../config/theme';
import { formatDuration, formatTimeFromTimestamp, formatDistance } from '../services/tripService';

const TripPreviewModal = ({
  visible,
  itinerary,
  onClose,
  onStartNavigation,
  onViewFullDetails,
}) => {
  if (!itinerary) return null;

  const startTime = formatTimeFromTimestamp(itinerary.startTime);
  const endTime = formatTimeFromTimestamp(itinerary.endTime);
  const duration = formatDuration(itinerary.duration);
  const walkDistance = formatDistance(itinerary.walkDistance);

  // Get transit legs for route display
  const transitLegs = itinerary.legs.filter((leg) => leg.mode !== 'WALK');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Trip Preview</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Summary Stats */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{duration}</Text>
                <Text style={styles.summaryLabel}>Duration</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{walkDistance}</Text>
                <Text style={styles.summaryLabel}>Walking</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{itinerary.transfers}</Text>
                <Text style={styles.summaryLabel}>Transfers</Text>
              </View>
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>
                {startTime} → {endTime}
              </Text>
            </View>
          </View>

          {/* Route Visual */}
          <View style={styles.routeVisual}>
            <View style={styles.routeIcons}>
              {itinerary.legs.map((leg, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <View style={styles.connector} />}
                  {leg.mode === 'WALK' ? (
                    <View style={styles.walkIcon}>
                      <Text style={styles.walkIconText}>🚶</Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.busIcon,
                        { backgroundColor: leg.route?.color || COLORS.primary },
                      ]}
                    >
                      <Text style={styles.busIconText}>
                        {leg.route?.shortName || '?'}
                      </Text>
                    </View>
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* Condensed Steps */}
          <ScrollView style={styles.stepsScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.stepsContainer}>
              {itinerary.legs.map((leg, index) => (
                <View key={index} style={styles.stepRow}>
                  {/* Timeline dot */}
                  <View style={styles.stepTimeline}>
                    <View
                      style={[
                        styles.stepDot,
                        index === 0 && styles.stepDotFirst,
                        leg.mode !== 'WALK' && {
                          backgroundColor: leg.route?.color || COLORS.primary,
                        },
                      ]}
                    />
                    {index < itinerary.legs.length - 1 && (
                      <View
                        style={[
                          styles.stepLine,
                          leg.mode !== 'WALK' && {
                            backgroundColor: leg.route?.color || COLORS.primary,
                          },
                        ]}
                      />
                    )}
                  </View>

                  {/* Step content */}
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTime}>
                      {formatTimeFromTimestamp(leg.startTime)}
                    </Text>
                    {leg.mode === 'WALK' ? (
                      <View style={styles.stepInfo}>
                        <Text style={styles.stepTitle}>
                          Walk to {leg.to.name}
                        </Text>
                        <Text style={styles.stepSubtitle}>
                          {formatDistance(leg.distance)} • {formatDuration(leg.duration)}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.stepInfo}>
                        <View style={styles.busStepHeader}>
                          <View
                            style={[
                              styles.busStepBadge,
                              { backgroundColor: leg.route?.color || COLORS.primary },
                            ]}
                          >
                            <Text style={styles.busStepBadgeText}>
                              {leg.route?.shortName || '?'}
                            </Text>
                          </View>
                          <Text style={styles.stepTitle} numberOfLines={1}>
                            {leg.headsign || leg.route?.longName || 'Bus'}
                          </Text>
                        </View>
                        <Text style={styles.stepSubtitle}>
                          {leg.intermediateStops?.length || 0} stops • Get off at {leg.to.name}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}

              {/* Final destination */}
              <View style={styles.stepRow}>
                <View style={styles.stepTimeline}>
                  <View style={[styles.stepDot, styles.stepDotLast]} />
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTime}>{endTime}</Text>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepTitle}>Arrive at destination</Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onViewFullDetails}
            >
              <Text style={styles.secondaryButtonText}>View Full Details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onStartNavigation}
            >
              <Text style={styles.primaryButtonText}>Start Navigation</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    ...SHADOWS.large,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.bold,
  },
  summaryCard: {
    margin: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.grey50,
    borderRadius: BORDER_RADIUS.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.grey300,
  },
  summaryValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  timeRow: {
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.grey200,
  },
  timeText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  routeVisual: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  routeIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  connector: {
    width: 16,
    height: 2,
    backgroundColor: COLORS.grey300,
  },
  walkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.grey200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walkIconText: {
    fontSize: 14,
  },
  busIcon: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  busIconText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  stepsScroll: {
    maxHeight: 250,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  stepsContainer: {
    padding: SPACING.md,
  },
  stepRow: {
    flexDirection: 'row',
    minHeight: 50,
  },
  stepTimeline: {
    width: 24,
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.grey400,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  stepDotFirst: {
    backgroundColor: COLORS.success,
  },
  stepDotLast: {
    backgroundColor: COLORS.error,
  },
  stepLine: {
    flex: 1,
    width: 3,
    backgroundColor: COLORS.grey300,
    marginVertical: 2,
  },
  stepContent: {
    flex: 1,
    flexDirection: 'row',
    paddingBottom: SPACING.md,
  },
  stepTime: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    width: 50,
    marginRight: SPACING.xs,
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textPrimary,
  },
  stepSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  busStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  busStepBadge: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.xs,
  },
  busStepBadgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: COLORS.grey100,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.white,
  },
});

export default TripPreviewModal;
