import React, { memo, useMemo } from 'react';
import { WebBusHubLayer } from './WebMapView';
import { buildBusHubFeatureCollection } from '../config/busHubs';

const BusHubOverlay = ({ currentZoom }) => {
  const featureCollection = useMemo(
    () => buildBusHubFeatureCollection(currentZoom),
    [currentZoom]
  );

  if (!featureCollection.features.length) {
    return null;
  }

  return (
    <WebBusHubLayer
      featureCollection={featureCollection}
      layerOrder={{
        aboveRegularStops: true,
        belowPriorityMarkers: true,
      }}
    />
  );
};

export default memo(BusHubOverlay);
