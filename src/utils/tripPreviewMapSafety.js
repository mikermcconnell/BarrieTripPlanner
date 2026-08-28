import {
  normalizeMapCoordinate,
  sanitizeCoordinateItems,
  sanitizeMapCoordinates,
} from './mapCoordinates';

export const isTripMapPreviewFeatureEnabled = (platform, configuredValue) => (
  platform !== 'android' || configuredValue === 'true'
);

const sanitizeLines = (lines = []) => lines.flatMap((line) => {
  const coordinates = sanitizeMapCoordinates(line?.coordinates);
  if (coordinates.length < 2) return [];

  const labelCoordinate = normalizeMapCoordinate(line?.labelCoordinate);
  return [{
    ...line,
    coordinates,
    labelCoordinate,
  }];
});

export const sanitizeTripPreviewVisualization = ({
  tripRouteCoordinates = [],
  tripEndpointMarkers = [],
  busApproachLines = [],
  intermediateStopMarkers = [],
  tripMarkers = [],
  boardingAlightingMarkers = [],
  transferMarkers = [],
  tripVehicles = [],
} = {}) => ({
  tripRouteCoordinates: sanitizeLines(tripRouteCoordinates),
  tripEndpointMarkers: sanitizeCoordinateItems(tripEndpointMarkers),
  busApproachLines: sanitizeLines(busApproachLines),
  intermediateStopMarkers: sanitizeCoordinateItems(intermediateStopMarkers),
  tripMarkers: sanitizeCoordinateItems(tripMarkers),
  boardingAlightingMarkers: sanitizeCoordinateItems(boardingAlightingMarkers),
  transferMarkers: sanitizeCoordinateItems(transferMarkers),
  tripVehicles: sanitizeCoordinateItems(tripVehicles),
});

export default sanitizeTripPreviewVisualization;
