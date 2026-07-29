import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import RouteChipRail from '../RouteChipRail';
import { COLORS, SHADOWS, SPACING } from '../../config/theme';
import { HOME_MAP_THEME } from '../../config/homeMapTheme';

const LocateIcon = ({ color = COLORS.primaryDark, size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth="2" />
    <Circle cx="12" cy="12" r="1.5" fill={color} />
    <Path d="M12 2.5V5M12 19V21.5M2.5 12H5M19 12H21.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

const StopsIcon = ({ color = COLORS.primaryDark, size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"
      stroke={color}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <Circle cx="12" cy="10" r="2.25" fill={color} />
  </Svg>
);

const MapBottomControlTray = ({
  routes,
  selectedRoutes,
  onRouteSelect,
  onRouteFamilySelect,
  getRouteColor,
  isRouteDetouring,
  showStops = false,
  onToggleStops,
  onCenterOnLocation,
  isCenteringOnLocation = false,
  style,
}) => (
  <View style={[styles.container, style]} pointerEvents="box-none">
    <RouteChipRail
      embedded
      routes={routes}
      selectedRoutes={selectedRoutes}
      onRouteSelect={onRouteSelect}
      onRouteFamilySelect={onRouteFamilySelect}
      getRouteColor={getRouteColor}
      isRouteDetouring={isRouteDetouring}
      style={styles.rail}
    />
    <View style={styles.divider} />
    <TouchableOpacity
      style={[styles.stopsButton, showStops && styles.stopsButtonActive]}
      onPress={onToggleStops}
      activeOpacity={0.76}
      accessibilityRole="button"
      accessibilityLabel={showStops ? 'Hide bus stops' : 'Show bus stops'}
      accessibilityState={{ selected: showStops }}
    >
      <StopsIcon color={showStops ? COLORS.white : COLORS.primaryDark} />
      <Text style={[styles.stopsButtonText, showStops && styles.stopsButtonTextActive]}>Stops</Text>
    </TouchableOpacity>
    <View style={styles.divider} />
    <TouchableOpacity
      style={[styles.locationButton, isCenteringOnLocation && styles.locationButtonDisabled]}
      onPress={onCenterOnLocation}
      activeOpacity={0.76}
      disabled={isCenteringOnLocation}
      accessibilityRole="button"
      accessibilityLabel="Center on my location"
      accessibilityState={{ disabled: isCenteringOnLocation, busy: isCenteringOnLocation }}
    >
      {isCenteringOnLocation ? <ActivityIndicator size="small" color={COLORS.primary} /> : <LocateIcon />}
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: HOME_MAP_THEME.sideMargin,
    right: HOME_MAP_THEME.sideMargin,
    minHeight: HOME_MAP_THEME.bottomTrayMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.xs,
    borderRadius: HOME_MAP_THEME.bottomTrayRadius,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.97)',
    zIndex: 1000,
    ...SHADOWS.small,
  },
  rail: { flex: 1, minWidth: 0 },
  divider: { width: 1, height: 30, marginHorizontal: SPACING.xs, backgroundColor: COLORS.borderLight },
  stopsButton: {
    minWidth: 58,
    height: HOME_MAP_THEME.locationButtonSize,
    paddingHorizontal: SPACING.xs,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    backgroundColor: COLORS.primarySubtle,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.22)',
  },
  stopsButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  stopsButtonText: {
    color: COLORS.primaryDark,
    fontSize: 10,
    lineHeight: 11,
    fontWeight: '800',
  },
  stopsButtonTextActive: { color: COLORS.white },
  locationButton: {
    width: HOME_MAP_THEME.locationButtonSize,
    height: HOME_MAP_THEME.locationButtonSize,
    borderRadius: HOME_MAP_THEME.locationButtonSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySubtle,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.22)',
  },
  locationButtonDisabled: { opacity: 0.72 },
});

export default React.memo(MapBottomControlTray);
