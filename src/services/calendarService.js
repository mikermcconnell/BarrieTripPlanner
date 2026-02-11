/**
 * Calendar Service
 *
 * Handles GTFS service calendar logic to determine which services
 * are active on any given date. Supports:
 * - Regular weekly service patterns (calendar.txt)
 * - Service exceptions for holidays etc. (calendar_dates.txt)
 */

/**
 * Parse a GTFS date string (YYYYMMDD) into a Date object
 * @param {string} dateStr - Date in YYYYMMDD format
 * @returns {Date} JavaScript Date object
 */
const parseGTFSDate = (dateStr) => {
  if (!dateStr || dateStr.length !== 8) return null;
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1; // JS months are 0-indexed
  const day = parseInt(dateStr.substring(6, 8), 10);
  return new Date(year, month, day);
};

/**
 * Format a Date object to GTFS date string (YYYYMMDD)
 * @param {Date} date - JavaScript Date object
 * @returns {string} Date in YYYYMMDD format
 */
export const formatGTFSDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/**
 * Get the day of week as a lowercase string
 * @param {Date} date - JavaScript Date object
 * @returns {string} Day name (e.g., 'monday', 'tuesday')
 */
const getDayOfWeek = (date) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
};

/**
 * Check if a date is within a service's date range
 * @param {Date} date - Date to check
 * @param {Object} calendar - Calendar entry with startDate and endDate
 * @returns {boolean} True if date is within range
 */
const isDateInRange = (date, calendar) => {
  const start = parseGTFSDate(calendar.startDate);
  const end = parseGTFSDate(calendar.endDate);
  if (!start || !end) return false;
  return date >= start && date <= end;
};

/**
 * Build a lookup map of active services by date
 * Pre-computes which services run on which dates for fast lookup
 *
 * @param {Array} calendar - Array of calendar entries
 * @param {Array} calendarDates - Array of calendar_dates exceptions
 * @param {number} daysAhead - Number of days to pre-compute (default 30)
 * @returns {Object} Map of date strings to Set of active service_ids
 */
export const buildServiceCalendar = (calendar, calendarDates, daysAhead = 30) => {
  const serviceCalendar = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Pre-index calendar_dates by date for faster lookup
  const exceptions = {};
  calendarDates.forEach((cd) => {
    if (!exceptions[cd.date]) {
      exceptions[cd.date] = [];
    }
    exceptions[cd.date].push(cd);
  });

  // Build service sets for each day
  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = formatGTFSDate(date);
    const dayOfWeek = getDayOfWeek(date);

    const activeServices = new Set();

    // Check regular calendar entries
    calendar.forEach((cal) => {
      if (isDateInRange(date, cal) && cal[dayOfWeek]) {
        activeServices.add(cal.serviceId);
      }
    });

    // Apply exceptions for this date
    const dayExceptions = exceptions[dateStr] || [];
    dayExceptions.forEach((ex) => {
      if (ex.exceptionType === 1) {
        // Service added
        activeServices.add(ex.serviceId);
      } else if (ex.exceptionType === 2) {
        // Service removed
        activeServices.delete(ex.serviceId);
      }
    });

    serviceCalendar[dateStr] = activeServices;
  }

  return serviceCalendar;
};

/**
 * Get active services for a specific date
 *
 * @param {Object} serviceCalendar - Pre-built service calendar map
 * @param {Date} date - Date to check
 * @returns {Set} Set of active service_ids
 */
export const getActiveServicesForDate = (serviceCalendar, date) => {
  const dateStr = formatGTFSDate(date);
  return serviceCalendar[dateStr] || new Set();
};

/**
 * Check if a specific service is active on a date
 *
 * @param {Object} serviceCalendar - Pre-built service calendar map
 * @param {string} serviceId - Service ID to check
 * @param {Date} date - Date to check
 * @returns {boolean} True if service is active
 */
export const isServiceActive = (serviceCalendar, serviceId, date) => {
  const activeServices = getActiveServicesForDate(serviceCalendar, date);
  return activeServices.has(serviceId);
};

/**
 * Get all service IDs that are active today
 * Convenience function for common use case
 *
 * @param {Object} serviceCalendar - Pre-built service calendar map
 * @returns {Set} Set of active service_ids for today
 */
export const getTodayServices = (serviceCalendar) => {
  return getActiveServicesForDate(serviceCalendar, new Date());
};

/**
 * Find the next date when any service is active
 * Useful when requested date has no service
 *
 * @param {Object} serviceCalendar - Pre-built service calendar map
 * @param {Date} fromDate - Starting date
 * @param {number} maxDays - Maximum days to search (default 7)
 * @returns {Date|null} Next date with service, or null if none found
 */
export const findNextServiceDate = (serviceCalendar, fromDate, maxDays = 7) => {
  // Clone the date to avoid mutating the input
  const date = new Date(fromDate.getTime());

  for (let i = 0; i < maxDays; i++) {
    const services = getActiveServicesForDate(serviceCalendar, date);
    if (services.size > 0) {
      return new Date(date.getTime()); // Return a clone
    }
    date.setDate(date.getDate() + 1);
  }

  return null;
};

/**
 * Get service start time (first trip) for a date
 * Useful for suggesting when service starts if requested time is too early
 *
 * @param {Array} trips - Array of trip objects
 * @param {Array} stopTimes - Array of stopTime objects
 * @param {Set} activeServices - Set of active service IDs
 * @returns {number|null} Earliest departure time in seconds since midnight
 */
export const getServiceStartTime = (trips, stopTimes, activeServices) => {
  // Filter trips to only active services
  const activeTrips = new Set(
    trips
      .filter((trip) => activeServices.has(trip.serviceId))
      .map((trip) => trip.tripId)
  );

  // Find earliest departure
  let earliest = null;
  for (const st of stopTimes) {
    if (activeTrips.has(st.tripId) && st.departureTime != null) {
      if (earliest === null || st.departureTime < earliest) {
        earliest = st.departureTime;
      }
    }
  }

  return earliest;
};

/**
 * Get service end time (last trip) for a date
 *
 * @param {Array} trips - Array of trip objects
 * @param {Array} stopTimes - Array of stopTime objects
 * @param {Set} activeServices - Set of active service IDs
 * @returns {number|null} Latest arrival time in seconds since midnight
 */
export const getServiceEndTime = (trips, stopTimes, activeServices) => {
  // Filter trips to only active services
  const activeTrips = new Set(
    trips
      .filter((trip) => activeServices.has(trip.serviceId))
      .map((trip) => trip.tripId)
  );

  // Find latest arrival
  let latest = null;
  for (const st of stopTimes) {
    if (activeTrips.has(st.tripId) && st.arrivalTime != null) {
      if (latest === null || st.arrivalTime > latest) {
        latest = st.arrivalTime;
      }
    }
  }

  return latest;
};

/**
 * Convert seconds since midnight to human-readable time string
 * @param {number} seconds - Seconds since midnight
 * @returns {string} Time in HH:MM format
 */
export const formatSecondsToTime = (seconds) => {
  if (seconds == null) return '--:--';
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};
