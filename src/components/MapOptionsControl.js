import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, SHADOWS, FONT_SIZES, FONT_WEIGHTS, FONT_FAMILIES, BORDER_RADIUS } from '../config/theme';
import Icon from './Icon';
import MapViewModeToggle from './MapViewModeToggle';

const MapOptionsControl = ({
  visible = true,
  isOpen = false,
  onToggleOpen,
  showStops = false,
  onToggleStops,
  showZones = false,
  onToggleZones,
  zoneCount = 0,
  canUseDetourView = false,
  mapViewMode = 'regular',
  onMapViewModeChange,
  detourCount = 0,
  anchored = true,
  style,
}) => {
  if (!visible) return null;

  return (
    <View style={[anchored ? styles.container : styles.embeddedContainer, style]} pointerEvents="box-none">
      {isOpen && (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Map options</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onToggleOpen}
              accessibilityRole="button"
              accessibilityLabel="Close map options"
            >
              <Icon name="X" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.optionRow, showStops && styles.optionRowActive]}
            onPress={onToggleStops}
            accessibilityRole="button"
            accessibilityLabel={showStops ? 'Hide stops' : 'Show stops'}
          >
            <Icon name="MapPin" size={16} color={showStops ? COLORS.white : COLORS.primary} fill={showStops ? COLORS.white : 'none'} />
            <Text style={[styles.optionText, showStops && styles.optionTextActive]}>
              {showStops ? 'Stops shown' : 'Show stops'}
            </Text>
          </TouchableOpacity>

          {zoneCount > 0 && (
            <TouchableOpacity
              style={[styles.optionRow, showZones && styles.optionRowActive]}
              onPress={onToggleZones}
              accessibilityRole="button"
              accessibilityLabel={showZones ? 'Hide zones' : 'Show zones'}
            >
              <Icon name="Map" size={16} color={showZones ? COLORS.white : COLORS.primary} />
              <Text style={[styles.optionText, showZones && styles.optionTextActive]}>
                Zones {zoneCount}
              </Text>
            </TouchableOpacity>
          )}

          {canUseDetourView && (
            <View style={styles.detourModeRow}>
              <Text style={styles.optionLabel}>View</Text>
              <MapViewModeToggle
                visible
                mode={mapViewMode}
                onChange={onMapViewModeChange}
                detourCount={detourCount}
                inline
              />
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, isOpen && styles.buttonActive]}
        onPress={onToggleOpen}
        accessibilityRole="button"
        accessibilityLabel={isOpen ? 'Close map options' : 'Open map options'}
      >
        <Icon name="Settings" size={18} color={isOpen ? COLORS.white : COLORS.primaryDark} />
        <Text style={[styles.buttonText, isOpen && styles.buttonTextActive]}>Map options</Text>
        {detourCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{detourCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.sm,
    bottom: SPACING.xl,
    zIndex: 1000,
    alignItems: 'flex-start',
    gap: SPACING.xs,
  },
  embeddedContainer: {
    zIndex: 1000,
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  button: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.small,
  },
  buttonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  buttonText: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.primaryDark,
  },
  buttonTextActive: {
    color: COLORS.white,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    backgroundColor: COLORS.warningSubtle,
  },
  badgeText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.warning,
  },
  panel: {
    width: 256,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: SPACING.xs,
    ...SHADOWS.elevated,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  panelTitle: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.grey100,
  },
  optionRowActive: {
    backgroundColor: COLORS.primary,
  },
  optionText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.textPrimary,
  },
  optionTextActive: {
    color: COLORS.white,
  },
  optionLabel: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detourModeRow: {
    gap: SPACING.xs,
    paddingTop: SPACING.xs,
  },
});

export default MapOptionsControl;
