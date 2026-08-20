import { GTFS_URLS } from '../config/constants';
import { decodeVarint, decodeInt32Varint, skipField, decodeString } from '../utils/protobufDecoder';
import { fetchWithCORS } from '../utils/fetchWithCORS';
import { haversineDistance as calculateDistance } from '../utils/geometryUtils';

/**
 * Parse GTFS-RT TripUpdates feed
 */
const TRIP_SCHEDULE_RELATIONSHIPS = {
  0: 'SCHEDULED',
  1: 'ADDED',
  2: 'UNSCHEDULED',
  3: 'CANCELED',
  5: 'REPLACEMENT',
  6: 'DUPLICATED',
  7: 'DELETED',
  8: 'NEW',
};

const STOP_SCHEDULE_RELATIONSHIPS = {
  0: 'SCHEDULED',
  1: 'SKIPPED',
  2: 'NO_DATA',
  3: 'UNSCHEDULED',
};

export const parseTripUpdates = (buffer) => {
  const updates = [];
  let offset = 0;
  const view = new Uint8Array(buffer);

  while (offset < view.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(view, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 2 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(view, offset);
      offset += lenBytes;
      const entityData = view.slice(offset, offset + length);
      const update = parseEntity(entityData);
      if (update) updates.push(update);
      offset += length;
    } else {
      offset = skipField(view, offset, wireType);
    }
  }

  return updates;
};

/**
 * Parse a FeedEntity for trip updates
 */
const parseEntity = (buffer) => {
  let offset = 0;
  const entity = { id: '', tripUpdate: null };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      const { value, newOffset } = decodeString(buffer, offset);
      entity.id = value;
      offset = newOffset;
    } else if (fieldNumber === 3 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      entity.tripUpdate = parseTripUpdate(buffer.slice(offset, offset + length));
      offset += length;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return entity.tripUpdate ? entity : null;
};

/**
 * Parse TripUpdate message
 */
const parseTripUpdate = (buffer) => {
  let offset = 0;
  const update = {
    tripId: null,
    routeId: null,
    scheduleRelationship: 'SCHEDULED',
    stopTimeUpdates: [],
  };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const trip = parseTripDescriptor(buffer.slice(offset, offset + length));
      update.tripId = trip.tripId;
      update.routeId = trip.routeId;
      update.scheduleRelationship = trip.scheduleRelationship;
      offset += length;
    } else if (fieldNumber === 2 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const stopTime = parseStopTimeUpdate(buffer.slice(offset, offset + length));
      if (stopTime) update.stopTimeUpdates.push(stopTime);
      offset += length;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return update;
};

/**
 * Parse TripDescriptor
 */
const parseTripDescriptor = (buffer) => {
  let offset = 0;
  const trip = { tripId: null, routeId: null, scheduleRelationship: 'SCHEDULED' };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      const { value, newOffset } = decodeString(buffer, offset);
      trip.tripId = value;
      offset = newOffset;
    } else if (fieldNumber === 4 && wireType === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      trip.scheduleRelationship = TRIP_SCHEDULE_RELATIONSHIPS[value] || value;
      offset += bytesRead;
    } else if (fieldNumber === 5 && wireType === 2) {
      const { value, newOffset } = decodeString(buffer, offset);
      trip.routeId = value;
      offset = newOffset;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return trip;
};

/**
 * Parse StopTimeUpdate
 */
const parseStopTimeUpdate = (buffer) => {
  let offset = 0;
  const stopTime = {
    stopSequence: null,
    stopId: null,
    arrival: null,
    departure: null,
    scheduleRelationship: 'SCHEDULED',
  };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      stopTime.stopSequence = value;
      offset += bytesRead;
    } else if (fieldNumber === 4 && wireType === 2) {
      const { value, newOffset } = decodeString(buffer, offset);
      stopTime.stopId = value;
      offset = newOffset;
    } else if (fieldNumber === 2 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      stopTime.arrival = parseStopTimeEvent(buffer.slice(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 3 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      stopTime.departure = parseStopTimeEvent(buffer.slice(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 5 && wireType === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      stopTime.scheduleRelationship = STOP_SCHEDULE_RELATIONSHIPS[value] || value;
      offset += bytesRead;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return stopTime;
};

/**
 * Parse StopTimeEvent (arrival/departure time)
 */
const parseStopTimeEvent = (buffer) => {
  let offset = 0;
  const event = { delay: null, time: null };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 0) {
      const { value, bytesRead } = decodeInt32Varint(buffer, offset);
      event.delay = value;
      offset += bytesRead;
    } else if (fieldNumber === 2 && wireType === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      event.time = value;
      offset += bytesRead;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return event;
};

/**
 * Fetch trip updates from GTFS-RT feed
 */
export const fetchTripUpdates = async () => {
  try {
    // Use fetchWithCORS to handle web browser CORS restrictions
    const response = await fetchWithCORS(GTFS_URLS.TRIP_UPDATES);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const buffer = await response.arrayBuffer();
    return parseTripUpdates(buffer);
  } catch (error) {
    console.error('Error fetching trip updates:', error);
    throw error;
  }
};

/**
 * Get arrivals for a specific stop
 */
export const getArrivalsForStop = (tripUpdates, stopId, routes, tripMapping) => {
  const arrivals = [];
  const now = Math.floor(Date.now() / 1000);

  tripUpdates.forEach((entity) => {
    const update = entity.tripUpdate;
    if (!update) return;
    if (['CANCELED', 'DELETED'].includes(update.scheduleRelationship)) return;

    update.stopTimeUpdates.forEach((stopTime) => {
      if (stopTime.stopId !== stopId) return;
      if (stopTime.scheduleRelationship === 'SKIPPED') return;

      const arrivalTime = stopTime.arrival?.time || stopTime.departure?.time;
      if (!arrivalTime || arrivalTime < now) return;

      const hasTripMapping = Object.prototype.hasOwnProperty.call(tripMapping, update.tripId);
      const tripInfo = tripMapping[update.tripId] || {};
      const route = routes.find((r) => r.id === (update.routeId || tripInfo.routeId));
      const headsign = String(tripInfo.headsign || '').trim();

      arrivals.push({
        tripId: update.tripId,
        routeId: update.routeId || tripInfo.routeId,
        routeShortName: route?.shortName || update.routeId || '?',
        routeColor: route?.color,
        headsign,
        destinationStatus: headsign
          ? 'available'
          : hasTripMapping
            ? 'headsign-missing'
            : 'trip-unmatched',
        stopId: stopTime.stopId,
        stopSequence: stopTime.stopSequence,
        arrivalTime,
        departureTime: stopTime.departure?.time,
        delay: stopTime.arrival?.delay ?? stopTime.departure?.delay ?? 0,
        minutesAway: Math.max(0, Math.round((arrivalTime - now) / 60)),
        isRealtime: true,
      });
    });
  });

  // Sort by arrival time
  arrivals.sort((a, b) => a.arrivalTime - b.arrivalTime);

  return arrivals;
};


/**
 * Get nearby stops sorted by distance
 */
export const getNearbyStops = (stops, userLat, userLon, maxDistance = 500, limit = 10) => {
  const stopsWithDistance = stops
    .map((stop) => ({
      ...stop,
      distance: calculateDistance(userLat, userLon, stop.latitude, stop.longitude),
    }))
    .filter((stop) => stop.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  return stopsWithDistance;
};
