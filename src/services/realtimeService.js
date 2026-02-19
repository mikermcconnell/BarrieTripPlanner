import { GTFS_URLS } from '../config/constants';
import { decodeVarint, skipField, decodeFloat } from '../utils/protobufDecoder';
import { fetchWithCORS } from '../utils/fetchWithCORS';

// GTFS-RT protobuf message types
// Based on gtfs-realtime.proto specification

/**
 * Simple protobuf decoder for GTFS-RT FeedMessage
 * This is a lightweight decoder specifically for GTFS-RT vehicle positions
 */
const decodeGTFSRT = (buffer) => {
  const entities = [];
  let offset = 0;
  const view = new Uint8Array(buffer);

  while (offset < view.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(view, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 2 && wireType === 2) {
      // entity field (length-delimited)
      const { value: length, bytesRead: lenBytes } = decodeVarint(view, offset);
      offset += lenBytes;
      const entityData = view.slice(offset, offset + length);
      const entity = decodeEntity(entityData);
      if (entity) entities.push(entity);
      offset += length;
    } else {
      // Skip other fields
      offset = skipField(view, offset, wireType);
    }
  }

  return entities;
};

/**
 * Decode a single FeedEntity
 */
const decodeEntity = (buffer) => {
  let offset = 0;
  const entity = { id: '', vehicle: null };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      // id field
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      entity.id = new TextDecoder().decode(buffer.slice(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 4 && wireType === 2) {
      // vehicle field
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      entity.vehicle = decodeVehiclePosition(buffer.slice(offset, offset + length));
      offset += length;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return entity.vehicle ? entity : null;
};

/**
 * Decode VehiclePosition message
 */
const decodeVehiclePosition = (buffer) => {
  let offset = 0;
  const vehicle = {
    tripId: null,
    routeId: null,
    vehicleId: null,
    vehicleLabel: null,
    latitude: null,
    longitude: null,
    bearing: null,
    speed: null,
    timestamp: null,
    currentStopSequence: null,
    stopId: null,
    currentStatus: null,
  };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      // trip descriptor
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const trip = decodeTripDescriptor(buffer.slice(offset, offset + length));
      vehicle.tripId = trip.tripId;
      vehicle.routeId = trip.routeId;
      offset += length;
    } else if (fieldNumber === 8 && wireType === 2) {
      // vehicle descriptor
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const veh = decodeVehicleDescriptor(buffer.slice(offset, offset + length));
      vehicle.vehicleId = veh.id;
      vehicle.vehicleLabel = veh.label;
      offset += length;
    } else if (fieldNumber === 2 && wireType === 2) {
      // position
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const pos = decodePosition(buffer.slice(offset, offset + length));
      vehicle.latitude = pos.latitude;
      vehicle.longitude = pos.longitude;
      vehicle.bearing = pos.bearing;
      vehicle.speed = pos.speed;
      offset += length;
    } else if (fieldNumber === 3 && wireType === 0) {
      // current_stop_sequence
      const { value, bytesRead } = decodeVarint(buffer, offset);
      vehicle.currentStopSequence = value;
      offset += bytesRead;
    } else if (fieldNumber === 7 && wireType === 2) {
      // stop_id
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      vehicle.stopId = new TextDecoder().decode(buffer.slice(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 4 && wireType === 0) {
      // current_status
      const { value, bytesRead } = decodeVarint(buffer, offset);
      vehicle.currentStatus = value;
      offset += bytesRead;
    } else if (fieldNumber === 5 && wireType === 0) {
      // timestamp
      const { value, bytesRead } = decodeVarint(buffer, offset);
      vehicle.timestamp = value;
      offset += bytesRead;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return vehicle;
};

/**
 * Decode TripDescriptor message
 */
const decodeTripDescriptor = (buffer) => {
  let offset = 0;
  const trip = { tripId: null, routeId: null };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      // trip_id
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      trip.tripId = new TextDecoder().decode(buffer.slice(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 5 && wireType === 2) {
      // route_id
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      trip.routeId = new TextDecoder().decode(buffer.slice(offset, offset + length));
      offset += length;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return trip;
};

/**
 * Decode VehicleDescriptor message
 */
const decodeVehicleDescriptor = (buffer) => {
  let offset = 0;
  const vehicle = { id: null, label: null };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      // id
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      vehicle.id = new TextDecoder().decode(buffer.slice(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 2 && wireType === 2) {
      // label
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      vehicle.label = new TextDecoder().decode(buffer.slice(offset, offset + length));
      offset += length;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return vehicle;
};

/**
 * Decode Position message
 */
const decodePosition = (buffer) => {
  let offset = 0;
  const position = { latitude: null, longitude: null, bearing: null, speed: null };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 5) {
      position.latitude = decodeFloat(buffer, offset);
      offset += 4;
    } else if (fieldNumber === 2 && wireType === 5) {
      position.longitude = decodeFloat(buffer, offset);
      offset += 4;
    } else if (fieldNumber === 3 && wireType === 5) {
      position.bearing = decodeFloat(buffer, offset);
      offset += 4;
    } else if (fieldNumber === 4 && wireType === 5) {
      position.speed = decodeFloat(buffer, offset);
      offset += 4;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return position;
};

/**
 * Fetch vehicle positions from GTFS-RT feed
 * @returns {Promise<Array<Object>>} Array of vehicle position objects
 */
export const fetchVehiclePositions = async () => {
  try {
    // Use fetchWithCORS to handle web browser CORS restrictions
    const response = await fetchWithCORS(GTFS_URLS.VEHICLE_POSITIONS);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const entities = decodeGTFSRT(new Uint8Array(buffer));

    // Extract and clean vehicle data
    return entities
      .filter((entity) => entity.vehicle && entity.vehicle.latitude && entity.vehicle.longitude)
      .map((entity) => ({
        id: entity.id,
        ...entity.vehicle,
      }));
  } catch (error) {
    console.error('Error fetching vehicle positions:', error);
    throw error;
  }
};

/**
 * Format vehicle positions for map display
 * @param {Array<Object>} vehicles - Raw vehicle positions
 * @param {Object} tripMapping - Mapping of trip_id to route info
 * @returns {Array<Object>} Formatted vehicle data for markers
 */
export const formatVehiclesForMap = (vehicles, tripMapping = {}) => {
  return vehicles.map((vehicle) => {
    const tripInfo = tripMapping[vehicle.tripId] || {};

    return {
      id: vehicle.vehicleId || vehicle.id,
      coordinate: {
        latitude: vehicle.latitude,
        longitude: vehicle.longitude,
      },
      bearing: vehicle.bearing,
      speed: vehicle.speed || 0,
      tripId: vehicle.tripId,
      routeId: tripInfo.routeId || vehicle.routeId,
      directionId: tripInfo.directionId ?? null, // Include direction for detour detection
      headsign: tripInfo.headsign || 'Unknown',
      vehicleLabel: vehicle.vehicleLabel,
      timestamp: vehicle.timestamp,
      currentStatus: vehicle.currentStatus,
      stopId: vehicle.stopId,
    };
  });
};
