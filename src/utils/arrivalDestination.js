/** Destination-only fallback. Never substitute a trip ID or scheduled arrival time. */
export const createArrivalDestinationPatterns = (trips, stopTimes) => {
  const timesByTrip = new Map();
  stopTimes.forEach((stop) => {
    if (!timesByTrip.has(stop.tripId)) timesByTrip.set(stop.tripId, []);
    timesByTrip.get(stop.tripId).push(stop);
  });
  const byRoute = Object.create(null);
  const seen = new Set();
  trips.forEach((trip) => {
    if (!trip.routeId) return;
    const times = (timesByTrip.get(trip.tripId) || []).slice()
      .sort((a, b) => a.stopSequence - b.stopSequence);
    if (!times.length || times.some((stop, i) => !stop.stopId ||
      !Number.isFinite(stop.stopSequence) ||
      (i > 0 && stop.stopSequence <= times[i - 1].stopSequence))) return;
    const pattern = { headsign: String(trip.headsign || '').trim(), stopIds: times.map(s => s.stopId) };
    // Retain every variant, including blank destinations; canonical patterns lose ambiguity.
    const key = JSON.stringify([trip.routeId, pattern]);
    if (seen.has(key)) return;
    seen.add(key);
    if (!byRoute[trip.routeId]) byRoute[trip.routeId] = [];
    byRoute[trip.routeId].push(pattern);
  });
  return byRoute;
};

export const resolveArrivalDestination = (update, stopIndex, patternsByRoute = {}) => {
  if (!update.routeId || ![undefined, null, 'SCHEDULED'].includes(update.scheduleRelationship)) return '';
  const remaining = update.stopTimeUpdates.slice(stopIndex);
  // Require useful ordered evidence. Do not infer from one stop, a route name, or a branch prefix.
  if (remaining.length < 3 || remaining.some((stop, i) => !stop.stopId ||
    !Number.isFinite(stop.stopSequence) ||
    (i > 0 && stop.stopSequence <= remaining[i - 1].stopSequence) ||
    ![undefined, null, 'SCHEDULED', 'SKIPPED'].includes(stop.scheduleRelationship))) return '';
  const ids = remaining.map(stop => stop.stopId);
  if (new Set(ids).size < 3) return '';
  const patterns = patternsByRoute?.[update.routeId];
  if (!Array.isArray(patterns)) return '';
  let destination = '';
  let found = false;
  for (const pattern of patterns) {
    for (let start = 0; start <= pattern.stopIds.length - ids.length; start += 1) {
      if (!ids.every((id, i) => id === pattern.stopIds[start + i])) continue;
      // A compatible longer trip means the feed may be truncated: fail closed.
      if (start + ids.length !== pattern.stopIds.length || !pattern.headsign) return '';
      if (found && destination !== pattern.headsign) return '';
      destination = pattern.headsign;
      found = true;
    }
  }
  return found ? destination : '';
};
