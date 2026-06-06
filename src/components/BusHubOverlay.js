import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { BUS_HUBS, BUS_HUB_TYPES, getBusHubDisplayLabel } from '../config/busHubs';
import { COLORS, FONT_WEIGHTS, SHADOWS } from '../config/theme';

const HUB_MAJOR_ICON_WRAP_SIZE = 21;
const HUB_MINOR_ICON_WRAP_SIZE = HUB_MAJOR_ICON_WRAP_SIZE * 0.75;
const HUB_MAJOR_FRAME_HEIGHT = 112;
const HUB_MINOR_FRAME_HEIGHT = 98;

const getHubMarkerAnchor = (type) => {
  const isMajor = type === BUS_HUB_TYPES.MAJOR;
  const iconSize = isMajor ? HUB_MAJOR_ICON_WRAP_SIZE : HUB_MINOR_ICON_WRAP_SIZE;
  const frameHeight = isMajor ? HUB_MAJOR_FRAME_HEIGHT : HUB_MINOR_FRAME_HEIGHT;
  return { x: 0.5, y: (iconSize / 2) / frameHeight };
};

const getHubLabel = (hub, currentZoom) => {
  return getBusHubDisplayLabel(hub, currentZoom) || null;
};

const BusHubIcon = ({ type }) => {
  const isMajor = type === BUS_HUB_TYPES.MAJOR;

  return (
    <View
      testID="bus-hub-icon-wrap"
      accessible
      accessibilityLabel={isMajor ? 'Major bus hub' : 'Minor bus hub'}
      style={[styles.iconWrap, isMajor ? styles.iconWrapMajor : styles.iconWrapMinor]}
    />
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
          anchor={getHubMarkerAnchor(hub.type)}
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
    justifyContent: 'flex-start',
    overflow: 'visible',
    zIndex: 65,
    elevation: 65,
  },
  markerFrameMajor: {
    width: 220,
    height: HUB_MAJOR_FRAME_HEIGHT,
  },
  markerFrameMinor: {
    width: 170,
    height: HUB_MINOR_FRAME_HEIGHT,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  iconWrapMajor: {
    width: HUB_MAJOR_ICON_WRAP_SIZE,
    height: HUB_MAJOR_ICON_WRAP_SIZE,
    borderRadius: HUB_MAJOR_ICON_WRAP_SIZE / 2,
    backgroundColor: COLORS.primary,
    borderColor: COLORS.white,
    borderWidth: 2,
  },
  iconWrapMinor: {
    width: HUB_MINOR_ICON_WRAP_SIZE,
    height: HUB_MINOR_ICON_WRAP_SIZE,
    borderRadius: HUB_MINOR_ICON_WRAP_SIZE / 2,
    backgroundColor: COLORS.primary,
    borderColor: COLORS.white,
    borderWidth: 2,
  },
  labelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.24)',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    maxWidth: 210,
    ...SHADOWS.small,
  },
  labelPillMajor: {
    position: 'absolute',
    top: 22,
    alignSelf: 'center',
    borderColor: 'rgba(0, 78, 128, 0.28)',
  },
  labelPillMinor: {
    position: 'absolute',
    top: 17,
    alignSelf: 'center',
    maxWidth: 160,
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
