// GTFS time is elapsed time from local noon minus 12 hours, not from
// local midnight (which has a different UTC offset on DST transition days).
export const getServiceDayStartMs = (serviceDate) => {
  const noon = new Date(serviceDate);
  noon.setHours(12, 0, 0, 0);
  return noon.getTime() - 12 * 3600 * 1000;
};
