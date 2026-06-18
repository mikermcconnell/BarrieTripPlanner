'use strict';

const TRIP_SCHEDULE_RELATIONSHIPS_BY_VALUE = new Map([
  [0, 'SCHEDULED'],
  [1, 'ADDED'],
  [2, 'UNSCHEDULED'],
  [3, 'CANCELED'],
  [5, 'REPLACEMENT'],
  [6, 'DUPLICATED'],
  [7, 'DELETED'],
  [8, 'NEW'],
]);

const NON_PASSENGER_SCHEDULE_RELATIONSHIPS = new Set([
  'CANCELED',
  'CANCELLED',
  'DELETED',
]);

const DEFAULT_VEHICLE_ONLY_MIN_POINTS = 2;
const DEFAULT_VEHICLE_ONLY_MIN_PROGRESS_SPAN_METERS = 75;

function cleanString(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return text;
}

function normalizeScheduleRelationship(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && TRIP_SCHEDULE_RELATIONSHIPS_BY_VALUE.has(numeric)) {
    return TRIP_SCHEDULE_RELATIONSHIPS_BY_VALUE.get(numeric);
  }
  const normalized = String(value).trim().toUpperCase().replace(/[\s-]+/g, '_');
  return normalized || null;
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
  }
  return false;
}

function isFalseyFlag(value) {
  if (value === false || value === 0) return true;
  if (typeof value === 'string') {
    return ['false', '0', 'no', 'n'].includes(value.trim().toLowerCase());
  }
  return false;
}

function getTripScheduleRelationship(source = {}) {
  return normalizeScheduleRelationship(
    source.tripScheduleRelationship ??
    source.scheduleRelationship ??
    source.tripRelationship ??
    source.schedule_relationship
  );
}

function isNonPassengerVehicleEvidence(source = {}) {
  if (
    isTruthyFlag(source.deadhead) ||
    isTruthyFlag(source.isDeadhead) ||
    isTruthyFlag(source.nonRevenue) ||
    isTruthyFlag(source.nonRevenueService)
  ) {
    return true;
  }

  if (
    isFalseyFlag(source.revenue) ||
    isFalseyFlag(source.revenueService) ||
    isFalseyFlag(source.passengerService) ||
    isFalseyFlag(source.inPassengerService)
  ) {
    return true;
  }

  const relationship = getTripScheduleRelationship(source);
  return NON_PASSENGER_SCHEDULE_RELATIONSHIPS.has(relationship);
}

function makeDescriptorSignature(source = {}) {
  const routeId = cleanString(source.routeId);
  const directionId = cleanString(source.directionId);
  const startDate = cleanString(source.startDate);
  const startTime = cleanString(source.startTime);
  const relationship = getTripScheduleRelationship(source);

  if (
    routeId &&
    directionId &&
    startDate &&
    startTime &&
    relationship === 'SCHEDULED'
  ) {
    return `${routeId}:${directionId}:${startDate}:${startTime}`;
  }

  return '';
}

function makeEvidenceIdentity(source = {}, { prefixed = true } = {}) {
  if (isNonPassengerVehicleEvidence(source)) {
    return {
      signature: '',
      source: 'non-passenger',
      canConfirm: false,
    };
  }

  const tripId = cleanString(source.tripId);
  if (tripId) {
    return {
      signature: prefixed ? `trip:${tripId}` : tripId,
      source: 'trip',
      canConfirm: true,
    };
  }

  const descriptor = makeDescriptorSignature(source);
  if (descriptor) {
    return {
      signature: prefixed ? `descriptor:${descriptor}` : descriptor,
      source: 'descriptor',
      canConfirm: true,
    };
  }

  const vehicleId = cleanString(source.vehicleId || source.id);
  if (vehicleId) {
    return {
      signature: prefixed ? `vehicle:${vehicleId}` : vehicleId,
      source: 'vehicle',
      canConfirm: false,
    };
  }

  return {
    signature: '',
    source: 'unknown',
    canConfirm: false,
  };
}

function inferIdentitySourceFromSignature(signature) {
  const value = cleanString(signature);
  if (value.startsWith('trip:')) return 'trip';
  if (value.startsWith('descriptor:')) return 'descriptor';
  if (value.startsWith('vehicle:')) return 'vehicle';
  return null;
}

function countConfirmingEvidenceGroups(items = [], {
  getSignature = (item) => item?.signature,
  getIdentitySource = (item) => item?.identitySource,
  getProgressMin = (item) => item?.progressMeters ?? item?.progressMinMeters,
  getProgressMax = (item) => item?.progressMeters ?? item?.progressMaxMeters,
  getPointCount = () => 1,
  minVehicleOnlyPoints = DEFAULT_VEHICLE_ONLY_MIN_POINTS,
  minVehicleOnlyProgressSpanMeters = DEFAULT_VEHICLE_ONLY_MIN_PROGRESS_SPAN_METERS,
} = {}) {
  const groups = new Map();

  for (const item of items || []) {
    const signature = cleanString(getSignature(item));
    if (!signature || signature === 'unknown') continue;

    const explicitSource = cleanString(getIdentitySource(item));
    const source = (explicitSource && explicitSource !== 'unknown' ? explicitSource : null) ||
      inferIdentitySourceFromSignature(signature) ||
      'unknown';
    if (source === 'non-passenger') continue;

    const group = groups.get(signature) || {
      source,
      pointCount: 0,
      minProgress: Infinity,
      maxProgress: -Infinity,
    };
    if (source === 'trip' || source === 'descriptor') group.source = source;
    else if (group.source === 'unknown') group.source = source;

    const pointCount = Number(getPointCount(item));
    group.pointCount += Number.isFinite(pointCount) && pointCount > 0 ? pointCount : 1;

    const progressMin = Number(getProgressMin(item));
    const progressMax = Number(getProgressMax(item));
    if (Number.isFinite(progressMin)) group.minProgress = Math.min(group.minProgress, progressMin);
    if (Number.isFinite(progressMax)) group.maxProgress = Math.max(group.maxProgress, progressMax);

    groups.set(signature, group);
  }

  let count = 0;
  for (const group of groups.values()) {
    if (group.source === 'trip' || group.source === 'descriptor') {
      count += 1;
      continue;
    }

    const spanMeters = group.maxProgress - group.minProgress;
    if (
      group.source === 'vehicle' &&
      group.pointCount >= minVehicleOnlyPoints &&
      Number.isFinite(spanMeters) &&
      spanMeters >= minVehicleOnlyProgressSpanMeters
    ) {
      count += 1;
    }
  }

  return count;
}

module.exports = {
  countConfirmingEvidenceGroups,
  getTripScheduleRelationship,
  isNonPassengerVehicleEvidence,
  makeEvidenceIdentity,
  normalizeScheduleRelationship,
};
