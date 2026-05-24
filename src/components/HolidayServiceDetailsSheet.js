import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import Icon from './Icon';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';

const HolidayServiceDetailsSheet = ({
  visible,
  holidayServiceInfo,
  isLoadingDetails = false,
  onClose,
}) => {
  if (!visible || !holidayServiceInfo) return null;

  const routes = holidayServiceInfo.routes || [];
  const isNoService = holidayServiceInfo.status === 'no_service';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTapArea} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Icon name={isNoService ? 'Warning' : 'Celebration'} size={20} color={COLORS.warning} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{holidayServiceInfo.badgeLabel}</Text>
              <Text style={styles.title}>{holidayServiceInfo.title}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close holiday service details"
            >
              <Icon name="X" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.summary}>{holidayServiceInfo.detailsMessage}</Text>

          {isLoadingDetails && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading first and last trips…</Text>
            </View>
          )}

          {isNoService ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No fixed-route trips scheduled</Text>
              <Text style={styles.emptyText}>
                This comes from Barrie Transit’s GTFS calendar_dates.txt for this date.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.routeList} contentContainerStyle={styles.routeListContent}>
              {routes.map((route) => (
                <View key={route.routeId} style={styles.routeCard}>
                  <View style={styles.routeBadge}>
                    <Text style={styles.routeBadgeText}>{route.routeShortName}</Text>
                  </View>
                  <View style={styles.routeCopy}>
                    <Text style={styles.routeTitle}>Route {route.routeShortName}</Text>
                    {route.routeLongName ? (
                      <Text style={styles.routeSubtitle}>{route.routeLongName}</Text>
                    ) : null}
                    <Text style={styles.routeTimes}>
                      {route.firstTripLabel && route.lastTripLabel
                        ? `${route.firstTripLabel} – ${route.lastTripLabel}`
                        : 'Times available when trip data finishes loading'}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(9, 30, 66, 0.32)',
  },
  backdropTapArea: {
    flex: 1,
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    ...SHADOWS.large,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: COLORS.grey300,
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.warningSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.grey100,
  },
  summary: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },
  loadingRow: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  emptyCard: {
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.errorSubtle,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  emptyText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  routeList: {
    marginTop: SPACING.lg,
  },
  routeListContent: {
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.grey50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  routeBadge: {
    minWidth: 44,
    minHeight: 36,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  routeBadgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.extrabold,
  },
  routeCopy: {
    flex: 1,
  },
  routeTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  routeSubtitle: {
    marginTop: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  routeTimes: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primaryDark,
  },
});

export default HolidayServiceDetailsSheet;
