'use strict';

// CommonJS port of the TripUpdates decoder in src/services/arrivalService.js.
// The app bundle is ESM and is not deployed with the proxy, so the server keeps
// its own copy. Keep field handling in sync with the client parser.

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const FUTURE_SKEW_MS = 2 * 60 * 1000;

const TRIP_SCHEDULE_RELATIONSHIPS = {
  0: 'SCHEDULED', 1: 'ADDED', 2: 'UNSCHEDULED', 3: 'CANCELED',
  5: 'REPLACEMENT', 6: 'DUPLICATED', 7: 'DELETED', 8: 'NEW',
};
const STOP_SCHEDULE_RELATIONSHIPS = { 0: 'SCHEDULED', 1: 'SKIPPED', 2: 'NO_DATA', 3: 'UNSCHEDULED' };

function decodeVarintBigInt(buffer, offset) {
  let result = 0n;
  let shift = 0n;
  let bytesRead = 0;
  while (offset + bytesRead < buffer.length) {
    const byte = buffer[offset + bytesRead];
    result |= BigInt(byte & 0x7f) << shift;
    bytesRead++;
    if ((byte & 0x80) === 0) return { value: result, bytesRead };
    shift += 7n;
    if (shift > 70n) throw new Error('Varint too long');
  }
  throw new Error('Unexpected end of buffer while reading varint');
}

const decodeVarint = (buffer, offset) => {
  const { value, bytesRead } = decodeVarintBigInt(buffer, offset);
  return { value: Number(value), bytesRead };
};

const decodeInt32Varint = (buffer, offset) => {
  const { value, bytesRead } = decodeVarintBigInt(buffer, offset);
  return { value: Number(BigInt.asIntN(32, value)), bytesRead };
};

function skipField(buffer, offset, wireType) {
  switch (wireType) {
    case 0:
      while (offset < buffer.length && (buffer[offset] & 0x80) !== 0) offset++;
      return offset + 1;
    case 1: return offset + 8;
    case 2: {
      const { value: length, bytesRead } = decodeVarint(buffer, offset);
      return offset + bytesRead + length;
    }
    case 5: return offset + 4;
    default: return offset + 1;
  }
}

const textDecoder = new TextDecoder();

function readBytes(buffer, offset) {
  const { value: length, bytesRead } = decodeVarint(buffer, offset);
  const start = offset + bytesRead;
  if (length < 0 || start + length > buffer.length) throw new Error('Invalid GTFS-RT field length');
  return { bytes: buffer.subarray(start, start + length), newOffset: start + length };
}

const readString = (buffer, offset) => {
  const { bytes, newOffset } = readBytes(buffer, offset);
  return { value: textDecoder.decode(bytes), newOffset };
};

// Walks every field of a message, handing (fieldNumber, wireType, offset) to
// the visitor. The visitor returns the new offset, or null to skip the field.
function walkMessage(buffer, visit) {
  let offset = 0;
  while (offset < buffer.length) {
    const { value: tag, bytesRead } = decodeVarint(buffer, offset);
    offset += bytesRead;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x7;
    const next = visit(fieldNumber, wireType, offset);
    offset = next == null ? skipField(buffer, offset, wireType) : next;
  }
}

function parseHeader(buffer) {
  const header = { timestamp: null };
  walkMessage(buffer, (field, wire, offset) => {
    if (field === 3 && wire === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      header.timestamp = value;
      return offset + bytesRead;
    }
    return null;
  });
  return header;
}

function parseStopTimeEvent(buffer) {
  const event = { delay: null, time: null };
  walkMessage(buffer, (field, wire, offset) => {
    if (wire !== 0 || (field !== 1 && field !== 2)) return null;
    const { value, bytesRead } = field === 1 ? decodeInt32Varint(buffer, offset) : decodeVarint(buffer, offset);
    if (field === 1) event.delay = value;
    else event.time = value;
    return offset + bytesRead;
  });
  return event;
}

function parseStopTimeUpdate(buffer) {
  const stopTime = { stopSequence: null, stopId: null, arrival: null, departure: null, scheduleRelationship: 'SCHEDULED' };
  walkMessage(buffer, (field, wire, offset) => {
    if (field === 1 && wire === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      stopTime.stopSequence = value;
      return offset + bytesRead;
    }
    if (field === 4 && wire === 2) {
      const { value, newOffset } = readString(buffer, offset);
      stopTime.stopId = value;
      return newOffset;
    }
    if ((field === 2 || field === 3) && wire === 2) {
      const { bytes, newOffset } = readBytes(buffer, offset);
      stopTime[field === 2 ? 'arrival' : 'departure'] = parseStopTimeEvent(bytes);
      return newOffset;
    }
    if (field === 5 && wire === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      stopTime.scheduleRelationship = STOP_SCHEDULE_RELATIONSHIPS[value] || value;
      return offset + bytesRead;
    }
    return null;
  });
  return stopTime;
}

function parseTripDescriptor(buffer, update) {
  const stringFields = { 1: 'tripId', 2: 'startTime', 3: 'startDate', 5: 'routeId' };
  walkMessage(buffer, (field, wire, offset) => {
    if (wire === 2 && stringFields[field]) {
      const { value, newOffset } = readString(buffer, offset);
      update[stringFields[field]] = value;
      return newOffset;
    }
    if (field === 4 && wire === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      update.scheduleRelationship = TRIP_SCHEDULE_RELATIONSHIPS[value] || value;
      return offset + bytesRead;
    }
    if (field === 6 && wire === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      update.directionId = value;
      return offset + bytesRead;
    }
    return null;
  });
}

function parseTripUpdate(buffer) {
  const update = {
    tripId: null,
    routeId: null,
    directionId: null,
    scheduleRelationship: 'SCHEDULED',
    startDate: null,
    startTime: null,
    vehicleId: null,
    timestamp: null,
    stopTimeUpdates: [],
  };
  walkMessage(buffer, (field, wire, offset) => {
    if (wire === 2 && (field === 1 || field === 2 || field === 3)) {
      const { bytes, newOffset } = readBytes(buffer, offset);
      if (field === 1) parseTripDescriptor(bytes, update);
      else if (field === 2) update.stopTimeUpdates.push(parseStopTimeUpdate(bytes));
      else {
        walkMessage(bytes, (vField, vWire, vOffset) => {
          if (vField !== 1 || vWire !== 2) return null;
          const { value, newOffset: next } = readString(bytes, vOffset);
          update.vehicleId = value;
          return next;
        });
      }
      return newOffset;
    }
    if (field === 4 && wire === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      update.timestamp = value;
      return offset + bytesRead;
    }
    return null;
  });
  return update;
}

function parseEntity(buffer) {
  const entity = { id: '', isDeleted: false, tripUpdate: null };
  walkMessage(buffer, (field, wire, offset) => {
    if (field === 1 && wire === 2) {
      const { value, newOffset } = readString(buffer, offset);
      entity.id = value;
      return newOffset;
    }
    if (field === 2 && wire === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      entity.isDeleted = Boolean(value);
      return offset + bytesRead;
    }
    if (field === 3 && wire === 2) {
      const { bytes, newOffset } = readBytes(buffer, offset);
      entity.tripUpdate = parseTripUpdate(bytes);
      return newOffset;
    }
    return null;
  });
  return entity.tripUpdate && !entity.isDeleted ? entity : null;
}

function getFeedStatus(headerTimestamp, nowMs) {
  if (!Number.isFinite(headerTimestamp) || headerTimestamp <= 0) return { status: 'unknown', ageMs: null };
  const ageMs = nowMs - headerTimestamp * 1000;
  if (ageMs < -FUTURE_SKEW_MS) return { status: 'unknown', ageMs };
  return { status: ageMs > STALE_THRESHOLD_MS ? 'stale' : 'fresh', ageMs: Math.max(0, ageMs) };
}

function parseTripUpdates(arrayBuffer, { nowMs = Date.now() } = {}) {
  const view = new Uint8Array(arrayBuffer);
  const updates = [];
  let header = { timestamp: null };
  walkMessage(view, (field, wire, offset) => {
    if (wire !== 2 || (field !== 1 && field !== 2)) return null;
    const { bytes, newOffset } = readBytes(view, offset);
    if (field === 1) header = parseHeader(bytes);
    else {
      const entity = parseEntity(bytes);
      if (entity) updates.push(entity.tripUpdate);
    }
    return newOffset;
  });
  return { updates, headerTimestamp: header.timestamp, ...getFeedStatus(header.timestamp, nowMs), checkedAt: nowMs };
}

module.exports = { parseTripUpdates, STALE_THRESHOLD_MS };
