import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import Icon from './Icon';
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
} from '../config/theme';

const TripViewportControls = ({
  style,
  onCenterOnUserLocation,
  onShowTrip,
  onToggleFollow,
  isFollowActive = false,
  showLabels = false,
}) => {
  const actions = [];

  if (typeof onToggleFollow === 'function') {
    actions.push({
      key: 'follow',
      icon: 'Route',
      label: 'Follow',
      active: isFollowActive,
      onPress: onToggleFollow,
      accessibilityLabel: isFollowActive ? 'Stop following my location' : 'Follow my location',
    });
  }

  if (typeof onCenterOnUserLocation === 'function') {
    actions.push({
      key: 'my-location',
      icon: 'MapPin',
      label: 'My location',
      active: false,
      onPress: onCenterOnUserLocation,
      accessibilityLabel: 'Center on my location',
    });
  }

  if (typeof onShowTrip === 'function') {
    actions.push({
      key: 'show-trip',
      icon: 'Map',
      label: 'Full trip',
      active: false,
      onPress: onShowTrip,
      accessibilityLabel: 'Show full trip on the map',
    });
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.key}
          style={[styles.button, action.active && styles.buttonActive]}
          onPress={action.onPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
        >
          <Icon
            name={action.icon}
            size={18}
            color={action.active ? COLORS.white : COLORS.textPrimary}
          />
          {showLabels && (
            <Text style={[styles.label, action.active && styles.labelActive]}>
              {action.label}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: SPACING.xs,
    padding: 4,
    borderRadius: BORDER_RADIUS.xxl,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: COLORS.grey200,
    ...SHADOWS.medium,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  label: {
    width: '100%',
    marginTop: 1,
    color: COLORS.textPrimary,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    textAlign: 'center',
  },
  labelActive: {
    color: COLORS.white,
  },
  buttonActive: {
    backgroundColor: COLORS.primary,
  },
});

export default TripViewportControls;
