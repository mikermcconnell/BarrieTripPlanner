const hasUsableCoordinates = (shape) =>
  Array.isArray(shape?.coordinates) && shape.coordinates.length >= 2;

/**
 * Resolve the best visible route path for smoothing a live vehicle marker.
 *
 * Prefer the exact GTFS trip shape so the bus follows the correct direction
 * when both directions are visible. Fall back to any rendered shape for the
 * same route when the exact trip shape is not currently rendered.
 */
const resolveTripInfo = (tripMapping, tripId) => {
  if (!tripMapping || !tripId) return null;
  if (typeof tripMapping.get === 'function') {
    return tripMapping.get(tripId) || null;
  }
  return tripMapping[tripId] || null;
};

export const buildVehicleSnapShapeCandidates = ({
  routeShapeMapping = {},
  processedShapes = {},
  shapes = {},
} = {}) => {
  const hasProcessedShapes =
    processedShapes && Object.keys(processedShapes).length > 0;
  const shapeSource = hasProcessedShapes ? processedShapes : shapes;
  const candidates = [];

  Object.entries(routeShapeMapping || {}).forEach(([routeId, shapeIds]) => {
    (shapeIds || []).forEach((shapeId) => {
      const coordinates = shapeSource?.[shapeId] || shapes?.[shapeId];
      if (!Array.isArray(coordinates) || coordinates.length < 2) return;

      candidates.push({
        id: `${routeId}:${shapeId}`,
        routeId,
        shapeId,
        coordinates,
      });
    });
  });

  return candidates;
};

export const resolveVehicleSnapPath = (
  vehicle,
  displayedShapes = [],
  tripMapping = null,
  supplementalShapes = []
) => {
  const renderedShapeCandidates = Array.isArray(displayedShapes) ? displayedShapes : [];
  const supplementalShapeCandidates = Array.isArray(supplementalShapes) ? supplementalShapes : [];
  const exactShapeCandidates = [...renderedShapeCandidates, ...supplementalShapeCandidates];

  if (!vehicle || exactShapeCandidates.length === 0) {
    return null;
  }

  const tripInfo = resolveTripInfo(tripMapping, vehicle.tripId);
  const resolvedShapeId = vehicle.shapeId || tripInfo?.shapeId;
  const resolvedRouteId = vehicle.routeId || tripInfo?.routeId;
  const vehicleShapeId = resolvedShapeId ? String(resolvedShapeId) : null;
  const vehicleRouteId = resolvedRouteId ? String(resolvedRouteId) : null;

  if (vehicleShapeId) {
    const exactShape = exactShapeCandidates.find(
      (shape) => String(shape?.shapeId || '') === vehicleShapeId && hasUsableCoordinates(shape)
    );
    if (exactShape) {
      return exactShape.coordinates;
    }
  }

  if (!vehicleRouteId) {
    return null;
  }

  const routeShape =
    renderedShapeCandidates.find(
      (shape) => String(shape?.routeId || '') === vehicleRouteId && hasUsableCoordinates(shape)
    ) ||
    supplementalShapeCandidates.find(
      (shape) => String(shape?.routeId || '') === vehicleRouteId && hasUsableCoordinates(shape)
    );

  return routeShape?.coordinates || null;
};
