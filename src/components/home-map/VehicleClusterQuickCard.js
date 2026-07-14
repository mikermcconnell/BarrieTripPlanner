import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, SHADOWS, SPACING } from '../../config/theme';

const VehicleClusterQuickCard = ({ vehicles = [], getRouteLabel, getRouteColor, onSelectVehicle, onClose, style }) => {
  if (vehicles.length < 2) return null;

  return (
    <View style={[styles.card, style]} accessibilityRole="summary">
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={styles.title}>{vehicles.length} buses together</Text>
          <Text style={styles.help}>Tap a route for bus details</Text>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close grouped bus details">
          <Text style={styles.closeText}>×</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.badges}>
        {vehicles.map((vehicle) => {
          const routeLabel = String(getRouteLabel?.(vehicle) || vehicle.routeId || '?');
          return (
            <TouchableOpacity
              key={String(vehicle.id)}
              style={[styles.badge, { backgroundColor: getRouteColor?.(vehicle.routeId) || COLORS.primary }]}
              onPress={() => onSelectVehicle?.(String(vehicle.id))}
              accessibilityRole="button"
              accessibilityLabel={`View route ${routeLabel} bus`}
            >
              <Text style={styles.badgeText}>{routeLabel}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 12, right: 12, padding: SPACING.md, borderRadius: BORDER_RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'rgba(255,255,255,0.98)', zIndex: 1002, ...SHADOWS.medium },
  header: { flexDirection: 'row', alignItems: 'center' },
  copy: { flex: 1 },
  title: { color: COLORS.textPrimary, fontSize: FONT_SIZES.md, fontFamily: FONT_FAMILIES.bold },
  help: { marginTop: 2, color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, fontFamily: FONT_FAMILIES.medium },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  badge: { minWidth: 44, height: 36, paddingHorizontal: 10, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.white },
  badgeText: { color: COLORS.white, fontSize: FONT_SIZES.md, fontFamily: FONT_FAMILIES.bold },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.grey50 },
  closeText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xl, lineHeight: 22, fontFamily: FONT_FAMILIES.semibold },
});

export default React.memo(VehicleClusterQuickCard);
