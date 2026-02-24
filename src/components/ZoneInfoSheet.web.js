import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { isZoneOperating, formatZoneHours } from '../utils/zoneUtils';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';

const CloseIcon = ({ size = 20, color = COLORS.textSecondary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill={color}/>
  </svg>
);

const ZoneIcon = ({ size = 24, color = COLORS.white }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20Z" fill={color}/>
    <path d="M12 6C8.69 6 6 8.69 6 12C6 15.31 8.69 18 12 18C15.31 18 18 15.31 18 12C18 8.69 15.31 6 12 6Z" fill={color} fillOpacity="0.3"/>
  </svg>
);

const PhoneIcon = ({ size = 18, color = COLORS.primary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.62 10.79C8.06 13.62 10.38 15.93 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill={color}/>
  </svg>
);

const DirectionsIcon = ({ size = 16, color = COLORS.primary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.71 11.29L12.71 2.29C12.32 1.9 11.69 1.9 11.3 2.29L2.3 11.29C1.91 11.68 1.91 12.31 2.3 12.7L11.3 21.7C11.5 21.9 11.74 22 12 22C12.26 22 12.5 21.9 12.71 21.71L21.71 12.71C22.1 12.32 22.1 11.68 21.71 11.29ZM14 14.5V12H10V15H8V11C8 10.45 8.45 10 9 10H14V7.5L17.5 11L14 14.5Z" fill={color}/>
  </svg>
);

const StopIcon = ({ size = 16, color = COLORS.textSecondary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill={color}/>
  </svg>
);

const ZoneInfoSheet = ({ zone, onClose, onDirectionsToHub }) => {
  const handleCallBooking = useCallback(() => {
    if (zone?.bookingPhone) {
      window.open(`tel:${zone.bookingPhone}`, '_self');
    }
  }, [zone]);

  const handleDirectionsToHub = useCallback((hubStop) => {
    onDirectionsToHub?.(hubStop);
  }, [onDirectionsToHub]);

  if (!zone) return null;

  const operating = isZoneOperating(zone);
  const hours = formatZoneHours(zone.serviceHours);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.zoneIconContainer, { backgroundColor: zone.color || COLORS.primary }]}>
            <ZoneIcon size={22} color={COLORS.white} />
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.zoneName} numberOfLines={2}>{zone.name}</Text>
            <View style={[styles.statusBadge, operating ? styles.statusBadgeActive : styles.statusBadgeClosed]}>
              <Text style={[styles.statusBadgeText, operating ? styles.statusTextActive : styles.statusTextClosed]}>
                {operating ? 'Operating' : 'Closed'}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close zone details">
          <CloseIcon size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {zone.bookingPhone && (
          <TouchableOpacity style={styles.bookingRow} onPress={handleCallBooking} activeOpacity={0.7}>
            <PhoneIcon size={16} color={COLORS.primary} />
            <View style={styles.bookingInfo}>
              <Text style={styles.bookingLabel}>Book a ride</Text>
              <Text style={styles.bookingPhone}>{zone.bookingPhone}</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Hours</Text>
          {hours.map((row) => (
            <View key={row.day} style={styles.hoursRow}>
              <Text style={styles.hoursDay}>{row.day}</Text>
              <Text style={styles.hoursTime}>{row.hours}</Text>
            </View>
          ))}
        </View>

        {zone.hubStops?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hub Stops</Text>
            {zone.hubStops.map((hubStop, index) => (
              <View key={hubStop.id || index} style={styles.hubStopRow}>
                <StopIcon size={14} color={COLORS.textSecondary} />
                <Text style={styles.hubStopName} numberOfLines={1}>
                  {hubStop.name || `Stop #${hubStop.id}`}
                </Text>
                <TouchableOpacity
                  style={styles.hubDirectionsButton}
                  onPress={() => handleDirectionsToHub(hubStop)}
                  activeOpacity={0.7}
                >
                  <DirectionsIcon size={14} color={COLORS.primary} />
                  <Text style={styles.hubDirectionsText}>Directions</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: SPACING.xl,
    left: 80,
    width: 340,
    maxHeight: 420,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.grey200,
    zIndex: 1001,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(23, 43, 77, 0.15)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerLeft: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'flex-start',
  },
  zoneIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  headerContent: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  zoneName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: SPACING.xxs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusBadgeActive: {
    backgroundColor: COLORS.successSubtle,
  },
  statusBadgeClosed: {
    backgroundColor: COLORS.errorSubtle,
  },
  statusBadgeText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  statusTextActive: {
    color: COLORS.success,
  },
  statusTextClosed: {
    color: COLORS.error,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    maxHeight: 300,
    overflowY: 'auto',
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
    cursor: 'pointer',
  },
  bookingInfo: {
    flex: 1,
  },
  bookingLabel: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bookingPhone: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
    marginTop: SPACING.xxs,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  hoursDay: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textPrimary,
  },
  hoursTime: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  hubStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.xs,
  },
  hubStopName: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
  },
  hubDirectionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primarySubtle,
    paddingVertical: SPACING.xxs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    gap: SPACING.xxs,
    cursor: 'pointer',
  },
  hubDirectionsText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
  },
});

export default ZoneInfoSheet;
