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
  NO_NEARBY_STOPS: {
    title: 'No nearby bus stops',
    message: 'This location is in the service area, but it is far from the nearest bus stop.',
    icon: 'map-marker-off',
    retryable: false,
    suggestions: [
      'Try using a nearby stop or major intersection',
      'Choose a start or destination closer to a bus route',
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
  NO_DATA: {
    title: 'Transit data is not ready',
    message: 'We could not load the transit schedule needed to plan this trip.',
    icon: 'database-off',
    retryable: true,
    suggestions: [
      'Try again in a moment',
      'Check your connection if this keeps happening',
    ],
  },
  NO_SERVICE: {
    title: 'No service at that time',
    message: 'Barrie Transit does not have scheduled service for this trip at the selected time.',
    icon: 'clock-alert',
    retryable: false,
    suggestions: [
      'Try a different departure or arrival time',
      'Check the route schedule before you go',
    ],
  },
  ZONE_NO_SERVICE: {
    title: 'On-demand service is unavailable',
    message: 'This on-demand zone is not available for the selected time.',
    icon: 'map-clock',
    retryable: false,
    suggestions: [
      'Try a different time',
      'Use a nearby fixed-route stop if one is available',
    ],
  },
  ZONE_NO_HUB_STOPS: {
    title: 'No on-demand transfer stop found',
    message: 'We could not find a transfer stop for this on-demand zone.',
    icon: 'map-marker-question',
    retryable: false,
    suggestions: [
      'Try a nearby address or stop',
      'Try planning the trip again later',
    ],
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
