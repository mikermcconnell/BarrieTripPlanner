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
  if (length >= 3) return { width: 62, height: 28, borderRadius: 14 };
  if (length === 2) return { width: 54, height: 28, borderRadius: 14 };
  return { width: 48, height: 28, borderRadius: 14 };
};

export const getRouteLineBadgeArrowRotation = (bearing) => {
  const numericBearing = Number(bearing);
  if (!Number.isFinite(numericBearing)) return '0deg';
  return `${((numericBearing % 360) + 360) % 360}deg`;
};

const getRouteLineBadgeForegroundColor = (color) => {
  const routeColor = color || '#1A73E8';
  return getRouteLineBadgeTextColor(routeColor) === '#111827' ? '#111827' : routeColor;
};

const getDirectionArrow = (direction) => (direction === 'left' ? '←' : '→');
const getDirectionLabel = (direction) => (direction === 'left' ? '← THIS WAY' : 'THIS WAY →');

const RouteLineBadge = ({ label, color, bearing = null, branches = null }) => {
  const routeColor = color || '#1A73E8';
  const pairedBranches = Array.isArray(branches) ? branches.slice(0, 2) : [];
  if (pairedBranches.length >= 2) {
    return (
      <View
        pointerEvents="none"
        accessibilityLabel={`Route ${pairedBranches.map((branch) => branch.label).join(' and ')}`}
        style={[styles.familyShell, { borderColor: routeColor }]}
      >
        {pairedBranches.map((branch, index) => (
          <View
            key={`${branch.routeId || branch.label}-${index}`}
            style={[styles.familyBranch, { backgroundColor: routeColor }]}
          >
            <View
              accessibilityLabel={`This way ${branch.direction === 'left' ? 'left' : 'right'}`}
              style={styles.directionPill}
            >
              <Text allowFontScaling={false} style={[styles.directionText, { color: routeColor }]}>
                {getDirectionLabel(branch.direction)}
              </Text>
            </View>
            <Text numberOfLines={1} allowFontScaling={false} style={styles.familyRouteText}>
              {branch.label}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  const dimensions = getRouteLineBadgeDimensions(label);
  const textColor = getRouteLineBadgeForegroundColor(routeColor);
  const arrowTextColor = getRouteLineBadgeTextColor(routeColor);
  const arrowDegrees = Number.isFinite(Number(bearing)) ? Math.round(((Number(bearing) % 360) + 360) % 360) : null;

  return (
    <View
      pointerEvents="none"
      accessibilityLabel={`Route ${label}`}
      style={[styles.badge, dimensions, { backgroundColor: routeColor, borderColor: routeColor }]}
    >
      <Text numberOfLines={1} allowFontScaling={false} style={[styles.text, { color: arrowTextColor }]}>
        {label}
      </Text>
      <View
        accessibilityLabel={arrowDegrees === null ? 'Route direction' : `Route direction ${arrowDegrees} degrees`}
        style={styles.arrowBubble}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.arrow,
            { color: textColor, transform: [{ rotate: getRouteLineBadgeArrowRotation(bearing) }] },
          ]}
        >
          {getDirectionArrow('right')}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderWidth: 2,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  familyShell: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 3,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    padding: 5,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  familyBranch: {
    alignItems: 'center',
    borderRadius: 14,
    height: 58,
    justifyContent: 'center',
    paddingHorizontal: 14,
    width: 104,
  },
  directionPill: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    marginBottom: 3,
    paddingHorizontal: 8,
    minWidth: 80,
  },
  directionText: {
    fontSize: 9,
    fontWeight: '900',
    includeFontPadding: false,
    letterSpacing: 0.4,
    lineHeight: 10,
    textAlign: 'center',
  },
  familyRouteText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    includeFontPadding: false,
    letterSpacing: -0.3,
    lineHeight: 25,
    textAlign: 'center',
  },
  arrowBubble: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 7,
    height: 14,
    justifyContent: 'center',
    width: 18,
  },
  arrow: {
    fontSize: 11,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 12,
    textAlign: 'center',
  },
  text: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.1,
    includeFontPadding: false,
    textAlign: 'center',
  },
});

export default RouteLineBadge;
