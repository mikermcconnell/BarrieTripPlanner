/**
 * MapTapPopup - Popup that appears when user taps on the map
 * Shows "Directions from here" and "Directions to here" options
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';

const MapTapPopup = ({
  visible,
  coordinate,
  address,
  isLoading,
  onDirectionsFrom,
  onDirectionsTo,
  onClose,
}) => {
  if (!visible || !coordinate) return null;

  return (
    <View style={styles.container}>
      <View style={styles.popup}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>

        {/* Address display */}
        <View style={styles.addressContainer}>
          <Text style={styles.addressIcon}>📍</Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Text style={styles.addressText} numberOfLines={2}>
              {address || 'Selected location'}
            </Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Action buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.button, styles.fromButton]}
            onPress={onDirectionsFrom}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonIcon}>🚀</Text>
            <Text style={styles.buttonText}>Directions from here</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.toButton]}
            onPress={onDirectionsTo}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonIcon}>🎯</Text>
            <Text style={styles.buttonText}>Directions to here</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 120,
    left: SPACING.md,
    right: SPACING.md,
    alignItems: 'center',
  },
  popup: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    width: '100%',
    maxWidth: 340,
    ...SHADOWS.large,
  },
  closeButton: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  closeButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.bold,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: SPACING.xl,
    minHeight: 40,
  },
  addressIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  addressText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  buttonsContainer: {
    gap: SPACING.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  fromButton: {
    backgroundColor: COLORS.successSubtle,
  },
  toButton: {
    backgroundColor: COLORS.errorSubtle,
  },
  buttonIcon: {
    fontSize: 18,
  },
  buttonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
});

export default MapTapPopup;
