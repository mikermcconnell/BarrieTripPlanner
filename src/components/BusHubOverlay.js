import React, { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { BUS_HUBS, BUS_HUB_TYPES, getBusHubDisplayLabel } from '../config/busHubs';
import { COLORS, FONT_WEIGHTS, SHADOWS } from '../config/theme';

const BUS_HUB_ICON_SOURCE = require('../../assets/icons/bus-hub.png');
const HUB_ICON_SCALE = 0.5;

const getHubLabel = (hub, currentZoom) => {
  return getBusHubDisplayLabel(hub, currentZoom) || null;
};

const BusHubIcon = ({ type }) => {
  const isMajor = type === BUS_HUB_TYPES.MAJOR;
  const size = (isMajor ? 54 : 46) * HUB_ICON_SCALE;

  return (
    <View
      testID="bus-hub-icon-wrap"
      style={[styles.iconWrap, isMajor ? styles.iconWrapMajor : styles.iconWrapMinor]}
    >
      <Image
        source={BUS_HUB_ICON_SOURCE}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="Bus hub"
      />
    </View>
  );
};

const BusHubOverlay = ({ currentZoom }) => (
  <>
    {BUS_HUBS.map((hub) => {
      const label = getHubLabel(hub, currentZoom);

      return (
        <MapLibreGL.MarkerView
          key={hub.id}
          id={`bus-hub-${hub.id}`}
          coordinate={[hub.coordinate.longitude, hub.coordinate.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
          pointerEvents="none"
        >
          <View
            testID="bus-hub-marker-frame"
            collapsable={false}
            pointerEvents="none"
            style={[
              styles.markerFrame,
              hub.type === BUS_HUB_TYPES.MAJOR ? styles.markerFrameMajor : styles.markerFrameMinor,
            ]}
          >
            <BusHubIcon type={hub.type} />
            {label ? (
              <View
                testID="bus-hub-label-pill"
                style={[
                  styles.labelPill,
                  hub.type === BUS_HUB_TYPES.MAJOR ? styles.labelPillMajor : styles.labelPillMinor,
                ]}
              >
                <Text
                  style={[
                    styles.labelText,
                    hub.type === BUS_HUB_TYPES.MAJOR ? styles.labelTextMajor : styles.labelTextMinor,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
            ) : null}
          </View>
        </MapLibreGL.MarkerView>
      );
    })}
  </>
);

const styles = StyleSheet.create({
  markerFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 65,
    elevation: 65,
  },
  markerFrameMajor: {
    width: 190,
    minHeight: 74,
  },
  markerFrameMinor: {
    width: 150,
    minHeight: 66,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  iconWrapMajor: {
    width: 28,
    height: 28,
  },
  iconWrapMinor: {
    width: 24,
    height: 24,
  },
  labelPill: {
    marginTop: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.24)',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    maxWidth: 184,
    ...SHADOWS.small,
  },
  labelPillMajor: {
    borderColor: 'rgba(0, 78, 128, 0.28)',
  },
  labelPillMinor: {
    maxWidth: 142,
    borderColor: 'rgba(52, 69, 99, 0.22)',
  },
  labelText: {
    color: COLORS.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  labelTextMajor: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: FONT_WEIGHTS.extrabold,
  },
  labelTextMinor: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default memo(BusHubOverlay);
