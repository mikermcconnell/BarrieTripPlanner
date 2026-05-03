import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';

const normalizeBearing = (bearing) => {
  const numericBearing = Number(bearing);
  return Number.isFinite(numericBearing)
    ? ((numericBearing % 360) + 360) % 360
    : null;
};

const BusDirectionArrow = ({
  bearing,
  size = 44,
  topOffset = 3,
  arrowWidth = 7,
  arrowHeight = 16,
  color = '#111111',
  outlineColor = 'rgba(255,255,255,0.95)',
  dimmed = false,
  style,
}) => {
  const normalizedBearing = normalizeBearing(bearing);

  if (normalizedBearing === null) {
    return null;
  }

  const outlineWidth = arrowWidth + 2;
  const outlineHeight = arrowHeight + 3;
  const centerX = size / 2;
  const rimConnectorWidth = Math.max(arrowWidth + 1, 8);
  const rimConnectorHeight = Math.max(Math.round(arrowHeight * 0.32), 4);
  const rimConnectorTop = topOffset + outlineHeight - Math.ceil(rimConnectorHeight / 2);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.layer,
        {
          width: size,
          height: size,
          opacity: dimmed ? 0.5 : 1,
          transform: [{ rotate: `${normalizedBearing}deg` }],
        },
        style,
      ]}
    >
      <View
        style={[
          styles.triangle,
          {
            top: topOffset,
            left: centerX - outlineWidth,
            borderLeftWidth: outlineWidth,
            borderRightWidth: outlineWidth,
            borderBottomWidth: outlineHeight,
            borderBottomColor: outlineColor,
          },
        ]}
      />
      <View
        style={[
          styles.rimConnector,
          {
            top: rimConnectorTop,
            left: centerX - rimConnectorWidth / 2,
            width: rimConnectorWidth,
            height: rimConnectorHeight,
            borderRadius: rimConnectorHeight / 2,
            backgroundColor: outlineColor,
          },
        ]}
      />
      <View
        style={[
          styles.triangle,
          {
            top: topOffset + 3,
            left: centerX - arrowWidth,
            borderLeftWidth: arrowWidth,
            borderRightWidth: arrowWidth,
            borderBottomWidth: arrowHeight,
            borderBottomColor: color,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'visible',
    zIndex: 3,
    elevation: 7,
  },
  triangle: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  rimConnector: {
    position: 'absolute',
  },
});

export default memo(BusDirectionArrow);
