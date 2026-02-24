import React from 'react';
import { TouchableOpacity } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';

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

  const geoJsonCoords = coordinates.map((c) => [c.longitude, c.latitude]);
  // Close the ring if not already closed
  const first = geoJsonCoords[0];
  const last = geoJsonCoords[geoJsonCoords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    geoJsonCoords.push([...first]);
  }

  const geoJson = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [geoJsonCoords],
    },
  };

  const sourceId = `zone-${id}-src`;
  const fillLayerId = `zone-${id}-fill`;
  const lineLayerId = `zone-${id}-line`;

  const handlePress = () => {
    onPress?.(id);
  };

  return (
    <MapLibreGL.ShapeSource
      id={sourceId}
      shape={geoJson}
      onPress={handlePress}
    >
      <MapLibreGL.FillLayer
        id={fillLayerId}
        style={{
          fillColor: color,
          fillOpacity: fillOpacity,
        }}
      />
      <MapLibreGL.LineLayer
        id={lineLayerId}
        style={{
          lineColor: color,
          lineOpacity: strokeOpacity,
          lineWidth: strokeWidth,
          lineDasharray: [4, 3],
        }}
      />
    </MapLibreGL.ShapeSource>
  );
};

export default ZoneOverlay;
