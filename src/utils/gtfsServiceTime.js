import { normalizeServiceDate, serviceDateTimeToTimestamp } from './serviceTime';

// GTFS uses elapsed seconds from agency-local noon minus twelve hours.
export const getServiceDayStartMs = (serviceDate) => (
  serviceDateTimeToTimestamp(normalizeServiceDate(serviceDate), 12 * 3600) - 12 * 3600 * 1000
);
