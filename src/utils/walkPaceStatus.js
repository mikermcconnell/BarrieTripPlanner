const MINUTE_MS = 60 * 1000;
const PLENTY_BUFFER_MINUTES = 5;
const WARNING_BUFFER_MINUTES = 2;
const ARRIVED_CONFLICT_GRACE_MS = 2 * MINUTE_MS;

const isTransitLeg = (leg) => leg?.mode === 'BUS' || leg?.mode === 'TRANSIT';

const toTimestamp = (value) => {
  if (value == null) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const formatMinutesAway = (milliseconds) => {
  const minutes = Math.max(0, Math.ceil(milliseconds / MINUTE_MS));
  if (minutes <= 0) return 'now';
  if (minutes === 1) return '1 min';
  return `${minutes} min`;
};

const formatDurationMinutes = (seconds) => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? '1 min' : `${minutes} min`;
};

const getRemainingWalkSeconds = ({ currentLeg, distanceToDestination }) => {
  const durationSeconds = Number(currentLeg?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;

  const legDistance = Number(currentLeg?.distance);
  const remainingDistance = distanceToDestination == null ? null : Number(distanceToDestination);

  if (
    Number.isFinite(legDistance) &&
    legDistance > 0 &&
    remainingDistance != null &&
    Number.isFinite(remainingDistance) &&
    remainingDistance >= 0
  ) {
    const progressRatio = Math.min(1, remainingDistance / legDistance);
    return Math.max(0, durationSeconds * progressRatio);
  }

  return durationSeconds;
};

const getBusDeadline = ({ nextTransitLeg, nextTransitProximity, nowMs }) => {
  const liveArrival = toTimestamp(nextTransitProximity?.estimatedArrival);
  if (liveArrival != null && liveArrival > nowMs) {
    return {
      timestamp: liveArrival,
      label: 'arrives',
      realtime: true,
    };
  }

  const scheduledDeparture = toTimestamp(nextTransitLeg?.startTime);
  const delaySeconds = Number(nextTransitLeg?.delaySeconds) || 0;
  const scheduledDeadline = scheduledDeparture == null
    ? null
    : scheduledDeparture + delaySeconds * 1000;
  const matchQuality = nextTransitProximity?.matchQuality;
  const isFallbackVehicleMatch = matchQuality === 'route_nearest' || matchQuality === 'route_single';

  if (
    nextTransitProximity?.hasArrived &&
    isFallbackVehicleMatch &&
    scheduledDeadline != null &&
    scheduledDeadline - nowMs > ARRIVED_CONFLICT_GRACE_MS
  ) {
    return {
      timestamp: scheduledDeadline,
      label: 'departs',
      realtime: Boolean(nextTransitLeg?.isRealtime),
    };
  }

  if (nextTransitProximity?.hasArrived) {
    return {
      timestamp: nowMs,
      label: 'arrives',
      realtime: Boolean(nextTransitProximity?.isTracking),
    };
  }

  if (liveArrival != null) {
    return {
      timestamp: liveArrival,
      label: 'arrives',
      realtime: true,
    };
  }

  if (scheduledDeadline == null) return null;

  return {
    timestamp: scheduledDeadline,
    label: 'departs',
    realtime: Boolean(nextTransitLeg?.isRealtime),
  };
};

const getStatusLevel = (bufferMinutes) => {
  if (bufferMinutes >= PLENTY_BUFFER_MINUTES) {
    return {
      level: 'plenty',
    };
  }

  if (bufferMinutes >= WARNING_BUFFER_MINUTES) {
    return {
      level: 'hurry',
    };
  }

  if (bufferMinutes >= 0) {
    return {
      level: 'behind',
    };
  }

  return {
    level: 'behind',
  };
};

export const buildWalkPaceStatus = ({
  currentLeg,
  distanceToDestination = null,
  nextTransitLeg,
  nextTransitProximity = null,
  nowMs = Date.now(),
}) => {
  if (currentLeg?.mode !== 'WALK' || !isTransitLeg(nextTransitLeg)) {
    return null;
  }

  const deadline = getBusDeadline({ nextTransitLeg, nextTransitProximity, nowMs });
  const remainingWalkSeconds = getRemainingWalkSeconds({ currentLeg, distanceToDestination });

  if (!deadline || remainingWalkSeconds == null) {
    return null;
  }

  const busMsAway = Math.max(0, deadline.timestamp - nowMs);
  const walkMs = remainingWalkSeconds * 1000;
  const bufferMs = deadline.timestamp - nowMs - walkMs;
  const bufferMinutes = Math.floor(bufferMs / MINUTE_MS);
  const status = getStatusLevel(bufferMinutes);
  const walkTimeLabel = `${formatDurationMinutes(remainingWalkSeconds)} walk`;
  const busTimeLabel = deadline.timestamp <= nowMs
    ? 'Bus is here'
    : `Bus ${deadline.label} in ${formatMinutesAway(busMsAway)}`;
  const bufferLabel = bufferMs >= 0
    ? `${Math.max(0, Math.floor(bufferMs / MINUTE_MS))} min buffer`
    : `${Math.ceil(Math.abs(bufferMs) / MINUTE_MS)} min behind`;

  return {
    ...status,
    headline: bufferLabel,
    detail: `${busTimeLabel} · ${walkTimeLabel}`,
    bufferLabel,
    bufferMinutes,
    busTimeLabel,
    walkTimeLabel,
    isRealtime: deadline.realtime,
  };
};

export default buildWalkPaceStatus;
