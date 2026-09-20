import { formatGTFSDate } from '../services/calendarService';

export const finiteNumber = (value) => (
  value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
);

export const isFreshTripUpdate = (update, nowMs = Date.now(), freshnessSeconds = 300) => {
  const timestamp = finiteNumber(update?.timestamp ?? update?.feedTimestamp);
  if (timestamp == null || timestamp <= 0) return false;
  const age = nowMs - timestamp * 1000;
  return age >= -60000 && age <= freshnessSeconds * 1000;
};

// Trip IDs repeat across service days. Never attach today's vehicle/update to
// tomorrow's booking, or to yesterday's after-midnight service instance.
export const matchesTripInstance = (leg, update, nowMs = Date.now()) => {
  const scheduledStart = finiteNumber(leg?.scheduledStartTime ?? leg?.startTime);
  if (scheduledStart == null) return false;
  const serviceDate = leg.serviceDate || formatGTFSDate(new Date(scheduledStart));
  if (update?.startDate) return String(update.startDate) === String(serviceDate);

  // Undated feeds can only support a nearby, unambiguous current-day trip.
  return serviceDate === formatGTFSDate(new Date(nowMs)) &&
    Math.abs(scheduledStart - nowMs) <= 6 * 3600 * 1000;
};
