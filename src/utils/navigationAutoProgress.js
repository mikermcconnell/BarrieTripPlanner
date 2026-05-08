const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const AUTO_PROGRESS_MAX_ACCURACY_METERS = 35;
const AUTO_PROGRESS_MODERATE_ACCURACY_METERS = 50;
const DEFAULT_PROGRESS_DELTA_METERS = 12;

const MATCH_QUALITY_SCORES = {
  trip_id: 0.25,
  route_single: 0.18,
  route_progress: 0.14,
  route_nearest: 0.1,
  none: 0,
};

const RELIABLE_REALTIME_MATCHES = new Set(['trip_id', 'route_single']);
const BUS_AT_STOP_THRESHOLD_METERS = 60;
const BUS_DEPARTED_STOP_THRESHOLD_METERS = 85;
const BOARDING_READY_WINDOW_MS = 60 * 1000;

export const getBoardingStopThresholdMeters = (accuracyMeters) =>
  clamp(Math.max(35, Number.isFinite(accuracyMeters) ? accuracyMeters * 1.1 : 45), 35, 70);

export const getUserVehicleThresholdMeters = (accuracyMeters) =>
  clamp(Math.max(50, Number.isFinite(accuracyMeters) ? accuracyMeters * 1.5 : 65), 50, 90);

export const getAlightingStopThresholdMeters = (accuracyMeters) =>
  clamp(Math.max(20, Number.isFinite(accuracyMeters) ? accuracyMeters * 0.8 : 28), 20, 40);

export const getCorridorThresholdMeters = (accuracyMeters) =>
  clamp(Math.max(30, Number.isFinite(accuracyMeters) ? accuracyMeters * 1.15 : 40), 30, 65);

export const shouldTreatBusAsArrivedAtBoarding = ({
  matchQuality = 'none',
  nowMs = Date.now(),
  scheduledDeparture = null,
  stopsAway = null,
  vehicleStopDistance = null,
} = {}) => {
  if (!Number.isFinite(stopsAway) || stopsAway > 0) return false;

  if (Number.isFinite(vehicleStopDistance) && vehicleStopDistance <= BUS_AT_STOP_THRESHOLD_METERS) {
    return true;
  }

  const hasReliableVehicleIdentity = RELIABLE_REALTIME_MATCHES.has(matchQuality);
  const msUntilDeparture = Number.isFinite(scheduledDeparture)
    ? scheduledDeparture - nowMs
    : null;

  return (
    hasReliableVehicleIdentity &&
    Number.isFinite(msUntilDeparture) &&
    msUntilDeparture <= BOARDING_READY_WINDOW_MS
  );
};

const didProgressForward = (currentValue, previousValue, minimumDelta = DEFAULT_PROGRESS_DELTA_METERS) =>
  Number.isFinite(currentValue) &&
  Number.isFinite(previousValue) &&
  currentValue >= previousValue + minimumDelta;

export const evaluateBoardingBusDepartureStatus = ({
  hasArrived = false,
  locationAccuracy = null,
  matchQuality = 'none',
  previousSnapshot = null,
  vehicleCorridorDistance = null,
  vehicleCorridorProgress = null,
  vehicleStopDistance = null,
} = {}) => {
  const reliableMatch = RELIABLE_REALTIME_MATCHES.has(matchQuality);
  const corridorThreshold = getCorridorThresholdMeters(locationAccuracy);
  const busAtStop =
    Number.isFinite(vehicleStopDistance)
      ? vehicleStopDistance <= BUS_AT_STOP_THRESHOLD_METERS
      : hasArrived;
  const vehicleDepartedStop =
    Number.isFinite(previousSnapshot?.vehicleStopDistance) &&
    previousSnapshot.vehicleStopDistance <= BUS_AT_STOP_THRESHOLD_METERS &&
    Number.isFinite(vehicleStopDistance) &&
    vehicleStopDistance >= BUS_DEPARTED_STOP_THRESHOLD_METERS;
  const vehicleProgressingAlongCorridor = didProgressForward(
    vehicleCorridorProgress,
    previousSnapshot?.vehicleCorridorProgress,
    18
  );
  const vehicleMovingAwayFromStop =
    Number.isFinite(previousSnapshot?.vehicleStopDistance) &&
    Number.isFinite(vehicleStopDistance) &&
    vehicleStopDistance >= previousSnapshot.vehicleStopDistance + 25;
  const vehicleOnCorridor =
    !Number.isFinite(vehicleCorridorDistance) || vehicleCorridorDistance <= corridorThreshold;

  if (!reliableMatch) {
    return {
      confidence: 0,
      status: 'none',
      signals: {
        busAtStop,
        reliableMatch,
        vehicleDepartedStop,
        vehicleMovingAwayFromStop,
        vehicleOnCorridor,
        vehicleProgressingAlongCorridor,
      },
    };
  }

  if (busAtStop) {
    return {
      confidence: matchQuality === 'trip_id' ? 0.7 : 0.62,
      status: 'at_stop',
      signals: {
        busAtStop,
        reliableMatch,
        vehicleDepartedStop,
        vehicleMovingAwayFromStop,
        vehicleOnCorridor,
        vehicleProgressingAlongCorridor,
      },
    };
  }

  let confidence = matchQuality === 'trip_id' ? 0.58 : 0.48;
  if (vehicleDepartedStop) confidence += 0.18;
  if (vehicleProgressingAlongCorridor) confidence += 0.12;
  else if (vehicleMovingAwayFromStop) confidence += 0.08;
  if (vehicleOnCorridor) confidence += 0.06;
  if (Number.isFinite(locationAccuracy) && locationAccuracy <= AUTO_PROGRESS_MODERATE_ACCURACY_METERS) {
    confidence += 0.04;
  }

  const likelyDeparted =
    vehicleDepartedStop &&
    vehicleOnCorridor &&
    (vehicleProgressingAlongCorridor || vehicleMovingAwayFromStop) &&
    confidence >= 0.72;

  return {
    confidence: Math.min(1, confidence),
    status: likelyDeparted ? 'likely_departed' : 'none',
    signals: {
      busAtStop,
      reliableMatch,
      vehicleDepartedStop,
      vehicleMovingAwayFromStop,
      vehicleOnCorridor,
      vehicleProgressingAlongCorridor,
    },
  };
};

export const evaluateAutoBoardConfidence = ({
  hasArrived = false,
  locationAccuracy = null,
  matchQuality = 'none',
  previousSnapshot = null,
  userCorridorDistance = null,
  userCorridorProgress = null,
  userSpeed = null,
  userStopDistance = null,
  userVehicleDistance = null,
  vehicleCorridorDistance = null,
  vehicleCorridorProgress = null,
  vehicleStopDistance = null,
} = {}) => {
  const userStopThreshold = getBoardingStopThresholdMeters(locationAccuracy);
  const userVehicleThreshold = getUserVehicleThresholdMeters(locationAccuracy);
  const corridorThreshold = getCorridorThresholdMeters(locationAccuracy);
  const highAccuracy = Number.isFinite(locationAccuracy) && locationAccuracy <= AUTO_PROGRESS_MAX_ACCURACY_METERS;
  const moderateAccuracy =
    Number.isFinite(locationAccuracy) && locationAccuracy <= AUTO_PROGRESS_MODERATE_ACCURACY_METERS;
  const userAtStop = Number.isFinite(userStopDistance) && userStopDistance <= userStopThreshold;
  const busAtStop = Number.isFinite(vehicleStopDistance) && vehicleStopDistance <= 60;
  const closeToVehicle =
    Number.isFinite(userVehicleDistance) && userVehicleDistance <= userVehicleThreshold;
  const userOnCorridor =
    Number.isFinite(userCorridorDistance) && userCorridorDistance <= corridorThreshold;
  const vehicleOnCorridor =
    Number.isFinite(vehicleCorridorDistance) && vehicleCorridorDistance <= corridorThreshold;
  const movingFastEnough = Number.isFinite(userSpeed) && userSpeed >= 2.2;
  const vehicleDepartedStop =
    Number.isFinite(previousSnapshot?.vehicleStopDistance) &&
    previousSnapshot.vehicleStopDistance <= 60 &&
    Number.isFinite(vehicleStopDistance) &&
    vehicleStopDistance >= 85;
  const userLeavingStop =
    Number.isFinite(previousSnapshot?.userStopDistance) &&
    previousSnapshot.userStopDistance <= userStopThreshold &&
    Number.isFinite(userStopDistance) &&
    userStopDistance >= userStopThreshold + 20;
  const userProgressingAlongCorridor = didProgressForward(
    userCorridorProgress,
    previousSnapshot?.userCorridorProgress
  );
  const vehicleProgressingAlongCorridor = didProgressForward(
    vehicleCorridorProgress,
    previousSnapshot?.vehicleCorridorProgress,
    18
  );

  let confidence = 0;
  if (highAccuracy) confidence += 0.25;
  else if (moderateAccuracy) confidence += 0.12;

  confidence += MATCH_QUALITY_SCORES[matchQuality] || 0;
  if (userAtStop) confidence += 0.18;
  if (hasArrived || busAtStop) confidence += 0.12;
  if (closeToVehicle) confidence += 0.15;
  if (userOnCorridor) confidence += 0.1;
  if (vehicleOnCorridor) confidence += 0.08;
  if (movingFastEnough) confidence += 0.08;
  if (vehicleDepartedStop) confidence += 0.07;
  if (userLeavingStop) confidence += 0.05;
  if (userProgressingAlongCorridor) confidence += 0.08;
  if (vehicleProgressingAlongCorridor) confidence += 0.06;

  const eligible =
    highAccuracy &&
    closeToVehicle &&
    userOnCorridor &&
    vehicleOnCorridor &&
    matchQuality !== 'none' &&
    (hasArrived || busAtStop || vehicleDepartedStop) &&
    (vehicleDepartedStop || vehicleProgressingAlongCorridor) &&
    (userProgressingAlongCorridor || (movingFastEnough && userLeavingStop)) &&
    confidence >= 0.72;

  return {
    confidence: Math.min(1, confidence),
    eligible,
    signals: {
      busAtStop,
      closeToVehicle,
      highAccuracy,
      moderateAccuracy,
      movingFastEnough,
      userAtStop,
      userOnCorridor,
      userProgressingAlongCorridor,
      userLeavingStop,
      vehicleOnCorridor,
      vehicleProgressingAlongCorridor,
      vehicleDepartedStop,
    },
    thresholds: {
      corridorThreshold,
      userStopThreshold,
      userVehicleThreshold,
    },
  };
};

export const evaluateAutoAlightConfidence = ({
  distanceToAlighting = null,
  locationAccuracy = null,
  nearAlightingStop = false,
  previousSnapshot = null,
  stopsUntilAlighting = null,
  userCorridorDistance = null,
  userCorridorProgress = null,
  userSpeed = null,
} = {}) => {
  const alightingThreshold = getAlightingStopThresholdMeters(locationAccuracy);
  const corridorThreshold = getCorridorThresholdMeters(locationAccuracy);
  const highAccuracy = Number.isFinite(locationAccuracy) && locationAccuracy <= AUTO_PROGRESS_MAX_ACCURACY_METERS;
  const moderateAccuracy =
    Number.isFinite(locationAccuracy) && locationAccuracy <= AUTO_PROGRESS_MODERATE_ACCURACY_METERS;
  const atStop = Number.isFinite(distanceToAlighting) && distanceToAlighting <= alightingThreshold;
  const nearStop =
    Number.isFinite(distanceToAlighting) && distanceToAlighting <= alightingThreshold + 25;
  const onCorridor =
    Number.isFinite(userCorridorDistance) && userCorridorDistance <= corridorThreshold;
  const stopCountReady = Number.isFinite(stopsUntilAlighting) && stopsUntilAlighting <= 0;
  const slowingForStop = Number.isFinite(userSpeed) && userSpeed <= 4.5;
  const distanceFlattened =
    Number.isFinite(previousSnapshot?.distanceToAlighting) &&
    Number.isFinite(distanceToAlighting) &&
    distanceToAlighting >= previousSnapshot.distanceToAlighting - 5;
  const recentlyOnCorridor =
    Number.isFinite(previousSnapshot?.userCorridorDistance) &&
    previousSnapshot.userCorridorDistance <= corridorThreshold;
  const leavingCorridorNearStop =
    recentlyOnCorridor &&
    !onCorridor &&
    nearStop;
  const progressFlattened =
    Number.isFinite(previousSnapshot?.userCorridorProgress) &&
    Number.isFinite(userCorridorProgress) &&
    userCorridorProgress <= previousSnapshot.userCorridorProgress + 12;

  let confidence = 0;
  if (highAccuracy) confidence += 0.3;
  else if (moderateAccuracy) confidence += 0.15;

  if (stopCountReady) confidence += 0.25;
  if (atStop) confidence += 0.2;
  else if (nearStop) confidence += 0.1;
  if (nearAlightingStop) confidence += 0.1;
  if (onCorridor) confidence += 0.08;
  if (leavingCorridorNearStop) confidence += 0.12;
  if (slowingForStop) confidence += 0.1;
  if (distanceFlattened) confidence += 0.05;
  if (progressFlattened) confidence += 0.05;

  const eligible =
    highAccuracy &&
    stopCountReady &&
    confidence >= 0.72 &&
    (
      atStop ||
      (nearStop && (onCorridor || leavingCorridorNearStop) && slowingForStop && distanceFlattened)
    );

  return {
    confidence: Math.min(1, confidence),
    eligible,
    signals: {
      atStop,
      distanceFlattened,
      highAccuracy,
      moderateAccuracy,
      nearStop,
      onCorridor,
      leavingCorridorNearStop,
      progressFlattened,
      slowingForStop,
      stopCountReady,
    },
    thresholds: {
      alightingThreshold,
      corridorThreshold,
    },
  };
};
