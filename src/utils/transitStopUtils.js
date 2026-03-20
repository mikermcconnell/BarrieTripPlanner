import { safeHaversineDistance as calculateDistance } from './geometryUtils';

export const buildTransitStopSequence = (leg) => {
  if (!leg) return [];

  const stops = [];

  if (leg.from) {
    stops.push({
      id: leg.from.stopId || 'boarding',
      name: leg.from.name,
      stopCode: leg.from.stopCode || leg.from.stopId || null,
      lat: leg.from.lat,
      lon: leg.from.lon,
      type: 'boarding',
    });
  }

  if (Array.isArray(leg.intermediateStops)) {
    leg.intermediateStops.forEach((stop, index) => {
      if (stop?.lat == null || stop?.lon == null) return;
      stops.push({
        id: stop.stopId || `intermediate-${index}`,
        name: stop.name,
        stopCode: stop.stopCode || stop.stopId || null,
        lat: stop.lat,
        lon: stop.lon,
        type: 'intermediate',
      });
    });
  }

  if (leg.to) {
    stops.push({
      id: leg.to.stopId || 'alighting',
      name: leg.to.name,
      stopCode: leg.to.stopCode || leg.to.stopId || null,
      lat: leg.to.lat,
      lon: leg.to.lon,
      type: 'alighting',
    });
  }

  return stops;
};

export const findClosestTransitStopIndex = (location, stopSequence) => {
  if (!location || !Array.isArray(stopSequence) || stopSequence.length === 0) return -1;

  const latitude = location.latitude ?? location.lat;
  const longitude = location.longitude ?? location.lon;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return -1;

  let closestStopIndex = -1;
  let minDistance = Infinity;

  stopSequence.forEach((stop, index) => {
    const dist = calculateDistance(latitude, longitude, stop.lat, stop.lon);
    if (dist < minDistance) {
      minDistance = dist;
      closestStopIndex = index;
    }
  });

  return closestStopIndex;
};

export const getRemainingTransitStops = (leg, location = null) => {
  const stopSequence = buildTransitStopSequence(leg);
  if (stopSequence.length <= 1) return [];

  if (!location) {
    return stopSequence.slice(1);
  }

  const lastIndex = stopSequence.length - 1;
  const closestIndex = findClosestTransitStopIndex(location, stopSequence);
  if (closestIndex < 0) {
    return stopSequence.slice(1);
  }

  const startIndex = Math.min(closestIndex + 1, lastIndex);
  return stopSequence.slice(startIndex);
};

export const getTransitStopsRemainingCount = (leg, liveStopsRemaining = null) => {
  if (Number.isFinite(liveStopsRemaining)) {
    return Math.max(0, liveStopsRemaining);
  }

  const stopSequence = buildTransitStopSequence(leg);
  return Math.max(0, stopSequence.length - 1);
};

export const buildTransitStopProgress = (leg, liveStopsRemaining = null) => {
  const stopSequence = buildTransitStopSequence(leg);
  const boardingStop = stopSequence[0] || null;
  const alightingStop = stopSequence[stopSequence.length - 1] || null;
  const intermediateStops = stopSequence.slice(1, -1);
  const stopsAfterBoarding = stopSequence.slice(1);
  const totalStopsAfterBoarding = stopsAfterBoarding.length;
  const totalStopsBetween = intermediateStops.length;
  const remainingCount = getTransitStopsRemainingCount(leg, liveStopsRemaining);
  const passedCount = Math.max(
    0,
    Math.min(totalStopsAfterBoarding, totalStopsAfterBoarding - remainingCount)
  );
  const nextStop = remainingCount > 0
    ? stopsAfterBoarding[passedCount] || alightingStop
    : alightingStop;

  return {
    stopSequence,
    boardingStop,
    alightingStop,
    intermediateStops,
    stopsAfterBoarding,
    totalStopsAfterBoarding,
    totalStopsBetween,
    remainingCount,
    passedCount,
    nextStop,
    stops: stopsAfterBoarding.map((stop, index) => ({
      ...stop,
      sequenceNumber: index + 1,
      isPassed: index < passedCount,
      isNext: remainingCount > 0 && index === passedCount,
      isAlighting: stop.type === 'alighting',
    })),
  };
};
