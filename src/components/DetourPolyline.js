/**
 * DetourPolyline - Native (iOS/Android) component
 * Renders an orange dashed polyline to indicate a suspected detour route
 */

import React from 'react';
import { Polyline } from 'react-native-maps';
import { COLORS } from '../config/theme';

const DetourPolyline = ({
  coordinates,
  color = COLORS.warning, // Orange (#FF991F)
  strokeWidth = 4,
}) => {
  // Ensure coordinates are in the correct format
  const formattedCoordinates = coordinates.map((coord) => ({
    latitude: coord.latitude,
    longitude: coord.longitude,
  }));

  if (formattedCoordinates.length < 2) {
    return null;
  }

  return (
    <Polyline
      coordinates={formattedCoordinates}
      strokeColor={color}
      strokeWidth={strokeWidth}
      lineDashPattern={[15, 10]} // Dashed pattern
      lineCap="round"
      lineJoin="round"
    />
  );
};

export default DetourPolyline;
