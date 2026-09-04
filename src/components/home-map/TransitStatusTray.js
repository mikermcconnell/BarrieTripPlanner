import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, SPACING } from '../../config/theme';
import { getSystemHealthChipState } from '../../utils/systemHealthUI';
import { buildVehicleSelectionLabel } from '../../utils/homeVehiclePresentation';
import { useGpsRefreshCountdown } from '../../hooks/useGpsRefreshCountdown';

const TransitStatusTray = ({
  diagnostics,
  selectedRouteNames = [],
  activeVehicleCount = 0,
  nextVehicleRefreshAt = null,
}) => {
  const display = getSystemHealthChipState(diagnostics);
  const gpsCountdown = useGpsRefreshCountdown(nextVehicleRefreshAt);
  const primaryDisplay = display.label === 'LIVE' && gpsCountdown
    ? { ...display, ...gpsCountdown }
    : display;
  const selectionLabel = buildVehicleSelectionLabel(selectedRouteNames, activeVehicleCount);

  return (
    <View
      accessible
      accessibilityLabel={selectionLabel ? `${primaryDisplay.accessibilityLabel}. ${selectionLabel}` : primaryDisplay.accessibilityLabel}
      style={styles.tray}
    >
      <View style={[styles.statusSegment, { backgroundColor: primaryDisplay.backgroundColor }]}>
        <View style={[styles.dot, { backgroundColor: primaryDisplay.dotColor }]} />
        <Text style={[styles.statusText, { color: primaryDisplay.textColor }]} numberOfLines={1}>
          {primaryDisplay.label}
        </Text>
      </View>
      {selectionLabel ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.selectionText} numberOfLines={1}>{selectionLabel}</Text>
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  tray: {
    maxWidth: 190,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.grey50,
  },
  statusSegment: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    gap: SPACING.xs,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  divider: { width: 1, height: 20, marginHorizontal: 5, backgroundColor: COLORS.border },
  selectionText: {
    flexShrink: 1,
    paddingRight: 6,
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.primaryDark,
  },
});

export default React.memo(TransitStatusTray);
