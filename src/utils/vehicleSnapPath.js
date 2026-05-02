const hasUsableCoordinates = (shape) =>
  Array.isArray(shape?.coordinates) && shape.coordinates.length >= 2;

/**
 * Resolve the best visible route path for smoothing a live vehicle marker.
 *
 * Prefer the exact GTFS trip shape so the bus follows the correct direction
 * when both directions are visible. Fall back to any rendered shape for the
 * same route when the exact trip shape is not currently rendered.
 */
export const resolveVehicleSnapPath = (vehicle, displayedShapes = []) => {
  if (!vehicle || !Array.isArray(displayedShapes) || displayedShapes.length === 0) {
    return null;
  }

  const vehicleShapeId = vehicle.shapeId ? String(vehicle.shapeId) : null;
  const vehicleRouteId = vehicle.routeId ? String(vehicle.routeId) : null;

  if (vehicleShapeId) {
    const exactShape = displayedShapes.find(
      (shape) => String(shape?.shapeId || '') === vehicleShapeId && hasUsableCoordinates(shape)
    );
    if (exactShape) {
      return exactShape.coordinates;
    }
  }

  if (!vehicleRouteId) {
    return null;
  }

  const routeShape = displayedShapes.find(
    (shape) => String(shape?.routeId || '') === vehicleRouteId && hasUsableCoordinates(shape)
  );

  return routeShape?.coordinates || null;
};
