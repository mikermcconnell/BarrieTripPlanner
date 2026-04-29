/**
 * Error message configurations for trip planning
 * Maps error codes to user-friendly messages and display options
 */

export const TRIP_ERROR_MESSAGES = {
  OTP_UNAVAILABLE: {
    title: 'Trip planning is taking a break',
    message: 'We could not reach the trip planner right now. Please try again in a moment.',
    icon: 'server',
    retryable: true,
  },
  NETWORK_ERROR: {
    title: 'You appear to be offline',
    message: 'Check your connection, then try planning your trip again.',
    icon: 'wifi-off',
    retryable: true,
  },
  NO_ROUTES_FOUND: {
    title: 'No transit route found',
    message: 'We could not find a route for this exact trip.',
    icon: 'route',
    retryable: false,
    suggestions: [
      'Try leaving a bit earlier or later',
      'Use a nearby stop or address',
      'Check service alerts before you go',
    ],
  },
  OUTSIDE_SERVICE_AREA: {
    title: 'Outside Service Area',
    message: 'Trip planning works for trips within Barrie and supported on-demand zones.',
    icon: 'map-marker-off',
    retryable: false,
    suggestions: [
      'Choose a start and destination within Barrie or a supported on-demand zone',
      'Try a nearby Barrie stop or address instead',
    ],
  },
  TIMEOUT: {
    title: 'That took too long',
    message: 'The trip planner did not respond in time. Please try again.',
    icon: 'clock',
    retryable: true,
  },
  VALIDATION_ERROR: {
    title: 'Check your trip details',
    message: 'Please check your starting location and destination.',
    icon: 'alert-circle',
    retryable: false,
  },
};

/**
 * Get error display configuration for a given error code
 * @param {string} errorCode - The error code from TripPlanningError
 * @returns {Object} Error display configuration
 */
export const getErrorConfig = (errorCode) => {
  return TRIP_ERROR_MESSAGES[errorCode] || TRIP_ERROR_MESSAGES.NETWORK_ERROR;
};
