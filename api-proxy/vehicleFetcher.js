const VEHICLE_POSITIONS_URL = 'https://www.myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb';
const STALE_THRESHOLD_SECONDS = 5 * 60;
const RETRY_DELAY_MS = 2000;

const errors = { fetchFailures: 0, decodeFailures: 0 };

const decodeVarint = (buffer, offset) => {
  let result = 0, shift = 0, bytesRead = 0;
  while (offset + bytesRead < buffer.length) {
    const byte = buffer[offset + bytesRead];
    result |= (byte & 0x7f) << shift;
    bytesRead++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result, bytesRead };
};

const skipField = (buffer, offset, wireType) => {
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
};

const decodeFloat = (buffer, offset) => {
  const bytes = new Uint8Array([buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]]);
  return new DataView(bytes.buffer).getFloat32(0, true);
};

const decodePosition = (buffer) => {
  let offset = 0;
  const position = { latitude: null, longitude: null };
  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;
    const fieldNumber = fieldTag >> 3, wireType = fieldTag & 0x7;
    if (fieldNumber === 1 && wireType === 5) { position.latitude = decodeFloat(buffer, offset); offset += 4; }
    else if (fieldNumber === 2 && wireType === 5) { position.longitude = decodeFloat(buffer, offset); offset += 4; }
    else offset = skipField(buffer, offset, wireType);
  }
  return position;
};

const decodeTripDescriptor = (buffer) => {
  let offset = 0;
  const trip = { tripId: null, routeId: null };
  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;
    const fieldNumber = fieldTag >> 3, wireType = fieldTag & 0x7;
    if (fieldNumber === 1 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      trip.tripId = new TextDecoder().decode(buffer.slice(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 5 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      trip.routeId = new TextDecoder().decode(buffer.slice(offset, offset + length));
      offset += length;
    } else offset = skipField(buffer, offset, wireType);
  }
  return trip;
};

const decodeVehicleDescriptor = (buffer) => {
  let offset = 0;
  const vehicle = { id: null };
  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;
    const fieldNumber = fieldTag >> 3, wireType = fieldTag & 0x7;
    if (fieldNumber === 1 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      vehicle.id = new TextDecoder().decode(buffer.slice(offset, offset + length));
      offset += length;
    } else offset = skipField(buffer, offset, wireType);
  }
  return vehicle;
};

const decodeVehiclePosition = (buffer) => {
  let offset = 0;
  const vehicle = { tripId: null, routeId: null, vehicleId: null, latitude: null, longitude: null, timestamp: null };
  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;
    const fieldNumber = fieldTag >> 3, wireType = fieldTag & 0x7;
    if (fieldNumber === 1 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const trip = decodeTripDescriptor(buffer.slice(offset, offset + length));
      vehicle.tripId = trip.tripId;
      vehicle.routeId = trip.routeId;
      offset += length;
    } else if (fieldNumber === 8 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const veh = decodeVehicleDescriptor(buffer.slice(offset, offset + length));
      vehicle.vehicleId = veh.id;
      offset += length;
    } else if (fieldNumber === 2 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const pos = decodePosition(buffer.slice(offset, offset + length));
      vehicle.latitude = pos.latitude;
      vehicle.longitude = pos.longitude;
      offset += length;
    } else if (fieldNumber === 5 && wireType === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      vehicle.timestamp = value;
      offset += bytesRead;
    } else offset = skipField(buffer, offset, wireType);
  }
  return vehicle;
};

const decodeEntity = (buffer) => {
  let offset = 0;
  const entity = { id: '', vehicle: null };
  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;
    const fieldNumber = fieldTag >> 3, wireType = fieldTag & 0x7;
    if (fieldNumber === 1 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      entity.id = new TextDecoder().decode(buffer.slice(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 4 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      entity.vehicle = decodeVehiclePosition(buffer.slice(offset, offset + length));
      offset += length;
    } else offset = skipField(buffer, offset, wireType);
  }
  return entity.vehicle ? entity : null;
};

const decodeGTFSRT = (buffer) => {
  const entities = [];
  let offset = 0;
  const view = new Uint8Array(buffer);
  while (offset < view.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(view, offset);
    offset += tagBytes;
    const fieldNumber = fieldTag >> 3, wireType = fieldTag & 0x7;
    if (fieldNumber === 2 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(view, offset);
      offset += lenBytes;
      const entity = decodeEntity(view.slice(offset, offset + length));
      if (entity) entities.push(entity);
      offset += length;
    } else offset = skipField(view, offset, wireType);
  }
  return entities;
};

async function fetchWithRetry() {
  try {
    const res = await fetch(VEHICLE_POSITIONS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.arrayBuffer();
  } catch (err) {
    errors.fetchFailures++;
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    const res = await fetch(VEHICLE_POSITIONS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} on retry`);
    return await res.arrayBuffer();
  }
}

async function fetchVehicles(tripMapping = {}) {
  const buffer = await fetchWithRetry();

  let entities;
  try {
    entities = decodeGTFSRT(buffer);
  } catch (err) {
    errors.decodeFailures++;
    throw new Error(`Protobuf decode failed: ${err.message}`);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  return entities
    .filter(e => e.vehicle.latitude != null && e.vehicle.longitude != null)
    .filter(e => e.vehicle.timestamp == null || (nowSeconds - e.vehicle.timestamp) <= STALE_THRESHOLD_SECONDS)
    .map(e => {
      const v = e.vehicle;
      const routeId = (v.tripId && tripMapping[v.tripId]?.routeId) || v.routeId;
      return {
        id: e.id,
        routeId,
        tripId: v.tripId,
        coordinate: { latitude: v.latitude, longitude: v.longitude },
        timestamp: v.timestamp,
      };
    });
}

module.exports = { fetchVehicles, errors };
