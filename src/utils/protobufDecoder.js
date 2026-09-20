/**
 * Shared protobuf decoding utilities for GTFS-RT feeds
 * Consolidates common decoding functions used across multiple services
 */

/**
 * Decode a varint from a buffer
 * @param {Uint8Array} buffer - The buffer to read from
 * @param {number} offset - Starting offset
 * @returns {Object} { value, bytesRead }
 */
export const decodeVarintBigInt = (buffer, offset = 0) => {
  let result = 0n;
  let shift = 0n;
  let bytesRead = 0;

  while (offset + bytesRead < buffer.length) {
    const byte = buffer[offset + bytesRead];
    result |= BigInt(byte & 0x7f) << shift;
    bytesRead++;
    if ((byte & 0x80) === 0) {
      return { value: result, bytesRead };
    }
    shift += 7n;
    if (shift > 70n) {
      throw new Error('Varint too long');
    }
  }

  throw new Error('Unexpected end of buffer while reading varint');
};

export const decodeVarint = (buffer, offset = 0) => {
  const decoded = decodeVarintBigInt(buffer, offset);
  return { value: Number(decoded.value), bytesRead: decoded.bytesRead };
};

/** Decode protobuf int32 values, including ten-byte negative varints. */
export const decodeInt32Varint = (buffer, offset = 0) => {
  const decoded = decodeVarintBigInt(buffer, offset);
  return {
    value: Number(BigInt.asIntN(32, decoded.value)),
    bytesRead: decoded.bytesRead,
  };
};

/**
 * Skip a protobuf field based on wire type
 * @param {Uint8Array} buffer - The buffer
 * @param {number} offset - Current offset
 * @param {number} wireType - The wire type
 * @returns {number} New offset after skipping
 */
export const skipField = (buffer, offset, wireType) => {
  switch (wireType) {
    case 0: // Varint
      while (offset < buffer.length && (buffer[offset] & 0x80) !== 0) {
        offset++;
      }
      return offset + 1;
    case 1: // 64-bit
      return offset + 8;
    case 2: // Length-delimited
      const { value: length, bytesRead } = decodeVarint(buffer, offset);
      return offset + bytesRead + length;
    case 5: // 32-bit
      return offset + 4;
    default:
      return offset + 1;
  }
};

/**
 * Decode a string from buffer
 * @param {Uint8Array} buffer - The buffer
 * @param {number} offset - Starting offset
 * @returns {Object} { value, newOffset }
 */
export const decodeString = (buffer, offset) => {
  const { value: length, bytesRead } = decodeVarint(buffer, offset);
  offset += bytesRead;
  const str = new TextDecoder().decode(buffer.slice(offset, offset + length));
  return { value: str, newOffset: offset + length };
};

/**
 * Parse the field tag to get field number and wire type
 * @param {Uint8Array} buffer - The buffer
 * @param {number} offset - Starting offset
 * @returns {Object} { fieldNumber, wireType, newOffset }
 */
export const parseFieldTag = (buffer, offset) => {
  const { value: fieldTag, bytesRead } = decodeVarint(buffer, offset);
  return {
    fieldNumber: fieldTag >> 3,
    wireType: fieldTag & 0x7,
    newOffset: offset + bytesRead,
  };
};

/**
 * Decode a length-delimited field
 * @param {Uint8Array} buffer - The buffer
 * @param {number} offset - Starting offset
 * @returns {Object} { data, newOffset }
 */
export const decodeLengthDelimited = (buffer, offset) => {
  const { value: length, bytesRead } = decodeVarint(buffer, offset);
  offset += bytesRead;
  const data = buffer.slice(offset, offset + length);
  return { data, newOffset: offset + length };
};

/**
 * Decode a float from buffer (32-bit)
 * @param {Uint8Array} buffer - The buffer
 * @param {number} offset - Starting offset
 * @returns {number} The float value
 */
export const decodeFloat = (buffer, offset) => {
  // Create a new ArrayBuffer to avoid issues with sliced buffers
  const bytes = new Uint8Array(4);
  bytes[0] = buffer[offset];
  bytes[1] = buffer[offset + 1];
  bytes[2] = buffer[offset + 2];
  bytes[3] = buffer[offset + 3];
  const floatView = new DataView(bytes.buffer);
  return floatView.getFloat32(0, true);
};

/**
 * Decode a signed varint (zigzag encoding)
 * @param {number} value - The unsigned varint value
 * @returns {number} The signed value
 */
export const decodeSignedVarint = (value) => {
  return (value >>> 1) ^ -(value & 1);
};
