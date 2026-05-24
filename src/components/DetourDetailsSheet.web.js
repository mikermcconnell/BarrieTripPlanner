import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Linking } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import Icon from './Icon';
import DetourImpactSummary from './DetourImpactSummary';
import { formatDetourStartedAt, formatDetourTime, getConfidenceChip } from '../utils/detourHelpers';
import { findRouteDetourNotice, getNoticeEndText } from '../utils/noticeTimingUtils';

const getDetourTitle = (routeId, state) => {
  const statusLabel = state === 'clear-pending' ? 'Detour Clearing' : 'Detour Active';
  return `Route ${routeId} - ${statusLabel}`;
};

const DetourDetailsSheet = ({
  routeId,
  detour,
  detourEvent = null,
  routeColor: routeColorOverride,
  routeColorByRouteId = {},
  segmentStopDetails = [],
  transitNews = [],
  onClose,
  onViewOnMap,
}) => {
  const [slideAnim] = useState(new Animated.Value(100));
  // Keep a ref to onClose so the Escape key handler never captures a stale value
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Slide-in animation on mount
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, []);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onCloseRef.current?.());
  }, [slideAnim]);

  // Escape key handler — uses ref so it's never stale
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleClose]);

  const routeColor = routeColorOverride || ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
  const getRouteColor = (id) => routeColorByRouteId[id] || ROUTE_COLORS[id] || routeColor;
  const impactRouteLabel = detourEvent?.routeIds?.length > 1
    ? `Routes ${detourEvent.routeIds.join('/')}`
    : null;
  const timeLabel = formatDetourTime(detour?.detectedAt);
  const startedAtLabel = formatDetourStartedAt(detour?.detectedAt);
  const confidenceChip = detour?.confidence ? getConfidenceChip(detour.confidence) : null;
  const myRideNotice = findRouteDetourNotice(routeId, transitNews);
  const timingTitle = myRideNotice ? 'MyRide timing' : 'Unplanned detour';
  const myRideEndText = myRideNotice
    ? getNoticeEndText({ endsAt: myRideNotice.window?.endsAt ?? myRideNotice.endsAt }, 'Detour end date is not listed.')
    : 'End time unknown.';
  const myRideUrl = myRideNotice?.url ?? myRideNotice?.sourceUrl ?? null;
  const openMyRideNotice = () => {
    if (myRideUrl) Linking.openURL(myRideUrl).catch(() => {});
  };

  return (
    <>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
        accessibilityLabel="Close detour details"
      />
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: [0, 400],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.handleBar} />

        <View style={styles.header}>
          <View style={[styles.routeBadge, { backgroundColor: routeColor }]}>
            <Text style={styles.routeBadgeText}>{routeId}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{detourEvent?.title || getDetourTitle(routeId, detour?.state)}</Text>
            {detourEvent?.routeIds?.length > 0 && (
              <View style={styles.eventRoutesRow}>
                {detourEvent.routeIds.map((eventRouteId) => (
                  <View key={eventRouteId} style={[styles.eventRouteChip, { backgroundColor: getRouteColor(eventRouteId) }]}>
                    <Text style={styles.eventRouteChipText}>{eventRouteId}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.headerMeta}>
              {timeLabel && <Text style={styles.timeLabel}>{timeLabel}</Text>}
              {confidenceChip && (
                <View style={[styles.confidenceChip, { backgroundColor: confidenceChip.bgColor }]}>
                  <Text style={[styles.confidenceText, { color: confidenceChip.color }]}>{confidenceChip.label}</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close detour details"
          >
            <Icon name="X" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          <View style={styles.timingCard}>
            <Text style={styles.timingTitle}>{timingTitle}</Text>
            {startedAtLabel && <Text style={styles.timingText}>Started: {startedAtLabel}</Text>}
            <Text style={styles.timingText}>{myRideEndText}</Text>
            {myRideNotice?.title && <Text style={styles.timingSource} numberOfLines={2}>{myRideNotice.title}</Text>}
            {myRideUrl && (
              <TouchableOpacity
                style={styles.noticeLinkButton}
                onPress={openMyRideNotice}
                accessibilityRole="button"
                accessibilityLabel="Open MyRide detour notice"
              >
                <Text style={styles.noticeLinkText}>Open MyRide notice</Text>
              </TouchableOpacity>
            )}
          </View>

          <DetourImpactSummary routeId={routeId} routeLabel={impactRouteLabel} sections={segmentStopDetails} />

          <TouchableOpacity
            style={styles.viewButton}
            onPress={onViewOnMap}
            accessibilityRole="button"
            accessibilityLabel="View detour on map"
          >
            <Text style={styles.viewButtonText}>View on Map</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 999,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '78%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
    zIndex: 1000,
    paddingBottom: SPACING.xl,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.grey300,
    alignSelf: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  routeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
    minWidth: 28,
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  routeBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  eventRoutesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  eventRouteChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
  },
  eventRouteChipText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
  },
  timeLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  confidenceChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.round,
  },
  confidenceText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  closeButton: {
    padding: SPACING.sm,
    cursor: 'pointer',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.grey200,
    marginVertical: SPACING.lg,
    marginHorizontal: SPACING.lg,
  },
  scrollArea: {
    paddingHorizontal: SPACING.lg,
  },
  scrollContent: {
    paddingBottom: SPACING.lg,
  },
  timingCard: {
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.warningSubtle,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  timingTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.warning,
    marginBottom: SPACING.xxs,
  },
  timingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  timingSource: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  noticeLinkButton: {
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.white,
    cursor: 'pointer',
  },
  noticeLinkText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  viewButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  viewButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default DetourDetailsSheet;
