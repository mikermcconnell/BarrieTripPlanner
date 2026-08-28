const DEFAULT_MIN_SPAN = 0.001;

export const normalizeMapCoordinate = (point) => {
  if (!point) return null;

  const rawLatitude = point.latitude ?? point.lat;
  const rawLongitude = point.longitude ?? point.lon ?? point.lng;
  if (
    rawLatitude === '' ||
    rawLongitude === '' ||
    typeof rawLatitude === 'boolean' ||
    typeof rawLongitude === 'boolean'
  ) {
    return null;
  }
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
};

export const isValidMapCoordinate = (point) => normalizeMapCoordinate(point) !== null;

export const sanitizeMapCoordinates = (coordinates = []) => (
  Array.isArray(coordinates)
    ? coordinates.map(normalizeMapCoordinate).filter(Boolean)
    : []
);

export const sanitizeCoordinateItems = (items = [], coordinateKey = 'coordinate') => (
  Array.isArray(items)
    ? items.flatMap((item) => {
        const coordinate = normalizeMapCoordinate(item?.[coordinateKey]);
        return coordinate ? [{ ...item, [coordinateKey]: coordinate }] : [];
      })
    : []
);

export const computeSafeMapBounds = (
  coordinates,
  { minLatSpan = DEFAULT_MIN_SPAN, minLonSpan = DEFAULT_MIN_SPAN } = {}
) => {
  const safeCoordinates = sanitizeMapCoordinates(coordinates);
  if (safeCoordinates.length === 0) return null;

  let minLat = safeCoordinates[0].latitude;
  let maxLat = safeCoordinates[0].latitude;
  let minLon = safeCoordinates[0].longitude;
  let maxLon = safeCoordinates[0].longitude;

  safeCoordinates.slice(1).forEach(({ latitude, longitude }) => {
    minLat = Math.min(minLat, latitude);
    maxLat = Math.max(maxLat, latitude);
    minLon = Math.min(minLon, longitude);
    maxLon = Math.max(maxLon, longitude);
  });

  if (maxLat - minLat < minLatSpan) {
    const padding = (minLatSpan - (maxLat - minLat)) / 2;
    minLat = Math.max(-90, minLat - padding);
    maxLat = Math.min(90, maxLat + padding);
  }
  if (maxLon - minLon < minLonSpan) {
    const padding = (minLonSpan - (maxLon - minLon)) / 2;
    minLon = Math.max(-180, minLon - padding);
    maxLon = Math.min(180, maxLon + padding);
  }

  return {
    coordinates: safeCoordinates,
    center: safeCoordinates.length === 1 ? safeCoordinates[0] : null,
    ne: [maxLon, maxLat],
    sw: [minLon, minLat],
  };
};
