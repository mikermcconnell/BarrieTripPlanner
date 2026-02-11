import React from 'react';
import { Polyline } from 'react-native-maps';
import { COLORS } from '../config/theme';
import { darkenColor } from '../utils/geometryUtils';

const RoutePolyline = ({
  coordinates,
  color = COLORS.primary,
  strokeWidth = 3,
  lineDashPattern = null,
  lineCap = 'round',
  lineJoin = 'round',
  opacity = 0.85,
  outlineWidth = 0,
  outlineColor,
}) => {
  const formattedCoordinates = coordinates.map((coord) => ({
    latitude: coord.latitude,
    longitude: coord.longitude,
  }));

  if (formattedCoordinates.length < 2) {
    return null;
  }

  // Apply opacity via ARGB hex prefix (Android compatibility)
  const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
  const fillColor = color.startsWith('#') ? `#${alphaHex}${color.slice(1)}` : color;

  if (outlineWidth > 0) {
    const resolvedOutlineColor = outlineColor || darkenColor(color, 0.4);
    const outlineAlpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
    const outlineFill = resolvedOutlineColor.startsWith('#')
      ? `#${outlineAlpha}${resolvedOutlineColor.slice(1)}`
      : resolvedOutlineColor;

    return (
      <>
        <Polyline
          coordinates={formattedCoordinates}
          strokeColor={outlineFill}
          strokeWidth={strokeWidth + outlineWidth * 2}
          lineDashPattern={lineDashPattern}
          lineCap={lineCap}
          lineJoin={lineJoin}
        />
        <Polyline
          coordinates={formattedCoordinates}
          strokeColor={fillColor}
          strokeWidth={strokeWidth}
          lineDashPattern={lineDashPattern}
          lineCap={lineCap}
          lineJoin={lineJoin}
        />
      </>
    );
  }

  return (
    <Polyline
      coordinates={formattedCoordinates}
      strokeColor={fillColor}
      strokeWidth={strokeWidth}
      lineDashPattern={lineDashPattern}
      lineCap={lineCap}
      lineJoin={lineJoin}
    />
  );
};

export default RoutePolyline;
