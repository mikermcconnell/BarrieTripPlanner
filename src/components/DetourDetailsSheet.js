import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import Icon from './Icon';
import DetourTimeline from './DetourTimeline';
import DetourImpactSummary from './DetourImpactSummary';
import { formatDetourTime, getConfidenceChip } from '../utils/detourHelpers';

const getDetourTitle = (routeId, state) => {
  const statusLabel = state === 'clear-pending' ? 'Detour Clearing' : 'Detour Active';
  return `Route ${routeId} - ${statusLabel}`;
};

const DetourDetailsSheet = ({ routeId, detour, segmentStopDetails = [], onClose, onViewOnMap }) => {
  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['45%', '78%'], []);

  const handleSheetChanges = useCallback(
    (index) => {
      if (index === -1) onClose?.();
    },
    [onClose]
  );

  const routeColor = ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
  const timeLabel = formatDetourTime(detour?.detectedAt);
  const confidenceChip = detour?.confidence ? getConfidenceChip(detour.confidence) : null;

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
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.routeBadge, { backgroundColor: routeColor }]}>
            <Text style={styles.routeBadgeText}>{routeId}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{getDetourTitle(routeId, detour?.state)}</Text>
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

        <DetourTimeline sections={segmentStopDetails} />
        <DetourImpactSummary sections={segmentStopDetails} />

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
