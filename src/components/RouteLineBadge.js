import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const normalizeHex = (value) => {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace('#', '');
  if (hex.length !== 6 || /[^0-9a-f]/i.test(hex)) return null;
  return hex;
};

export const getRouteLineBadgeTextColor = (backgroundColor) => {
  const hex = normalizeHex(backgroundColor);
  if (!hex) return '#FFFFFF';

  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const brightness = ((red * 299) + (green * 587) + (blue * 114)) / 1000;

  return brightness > 165 ? '#111827' : '#FFFFFF';
};

export const getRouteLineBadgeDimensions = (label) => {
  const length = String(label || '').length;
  if (length >= 3) return { width: 42, height: 30, borderRadius: 8 };
  if (length === 2) return { width: 34, height: 30, borderRadius: 8 };
  return { width: 30, height: 30, borderRadius: 8 };
};

const RouteLineBadge = ({ label, color }) => {
  const dimensions = getRouteLineBadgeDimensions(label);
  const textColor = getRouteLineBadgeTextColor(color);

  return (
    <View
      pointerEvents="none"
      accessibilityLabel={`Route ${label}`}
      style={[styles.badge, dimensions, { backgroundColor: color || '#1A73E8' }]}
    >
      <Text numberOfLines={1} allowFontScaling={false} style={[styles.text, { color: textColor }]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.1,
    includeFontPadding: false,
    textAlign: 'center',
  },
});

export default RouteLineBadge;
