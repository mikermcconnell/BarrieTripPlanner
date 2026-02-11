import React from 'react';
import { Polyline } from 'react-native-maps';
import { COLORS } from '../config/theme';
import { darkenColor } from '../utils/geometryUtils';

const normalizeHexColor = (color, fallback = COLORS.primary) => {
  if (typeof color !== 'string' || color.trim().length === 0) return fallback;
  const raw = color.trim();
  if (raw.startsWith('#')) return raw;
  return `#${raw}`;
};

const hexToRgba = (hexColor, opacity = 1) => {
  const normalized = normalizeHexColor(hexColor);
  const hex = normalized.replace('#', '');

  if (hex.length !== 6) {
    return normalized;
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, opacity));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

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

  const normalizedFill = normalizeHexColor(color);
  const fillColor = hexToRgba(normalizedFill, opacity);

  if (outlineWidth > 0) {
    const resolvedOutlineColor = normalizeHexColor(
      outlineColor || darkenColor(normalizedFill, 0.4),
      darkenColor(normalizedFill, 0.4)
    );
    const outlineFill = hexToRgba(resolvedOutlineColor, opacity);

    return (
      <>
        <Polyline
          coordinates={formattedCoordinates}
          strokeColor={outlineFill}
          strokeWidth={strokeWidth + outlineWidth * 2}
          lineDashPattern={lineDashPattern}
          lineCap={lineCap}
          lineJoin={lineJoin}
          zIndex={1}
        />
        <Polyline
          coordinates={formattedCoordinates}
          strokeColor={fillColor}
          strokeWidth={strokeWidth}
          lineDashPattern={lineDashPattern}
          lineCap={lineCap}
          lineJoin={lineJoin}
          zIndex={2}
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
      zIndex={2}
    />
  );
};

export default RoutePolyline;
