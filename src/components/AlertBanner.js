import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';
import { getSeverityIcon, getSeverityColor } from '../utils/alertHelpers';

// SVG Icons - Refined for premium feel
const WarningIcon = ({ size = 16, color = COLORS.white }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M1 21H23L12 2L1 21ZM13 18H11V16H13V18ZM13 14H11V10H13V14Z" fill={color}/>
  </Svg>
);

const InfoIcon = ({ size = 16, color = COLORS.white }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z" fill={color}/>
  </Svg>
);

const ErrorIcon = ({ size = 16, color = COLORS.white }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill={color}/>
  </Svg>
);

const ChevronIcon = ({ size = 18, color = COLORS.grey400 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M10 6L8.59 7.41L13.17 12L8.59 16.59L10 18L16 12L10 6Z" fill={color}/>
  </Svg>
);

const AlertBanner = ({ alerts, alert: singleAlert, onPress, onDismiss, style }) => {
  // Support both single alert and array of alerts
  const alert = singleAlert || (alerts && alerts.length > 0 ? alerts[0] : null);

  // Return null if no valid alert
  if (!alert || !alert.severity) {
    return null;
  }

  const severityColor = getSeverityColor(alert.severity);
  const alertCount = alerts ? alerts.length : 1;

  const getIcon = () => {
    switch (alert.severity) {
      case 'high':
        return <ErrorIcon size={16} color={COLORS.white} />;
      case 'medium':
        return <WarningIcon size={16} color={COLORS.white} />;
      default:
        return <InfoIcon size={16} color={COLORS.white} />;
    }
  };

  const getContainerStyle = () => {
    switch (alert.severity) {
      case 'high':
        return styles.containerHigh;
      case 'medium':
        return styles.containerMedium;
      default:
        return styles.containerLow;
    }
  };

  const getBadgeStyle = () => {
    switch (alert.severity) {
      case 'high':
        return styles.badgeHigh;
      case 'medium':
        return styles.badgeMedium;
      default:
        return styles.badgeLow;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, getContainerStyle(), style]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={[styles.iconContainer, { backgroundColor: severityColor }]}>
        {getIcon()}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {alertCount > 1 ? `${alertCount} Service Alerts` : alert.title}
      </Text>

      {alertCount > 1 && (
        <View style={[styles.countBadge, getBadgeStyle()]}>
          <Text style={styles.countText}>{alertCount}</Text>
        </View>
      )}

      <View style={styles.chevronContainer}>
        <ChevronIcon size={20} color={COLORS.grey400} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 140,
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    ...SHADOWS.medium,
    zIndex: 998,
    // Web-specific premium styling
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 16px rgba(23, 43, 77, 0.1)',
      backdropFilter: 'blur(8px)',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
    }),
  },
  containerHigh: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
    ...(Platform.OS === 'web' && {
      backgroundColor: COLORS.errorSubtle,
      borderWidth: 1,
      borderColor: 'rgba(222, 53, 11, 0.2)',
    }),
  },
  containerMedium: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    ...(Platform.OS === 'web' && {
      backgroundColor: COLORS.warningSubtle,
      borderWidth: 1,
      borderColor: 'rgba(255, 153, 31, 0.2)',
    }),
  },
  containerLow: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.info,
    ...(Platform.OS === 'web' && {
      backgroundColor: COLORS.infoSubtle,
      borderWidth: 1,
      borderColor: 'rgba(0, 102, 204, 0.2)',
    }),
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    letterSpacing: -0.1,
  },
  countBadge: {
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    marginRight: SPACING.xs,
  },
  badgeHigh: {
    backgroundColor: COLORS.error,
  },
  badgeMedium: {
    backgroundColor: COLORS.warning,
  },
  badgeLow: {
    backgroundColor: COLORS.info,
  },
  countText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  chevronContainer: {
    marginLeft: SPACING.xs,
  },
});

export default AlertBanner;
