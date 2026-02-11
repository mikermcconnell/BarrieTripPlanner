/**
 * DetourPolyline - Web component (Leaflet)
 * Renders an orange dashed polyline to indicate a suspected detour route
 */

import React from 'react';
import { Polyline } from 'react-leaflet';
import { COLORS } from '../config/theme';

const DetourPolyline = ({
  coordinates,
  color = COLORS.warning, // Orange (#FF991F)
  strokeWidth = 4,
}) => {
  // Ensure coordinates are in the correct format for Leaflet [lat, lng]
  const positions = coordinates.map((coord) => [coord.latitude, coord.longitude]);

  if (positions.length < 2) {
    return null;
  }

  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: color,
        weight: strokeWidth,
        dashArray: '15, 10', // Dashed pattern
        lineCap: 'round',
        lineJoin: 'round',
        opacity: 0.9,
      }}
    />
  );
};

export default DetourPolyline;
