import React, { memo } from 'react';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { COLORS } from '../config/theme';
import { darkenColor } from '../utils/geometryUtils';
import { normalizeHexColor, hexToRgba } from '../utils/colorUtils';

let idCounter = 0;

const RoutePolylineComponent = ({
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
  showArrows = false,
}) => {
  const formattedCoordinates = Array.isArray(coordinates)
    ? coordinates
        .filter((coord) =>
          Number.isFinite(coord?.longitude) && Number.isFinite(coord?.latitude)
        )
        .map((coord) => [coord.longitude, coord.latitude])
    : [];

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
        {showArrows && (
          <MapLibreGL.SymbolLayer
            id={`${sourceId}-arrows`}
            style={{
              symbolPlacement: 'line',
              symbolSpacing: 80,
              textField: '▶',
              textSize: 10,
              textColor: normalizedFill,
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textRotationAlignment: 'map',
            }}
            aboveLayerID={`${sourceId}-fill`}
          />
        )}
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
      {showArrows && (
        <MapLibreGL.SymbolLayer
          id={`${sourceId}-arrows`}
          style={{
            symbolPlacement: 'line',
            symbolSpacing: 80,
            textField: '▶',
            textSize: 10,
            textColor: normalizedFill,
            textAllowOverlap: true,
            textIgnorePlacement: true,
            textRotationAlignment: 'map',
          }}
          aboveLayerID={`${sourceId}-fill`}
        />
      )}
    </MapLibreGL.ShapeSource>
  );
};

const areLineDashPatternsEqual = (prevPattern, nextPattern) => {
  if (prevPattern === nextPattern) return true;
  if (!Array.isArray(prevPattern) || !Array.isArray(nextPattern)) return false;
  if (prevPattern.length !== nextPattern.length) return false;
  for (let i = 0; i < prevPattern.length; i += 1) {
    if (prevPattern[i] !== nextPattern[i]) return false;
  }
  return true;
};

const areRoutePolylinePropsEqual = (prev, next) => (
  prev.id === next.id &&
  prev.coordinates === next.coordinates &&
  prev.color === next.color &&
  prev.strokeWidth === next.strokeWidth &&
  prev.lineCap === next.lineCap &&
  prev.lineJoin === next.lineJoin &&
  prev.opacity === next.opacity &&
  prev.outlineWidth === next.outlineWidth &&
  prev.outlineColor === next.outlineColor &&
  prev.showArrows === next.showArrows &&
  areLineDashPatternsEqual(prev.lineDashPattern, next.lineDashPattern)
);

const RoutePolyline = memo(RoutePolylineComponent, areRoutePolylinePropsEqual);

export default RoutePolyline;
