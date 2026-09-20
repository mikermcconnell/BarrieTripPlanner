const toCoordinateNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
};

export const normalizeMapCoordinate = (coordinate) => {
  if (!coordinate || typeof coordinate !== 'object') {
    return null;
  }

  const latitude = toCoordinateNumber(coordinate.latitude ?? coordinate.lat);
  const longitude = toCoordinateNumber(coordinate.longitude ?? coordinate.lon);

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
};

export const isValidMapCoordinate = (coordinate) => (
  normalizeMapCoordinate(coordinate) !== null
);

export const sanitizeMapCoordinates = (coordinates = []) => (
  Array.isArray(coordinates)
    ? coordinates.map(normalizeMapCoordinate).filter(Boolean)
    : []
);
