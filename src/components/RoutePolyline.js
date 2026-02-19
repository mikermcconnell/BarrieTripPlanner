import React from 'react';
import MapLibreGL from '@maplibre/maplibre-react-native';
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

let idCounter = 0;

const RoutePolyline = ({
  coordinates,
  color = COLORS.primary,
  strokeWidth = 6,
  lineDashPattern = null,
  lineCap = 'round',
  lineJoin = 'round',
  opacity = 0.85,
  outlineWidth = 2,
  outlineColor = '#000000',
  id,
}) => {
  const formattedCoordinates = coordinates.map((coord) => [
    coord.longitude,
    coord.latitude,
  ]);

  if (formattedCoordinates.length < 2) {
    return null;
  }

  const sourceId = id || `route-polyline-${++idCounter}`;

  const geoJson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: formattedCoordinates,
    },
  };

  const normalizedFill = normalizeHexColor(color);
  const fillColor = hexToRgba(normalizedFill, opacity);

  const dashArray = lineDashPattern
    ? lineDashPattern.map((v) => v / strokeWidth)
    : undefined;

  if (outlineWidth > 0) {
    const resolvedOutlineColor = normalizeHexColor(
      outlineColor || darkenColor(normalizedFill, 0.4),
      darkenColor(normalizedFill, 0.4)
    );
    const outlineFill = hexToRgba(resolvedOutlineColor, opacity);

    return (
      <MapLibreGL.ShapeSource id={`${sourceId}-src`} shape={geoJson}>
        <MapLibreGL.LineLayer
          id={`${sourceId}-outline`}
          style={{
            lineColor: outlineFill,
            lineWidth: strokeWidth + outlineWidth * 2,
            lineCap: lineCap,
            lineJoin: lineJoin,
            ...(dashArray ? { lineDasharray: dashArray } : {}),
          }}
        />
        <MapLibreGL.LineLayer
          id={`${sourceId}-fill`}
          style={{
            lineColor: fillColor,
            lineWidth: strokeWidth,
            lineCap: lineCap,
            lineJoin: lineJoin,
            ...(dashArray ? { lineDasharray: dashArray } : {}),
          }}
          aboveLayerID={`${sourceId}-outline`}
        />
      </MapLibreGL.ShapeSource>
    );
  }

  return (
    <MapLibreGL.ShapeSource id={`${sourceId}-src`} shape={geoJson}>
      <MapLibreGL.LineLayer
        id={`${sourceId}-fill`}
        style={{
          lineColor: fillColor,
          lineWidth: strokeWidth,
          lineCap: lineCap,
          lineJoin: lineJoin,
          ...(dashArray ? { lineDasharray: dashArray } : {}),
        }}
      />
    </MapLibreGL.ShapeSource>
  );
};

export default RoutePolyline;
