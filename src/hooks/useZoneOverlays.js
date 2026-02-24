import { useMemo } from 'react';

const ENABLED = process.env.EXPO_PUBLIC_ENABLE_TOD_ZONES !== 'false';

/**
 * Pure derivation function (exported for testing without React).
 */
export function deriveZoneOverlays({ onDemandZones, showZones, enabled }) {
  if (!enabled) return [];
  if (!showZones) return [];
  if (!onDemandZones || Object.keys(onDemandZones).length === 0) return [];

  const overlays = [];

  Object.values(onDemandZones).forEach((zone) => {
    if (!zone.geometry?.coordinates) return;

    const rings = zone.geometry.coordinates;
    if (!Array.isArray(rings) || rings.length === 0) return;

    // GeoJSON polygon: first element is the outer ring
    // Each ring is an array of [lng, lat] pairs
    const outerRing = rings[0];
    if (!Array.isArray(outerRing) || outerRing.length < 3) return;

    const coordinates = outerRing.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }));

    overlays.push({
      id: zone.id,
      name: zone.name,
      coordinates,
      color: zone.color || '#4CAF50',
      fillOpacity: 0.15,
      strokeOpacity: 0.6,
      strokeWidth: 2,
      zone,
    });
  });

  return overlays;
}

export const useZoneOverlays = ({ onDemandZones, showZones, enabled = ENABLED }) => {
  const zoneOverlays = useMemo(
    () => deriveZoneOverlays({ onDemandZones, showZones, enabled }),
    [enabled, onDemandZones, showZones]
  );

  return { zoneOverlays };
};
