import React from 'react';
import { Polygon } from 'react-leaflet';

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

  const positions = coordinates.map((c) => [c.latitude, c.longitude]);

  return (
    <Polygon
      positions={positions}
      pathOptions={{
        color: color,
        weight: strokeWidth,
        opacity: strokeOpacity,
        fillColor: color,
        fillOpacity: fillOpacity,
        dashArray: '8, 6',
      }}
      eventHandlers={{
        click: () => onPress?.(id),
      }}
    />
  );
};

export default ZoneOverlay;
