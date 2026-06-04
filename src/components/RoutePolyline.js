import React, { memo } from 'react';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { COLORS } from '../config/theme';
import { ROUTE_LINE_LABEL_STYLE } from '../config/routeLineLabels';
import { darkenColor } from '../utils/geometryUtils';
import { normalizeHexColor, hexToRgba } from '../utils/colorUtils';

let idCounter = 0;
const POLYLINE_HITBOX = { width: 32, height: 32 };

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
  routeLabel = null,
  layerIndex = null,
  outlineLayerIndex = null,
  fillLayerIndex = null,
  arrowLayerIndex = null,
  labelLayerIndex = null,
  onPress,
  offset = 0,
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

  const topLayerId = showArrows ? `${sourceId}-arrows` : `${sourceId}-fill`;

  const getLegacyLayerIndex = (offset = 0) => (
    Number.isFinite(layerIndex) ? layerIndex + offset : undefined
  );

  const getResolvedLayerIndex = (explicitLayerIndex, legacyOffset = 0) => (
    Number.isFinite(explicitLayerIndex)
      ? explicitLayerIndex
      : getLegacyLayerIndex(legacyOffset)
  );

  const routeLabelLayer = routeLabel ? (
    <MapLibreGL.SymbolLayer
      id={`${sourceId}-label`}
      layerIndex={getResolvedLayerIndex(labelLayerIndex, showArrows ? 3 : 2)}
      style={{
        symbolPlacement: 'line',
        symbolSpacing: ROUTE_LINE_LABEL_STYLE.spacing,
        textField: routeLabel,
        textSize: ROUTE_LINE_LABEL_STYLE.size,
        textColor: ROUTE_LINE_LABEL_STYLE.color,
        textHaloColor: ROUTE_LINE_LABEL_STYLE.haloColor,
        textHaloWidth: ROUTE_LINE_LABEL_STYLE.haloWidth,
        textOpacity: ROUTE_LINE_LABEL_STYLE.opacity,
        textOffset: ROUTE_LINE_LABEL_STYLE.offset,
        textAllowOverlap: false,
        textIgnorePlacement: false,
        textRotationAlignment: 'map',
        textPitchAlignment: 'viewport',
      }}
      aboveLayerID={topLayerId}
    />
  ) : null;

  const getDashArray = (lineWidth) => (
    lineDashPattern
      ? lineDashPattern.map((v) => v / Math.max(lineWidth, 1))
      : undefined
  );
  const fillDashArray = getDashArray(strokeWidth);

  if (outlineWidth > 0) {
    const resolvedOutlineColor = normalizeHexColor(
      outlineColor || darkenColor(normalizedFill, 0.4),
      darkenColor(normalizedFill, 0.4)
    );
    const outlineFill = hexToRgba(resolvedOutlineColor, opacity);
    const outlineStrokeWidth = strokeWidth + outlineWidth * 2;
    const outlineDashArray = getDashArray(outlineStrokeWidth);

    return (
      <MapLibreGL.ShapeSource
        id={`${sourceId}-src`}
        shape={geoJson}
        onPress={onPress}
        hitbox={POLYLINE_HITBOX}
      >
        <MapLibreGL.LineLayer
          id={`${sourceId}-outline`}
          layerIndex={getResolvedLayerIndex(outlineLayerIndex, 0)}
          style={{
            lineColor: outlineFill,
            lineWidth: outlineStrokeWidth,
            lineCap: lineCap,
            lineJoin: lineJoin,
            ...(offset ? { lineOffset: offset } : {}),
            ...(outlineDashArray ? { lineDasharray: outlineDashArray } : {}),
          }}
        />
        <MapLibreGL.LineLayer
          id={`${sourceId}-fill`}
          layerIndex={getResolvedLayerIndex(fillLayerIndex, 1)}
          style={{
            lineColor: fillColor,
            lineWidth: strokeWidth,
            lineCap: lineCap,
            lineJoin: lineJoin,
            ...(offset ? { lineOffset: offset } : {}),
            ...(fillDashArray ? { lineDasharray: fillDashArray } : {}),
          }}
          aboveLayerID={`${sourceId}-outline`}
        />
        {showArrows && (
          <MapLibreGL.SymbolLayer
            id={`${sourceId}-arrows`}
            layerIndex={getResolvedLayerIndex(arrowLayerIndex, 2)}
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
        {routeLabelLayer}
      </MapLibreGL.ShapeSource>
    );
  }

  return (
    <MapLibreGL.ShapeSource
      id={`${sourceId}-src`}
      shape={geoJson}
      onPress={onPress}
      hitbox={POLYLINE_HITBOX}
    >
      <MapLibreGL.LineLayer
        id={`${sourceId}-fill`}
        layerIndex={getResolvedLayerIndex(fillLayerIndex, 0)}
        style={{
          lineColor: fillColor,
          lineWidth: strokeWidth,
          lineCap: lineCap,
          lineJoin: lineJoin,
          ...(offset ? { lineOffset: offset } : {}),
          ...(fillDashArray ? { lineDasharray: fillDashArray } : {}),
        }}
      />
      {showArrows && (
        <MapLibreGL.SymbolLayer
          id={`${sourceId}-arrows`}
          layerIndex={getResolvedLayerIndex(arrowLayerIndex, 1)}
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
      {routeLabelLayer}
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
  prev.routeLabel === next.routeLabel &&
  prev.layerIndex === next.layerIndex &&
  prev.outlineLayerIndex === next.outlineLayerIndex &&
  prev.fillLayerIndex === next.fillLayerIndex &&
  prev.arrowLayerIndex === next.arrowLayerIndex &&
  prev.labelLayerIndex === next.labelLayerIndex &&
  prev.offset === next.offset &&
  prev.onPress === next.onPress &&
  areLineDashPatternsEqual(prev.lineDashPattern, next.lineDashPattern)
);

const RoutePolyline = memo(RoutePolylineComponent, areRoutePolylinePropsEqual);

export default RoutePolyline;
