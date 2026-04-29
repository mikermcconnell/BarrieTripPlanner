import generatedDisplayGeometry from '../../assets/route-display-geometry.json';
import manualDisplayOverrides from '../../assets/route-display-overrides.json';

const toCoordinate = (point) => {
  if (Array.isArray(point)) {
    const [longitude, latitude] = point;
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;
  }

  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
};

const normalizeShapeCoordinates = (value) => {
  const rawCoordinates = Array.isArray(value)
    ? value
    : Array.isArray(value?.coordinates)
      ? value.coordinates
      : [];

  const coordinates = rawCoordinates.map(toCoordinate).filter(Boolean);
  return coordinates.length >= 2 ? coordinates : null;
};

export const getDisplayGeometryMetadata = () => ({
  generated: generatedDisplayGeometry?.generatedAt ?? null,
  provider: generatedDisplayGeometry?.provider ?? null,
  generatedShapeCount: Object.keys(generatedDisplayGeometry?.shapes || {}).length,
  manualOverrideCount: Object.keys(manualDisplayOverrides?.shapes || {}).length,
});

export const getRouteDisplayShapes = (gtfsShapes = {}) => {
  const generatedShapes = generatedDisplayGeometry?.shapes || {};
  const manualShapes = manualDisplayOverrides?.shapes || {};
  const displayShapes = {};

  Object.keys(gtfsShapes || {}).forEach((shapeId) => {
    const manual = normalizeShapeCoordinates(manualShapes[shapeId]);
    const generatedEntry = generatedShapes[shapeId];
    const generated = generatedEntry?.status === 'snapped' || generatedEntry?.status === 'manual'
      ? normalizeShapeCoordinates(generatedEntry)
      : null;
    const fallback = normalizeShapeCoordinates(gtfsShapes[shapeId]);
    const coordinates = manual || generated || fallback;

    if (coordinates) {
      displayShapes[shapeId] = coordinates;
    }
  });

  return displayShapes;
};
