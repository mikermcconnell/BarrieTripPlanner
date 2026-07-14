import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, SHADOWS, SPACING } from '../../config/theme';
import { isHomeVehicleStale } from '../../utils/homeVehicleFeatures';
import { formatVehicleFreshness } from '../../utils/homeVehiclePresentation';

const VehicleQuickCard = ({ vehicle, routeLabel, routeColor, feedIsStale = false, onClose, style }) => {
  if (!vehicle) return null;
  const headsign = vehicle.headsign && vehicle.headsign !== 'Unknown' ? `To ${vehicle.headsign}` : 'Live Barrie Transit bus';
  const stale = isHomeVehicleStale(vehicle, Date.now(), feedIsStale);

  return (
    <View
      style={[styles.card, stale && styles.cardStale, style]}
    >
      <View style={[styles.routeBadge, { backgroundColor: routeColor }]}>
        <Text style={styles.routeText}>{routeLabel}</Text>
      </View>
      <View
        accessible
        accessibilityLabel={`Route ${routeLabel}. ${headsign}. ${formatVehicleFreshness(vehicle, Date.now(), feedIsStale)}`}
        style={styles.copy}
      >
        <Text style={styles.headsign} numberOfLines={1}>{headsign}</Text>
        <Text style={[styles.freshness, stale && styles.freshnessStale]} numberOfLines={1}>
          {formatVehicleFreshness(vehicle, Date.now(), feedIsStale)}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close bus details"
      >
        <Text style={styles.closeText}>×</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.98)',
    zIndex: 1002,
    ...SHADOWS.medium,
  },
  cardStale: { borderColor: 'rgba(255,153,31,0.4)' },
  routeBadge: { minWidth: 42, height: 36, paddingHorizontal: 8, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  routeText: { color: COLORS.white, fontSize: FONT_SIZES.md, fontFamily: FONT_FAMILIES.bold },
  copy: { flex: 1, minWidth: 0 },
  headsign: { fontSize: FONT_SIZES.md, fontFamily: FONT_FAMILIES.bold, color: COLORS.textPrimary },
  freshness: { marginTop: 2, fontSize: FONT_SIZES.xs, fontFamily: FONT_FAMILIES.medium, color: COLORS.textSecondary },
  freshnessStale: { color: COLORS.accentDark },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.grey50 },
  closeText: { fontSize: FONT_SIZES.xl, lineHeight: 22, fontFamily: FONT_FAMILIES.semibold, color: COLORS.textSecondary },
});

export default React.memo(VehicleQuickCard);
