import React from 'react';
import { WebRouteArrows } from './WebMapView';

/**
 * Renders directional arrow markers along a MapLibre polyline.
 *
 * @param {{ coordinates: Array<[number, number]>, color: string }} props
 *   coordinates — array of [lat, lng] pairs
 *   color — hex color for arrows
 */
export default function DirectionArrows({ coordinates, color = '#4CAF50' }) {
  return <WebRouteArrows coordinates={coordinates} color={color} />;
}
