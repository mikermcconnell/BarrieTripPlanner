/**
 * Error message configurations for trip planning
 * Maps error codes to user-friendly messages and display options
 */

export const TRIP_ERROR_MESSAGES = {
  OTP_UNAVAILABLE: {
    title: 'Service Temporarily Unavailable',
    message: 'Trip planning is not responding. Please try again shortly.',
    icon: 'server',
    retryable: true,
  },
  NETWORK_ERROR: {
    title: 'Connection Error',
    message: 'Check your internet connection and try again.',
    icon: 'wifi-off',
    retryable: true,
  },
  NO_ROUTES_FOUND: {
    title: 'No Routes Found',
    message: 'No transit options found for this trip. Try a different time or walking to a nearby stop.',
    icon: 'route',
    retryable: false,
    suggestions: [
      'Try a later departure time',
      'Check service alerts for disruptions',
      'Try a nearby starting point',
      'Consider a shorter trip distance',
    ],
  },
  OUTSIDE_SERVICE_AREA: {
    title: 'Outside Service Area',
    message: 'One or both locations are outside Barrie Transit coverage.',
    icon: 'map-marker-off',
    retryable: false,
    suggestions: [
      'Check that both locations are within Barrie',
      'Try selecting a location closer to a bus route',
    ],
  },
  TIMEOUT: {
    title: 'Request Timed Out',
    message: 'The request took too long. Please try again.',
    icon: 'clock',
    retryable: true,
  },
  VALIDATION_ERROR: {
    title: 'Invalid Trip',
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
