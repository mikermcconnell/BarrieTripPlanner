/**
 * FareCard — Compact fare display + HotSpot CTA
 *
 * Shown in TripBottomSheet below trip results when a trip is selected.
 * Uses only RN primitives so a single file works for both native and web.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { FARES, formatFare } from '../data/fares';
import { openHotSpot } from '../utils/hotspotLinks';

const FareCard = () => {
  const adultFare = formatFare(FARES.singleRide.adult);

  return (
    <View style={styles.container}>
      <View style={styles.accent} />
      <View style={styles.body}>
        <View style={styles.infoRow}>
          <Text style={styles.fareLabel}>
            {'\uD83C\uDFAB'} Adult fare: {adultFare}
          </Text>
          <Text style={styles.transferNote}>
            {FARES.transferPolicy.description}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.button}
          onPress={openHotSpot}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Buy fare on HotSpot app"
        >
          <Text style={styles.buttonText}>Buy on HotSpot →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.secondarySubtle,
    borderRadius: BORDER_RADIUS.md,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  accent: {
    width: 4,
    backgroundColor: COLORS.secondary,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  infoRow: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  fareLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  transferNote: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xxs,
  },
  button: {
    backgroundColor: COLORS.secondary,
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default FareCard;
