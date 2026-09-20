// Keep departure and arrival predictions distinct; missing departure data is not
// evidence of an on-time departure. Prefer a known delayed arrival on the card.
export const getItineraryDelayBadgeProps = (itinerary) => {
  const rides = (itinerary?.legs || []).filter((leg) => leg?.tripId && String(leg.mode).toUpperCase() !== 'WALK');
  const first = rides[0];
  const last = rides[rides.length - 1];
  if (last?.arrivalRealtime && (!first?.boardingRealtime || last.arrivalDelaySeconds !== 0)) {
    return { isRealtime: true, delaySeconds: last.arrivalDelaySeconds, label: 'Arrival' };
  }
  if (first?.boardingRealtime) {
    return { isRealtime: true, delaySeconds: first.delaySeconds, label: 'Departure' };
  }
  // Legacy itineraries have no endpoint availability. Do not assert on-time status.
  return { isRealtime: false, delaySeconds: 0, label: null };
};
