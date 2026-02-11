/**
 * FareInfoPanel — Full fare reference panel (collapsible)
 *
 * Shown in TripDetailsScreen between step-by-step directions and trip tips.
 * Uses only RN primitives so a single file works for both native and web.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../config/theme';
import { FARES, formatFare } from '../data/fares';
import { openHotSpot } from '../utils/hotspotLinks';

const FARE_TABLE_ROWS = [
  { label: 'Adult', single: FARES.singleRide.adult, tenRide: FARES.tenRide.adult, monthly: FARES.monthlyPass.adult },
  { label: 'Student', single: FARES.singleRide.student, tenRide: FARES.tenRide.student, monthly: FARES.monthlyPass.student },
  { label: 'Senior', single: FARES.singleRide.senior, tenRide: FARES.tenRide.senior, monthly: FARES.monthlyPass.senior },
];

const FareInfoPanel = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      {/* Header toggle */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Fare information, ${expanded ? 'collapse' : 'expand'}`}
      >
        <Text style={styles.headerTitle}>{'\uD83C\uDFAB'} Fare Information</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {/* Fare table */}
          <View style={styles.table}>
            {/* Table header */}
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.tableHeaderCell, styles.labelCell]} />
              <Text style={[styles.tableCell, styles.tableHeaderCell]}>Single</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell]}>10-Ride</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell]}>Monthly</Text>
            </View>

            {/* Table rows */}
            {FARE_TABLE_ROWS.map((row) => (
              <View key={row.label} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.labelCell, styles.rowLabel]}>{row.label}</Text>
                <Text style={styles.tableCell}>{formatFare(row.single)}</Text>
                <Text style={styles.tableCell}>{formatFare(row.tenRide)}</Text>
                <Text style={styles.tableCell}>{formatFare(row.monthly)}</Text>
              </View>
            ))}

            {/* Child row (special) */}
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.labelCell, styles.rowLabel]}>Child 12-</Text>
              <Text style={[styles.tableCell, styles.freeText]}>FREE</Text>
              <Text style={styles.tableCell} />
              <Text style={styles.tableCell} />
            </View>
          </View>

          {/* Day pass */}
          <View style={styles.section}>
            <Text style={styles.sectionText}>
              Day Pass: {formatFare(FARES.dayPass.individual)} (Family: {formatFare(FARES.dayPass.family)})
            </Text>
          </View>

          {/* Free programs */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Free fares:</Text>
            <Text style={styles.sectionText}>
              {FARES.freePrograms.join(', ')}
            </Text>
          </View>

          {/* Payment methods */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Pay with:</Text>
            <Text style={styles.sectionText}>
              {FARES.paymentMethods.join(', ')}
            </Text>
          </View>

          {/* HotSpot button */}
          <TouchableOpacity
            style={styles.hotspotButton}
            onPress={openHotSpot}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open HotSpot app to buy fare"
          >
            <Text style={styles.hotspotButtonText}>Open HotSpot App</Text>
          </TouchableOpacity>

          {/* Last updated */}
          <Text style={styles.updated}>Prices as of {FARES.lastUpdated}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.small,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  headerTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  chevron: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  body: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  // Fare table
  table: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  tableCell: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  tableHeaderCell: {
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.grey50,
    fontSize: FONT_SIZES.xs,
  },
  labelCell: {
    textAlign: 'left',
  },
  rowLabel: {
    fontWeight: FONT_WEIGHTS.medium,
  },
  freeText: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  // Sections below table
  section: {
    marginTop: SPACING.sm,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xxs,
  },
  sectionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    lineHeight: FONT_SIZES.sm * 1.5,
  },
  // HotSpot CTA
  hotspotButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  hotspotButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  updated: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textDisabled,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});

export default FareInfoPanel;
