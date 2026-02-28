import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';
import Icon from './Icon';

function formatDetourTime(detectedAt) {
  if (!detectedAt) return null;
  const date = detectedAt instanceof Date ? detectedAt : new Date(detectedAt);
  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 60) {
    return `Since ${diffMin} min ago`;
  }
  return `Since ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const DetourDetailsSheet = ({ routeId, detour, affectedStops, onClose, onViewOnMap }) => {
  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['35%', '60%'], []);

  const handleSheetChanges = useCallback(
    (index) => {
      if (index === -1) onClose?.();
    },
    [onClose]
  );

  const routeColor = ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
  const timeLabel = formatDetourTime(detour?.detectedAt);

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
          <View style={[styles.routeDot, { backgroundColor: routeColor }]} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Route {routeId} — Detour Active</Text>
            {timeLabel && <Text style={styles.timeLabel}>{timeLabel}</Text>}
          </View>
        </View>

        <View style={styles.divider} />

        {affectedStops && affectedStops.length > 0 ? (
          <View style={styles.stopsSection}>
            <Text style={styles.sectionHeader}>Skipped Stops</Text>
            {affectedStops.map((stop) => (
              <View key={stop.id} style={styles.stopRow}>
                <Icon name="X" size={14} color={COLORS.error} />
                <Text style={styles.stopName}>{stop.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>Detour detected — stop details pending</Text>
        )}

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
  routeDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: SPACING.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  timeLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.grey200,
    marginVertical: SPACING.lg,
  },
  stopsSection: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  stopName: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginBottom: SPACING.lg,
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
