import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-polylinedecorator';

/**
 * Renders directional arrow markers along a Leaflet polyline.
 * Uses leaflet-polylinedecorator to place evenly spaced arrow heads.
 *
 * @param {{ coordinates: Array<[number, number]>, color: string }} props
 *   coordinates — array of [lat, lng] pairs
 *   color — hex color for arrows
 */
export default function DirectionArrows({ coordinates, color = '#4CAF50' }) {
  const map = useMap();
  const decoratorRef = useRef(null);

  useEffect(() => {
    if (!map || !coordinates || coordinates.length < 2) return;

    const polyline = L.polyline(coordinates, { opacity: 0 });

    const decorator = L.polylineDecorator(polyline, {
      patterns: [
        {
          offset: 30,
          repeat: 150,
          symbol: L.Symbol.arrowHead({
            pixelSize: 10,
            polygon: false,
            pathOptions: {
              stroke: true,
              color,
              weight: 2.5,
              opacity: 0.7,
            },
          }),
        },
      ],
    });

    decorator.addTo(map);
    decoratorRef.current = decorator;

    return () => {
      if (decoratorRef.current) {
        map.removeLayer(decoratorRef.current);
        decoratorRef.current = null;
      }
    };
  }, [map, coordinates, color]);

  return null;
}
