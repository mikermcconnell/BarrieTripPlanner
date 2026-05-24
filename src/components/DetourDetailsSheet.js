import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import Icon from './Icon';
import DetourImpactSummary from './DetourImpactSummary';
import { formatDetourStartedAt, formatDetourTime, getConfidenceChip } from '../utils/detourHelpers';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
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
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['45%', '78%'], []);

  const handleSheetChanges = useCallback(
    (index) => {
      if (index === -1) onClose?.();
    },
    [onClose]
  );

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
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: addSafeBottomPadding(SPACING.xxl, bottomInset) },
        ]}
      >
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
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close detour details"
          >
            <Icon name="X" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

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
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
  },
  handleIndicator: {
    backgroundColor: COLORS.grey300,
    width: 40,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  closeButton: {
    padding: SPACING.sm,
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
  divider: {
    height: 1,
    backgroundColor: COLORS.grey200,
    marginVertical: SPACING.lg,
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
