import React from 'react';
import { WebPolygon } from './WebMapView';

const ZoneOverlay = ({
  id,
  coordinates,
  color,
  fillOpacity = 0.15,
  strokeOpacity = 0.6,
  strokeWidth = 2,
  onPress,
}) => {
  if (!coordinates || coordinates.length < 3) return null;

  return (
    <WebPolygon
      coordinates={coordinates}
      color={color}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
      fillOpacity={fillOpacity}
      dashArray="8, 6"
      onPress={() => onPress?.(id)}
    />
  );
};

export default ZoneOverlay;
