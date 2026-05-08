import JSZip from 'jszip';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import pako from 'pako';
import { GTFS_URLS } from '../config/constants';
import { fetchWithCORS } from '../utils/fetchWithCORS';
import {
  createRouteStopSequencesMapping,
  DEFAULT_ROUTE_STOP_SEQUENCE_KEY,
} from '../utils/gtfsStopSequences';
import logger from '../utils/logger';

const GTFS_STATIC_ZIP_CACHE_FILE = 'bttp-gtfs-static.zip';
const LOCAL_DEV_GTFS_PROXY_BASE = 'http://127.0.0.1:3001/proxy?url=';
const LOCAL_DEV_PROXY_FALLBACK_ENABLED =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.NODE_ENV === 'test' ||
  Boolean(process.env.JEST_WORKER_ID);

const base64ToArrayBuffer = (base64) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = String(base64 || '').replace(/[\r\n\s=]/g, '');
  const bytes = [];
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const value = alphabet.indexOf(clean[i]);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes).buffer;
};

const toZipBytes = (data) => {
  if (data instanceof Uint8Array) {
    return new Uint8Array(data);
  }

  return new Uint8Array(data || new ArrayBuffer(0));
};

const describeZipBytes = (bytes) => {
  const firstBytes = Array.from(bytes.slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
  return `length=${bytes.length}, firstBytes=${firstBytes}`;
};

const readUInt16LE = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);

const readUInt32LE = (bytes, offset) =>
  (bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>> 0;

const bytesToString = (bytes) => {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return decodeURIComponent(escape(binary));
};

const findEndOfCentralDirectoryOffsets = (bytes) => {
  const offsets = [];
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (readUInt32LE(bytes, i) === 0x06054b50) {
      offsets.push(i);
    }
  }
  return offsets;
};

const extractZipTextFilesFromCentralDirectory = (bytes) => {
  const eocdOffsets = findEndOfCentralDirectoryOffsets(bytes);

  for (const eocdOffset of eocdOffsets) {
    const entryCount = readUInt16LE(bytes, eocdOffset + 10);
    let centralDirectoryOffset = readUInt32LE(bytes, eocdOffset + 16);
    const files = {};
    let valid = true;

    for (let i = 0; i < entryCount; i += 1) {
      if (readUInt32LE(bytes, centralDirectoryOffset) !== 0x02014b50) {
        valid = false;
        break;
      }

      const compressionMethod = readUInt16LE(bytes, centralDirectoryOffset + 10);
      const compressedSize = readUInt32LE(bytes, centralDirectoryOffset + 20);
      const localHeaderOffset = readUInt32LE(bytes, centralDirectoryOffset + 42);
      const nameLength = readUInt16LE(bytes, centralDirectoryOffset + 28);
      const extraLength = readUInt16LE(bytes, centralDirectoryOffset + 30);
      const commentLength = readUInt16LE(bytes, centralDirectoryOffset + 32);
      const fileName = bytesToString(
        bytes.slice(centralDirectoryOffset + 46, centralDirectoryOffset + 46 + nameLength)
      );

      centralDirectoryOffset += 46 + nameLength + extraLength + commentLength;

      if (
        compressedSize === 0xffffffff ||
        localHeaderOffset === 0xffffffff ||
        readUInt32LE(bytes, localHeaderOffset) !== 0x04034b50
      ) {
        valid = false;
        break;
      }

      if (!fileName.endsWith('.txt')) {
        continue;
      }

      const localNameLength = readUInt16LE(bytes, localHeaderOffset + 26);
      const localExtraLength = readUInt16LE(bytes, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressedData = bytes.slice(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        files[fileName] = bytesToString(compressedData);
      } else if (compressionMethod === 8) {
        files[fileName] = pako.inflateRaw(compressedData, { to: 'string' });
      } else {
        valid = false;
        break;
      }
    }

    if (valid && Object.keys(files).length > 0) {
      return files;
    }
  }

  throw new Error('Unable to extract GTFS ZIP files');
};

const addCacheBust = (url) => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}bttpCacheBust=${Date.now()}`;
};

const buildLocalDevProxyUrl = (url) => `${LOCAL_DEV_GTFS_PROXY_BASE}${encodeURIComponent(url)}`;

/**
 * Parse CSV text into an array of objects
 * @param {string} csvText - Raw CSV text
 * @returns {Array<Object>} Array of objects with headers as keys
 */
const parseCSV = (csvText) => {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];

  // Parse header row (handle BOM if present)
  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xfeff) {
    headerLine = headerLine.slice(1);
  }
  const headers = headerLine.split(',').map((h) => h.trim().replace(/"/g, ''));

  // Parse data rows
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length === headers.length) {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index];
      });
      data.push(obj);
    }
  }

  return data;
};

/**
 * Parse a single CSV line, handling quoted values
 * @param {string} line - Single CSV line
 * @returns {Array<string>} Array of values
 */
const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
};

/**
 * Download and extract the GTFS ZIP file
 * @returns {Promise<Object>} Object with file contents keyed by filename
 */
const downloadGTFSZip = async () => {
  try {
    const downloadUrl = GTFS_URLS.STATIC_ZIP;
    const fetchZip = async (url, options) => {
      // Retry up to 3 times with exponential backoff for this critical download
      let response;
      let lastError;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetchWithCORS(url, options);
          if (response.ok) break;
          lastError = new Error(`HTTP error! status: ${response.status}`);
          if (response.status >= 400 && response.status < 500) break; // Don't retry client errors
        } catch (fetchError) {
          lastError = fetchError;
          if (attempt < 2) {
            const delay = 2000 * Math.pow(2, attempt); // 2s, 4s
            logger.warn(`GTFS download attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error('GTFS download failed after retries');
      }

      return response.arrayBuffer();
    };

    const fetchZipViaFileSystem = async () => {
      if (Platform.OS === 'web' || !FileSystem.cacheDirectory) {
        throw new Error('Native GTFS file download is unavailable on this platform');
      }

      const fileUri = `${FileSystem.cacheDirectory}${GTFS_STATIC_ZIP_CACHE_FILE}`;
      const downloadResult = await FileSystem.downloadAsync(addCacheBust(downloadUrl), fileUri, {
        cache: false,
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      if (downloadResult?.status && (downloadResult.status < 200 || downloadResult.status >= 300)) {
        throw new Error(`Native GTFS download failed with status ${downloadResult.status}`);
      }

      const base64Zip = await FileSystem.readAsStringAsync(downloadResult.uri || fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      try {
        await FileSystem.deleteAsync(downloadResult.uri || fileUri, { idempotent: true });
      } catch (cleanupError) {
        logger.warn('Could not clean up temporary GTFS ZIP:', cleanupError);
      }

      return base64ToArrayBuffer(base64Zip);
    };

    let files = null;
    const zipAttempts = [
      () => fetchZip(downloadUrl),
      () => fetchZip(addCacheBust(downloadUrl), { cache: 'no-store' }),
      fetchZipViaFileSystem,
    ];

    if (Platform.OS !== 'web' && LOCAL_DEV_PROXY_FALLBACK_ENABLED) {
      zipAttempts.push(() =>
        fetchZip(buildLocalDevProxyUrl(addCacheBust(downloadUrl)), { cache: 'no-store' })
      );
    }

    for (let parseAttempt = 0; parseAttempt < zipAttempts.length; parseAttempt += 1) {
      const arrayBuffer = await zipAttempts[parseAttempt]();
      const zipBytes = toZipBytes(arrayBuffer);

      try {
        const zip = await JSZip.loadAsync(zipBytes);
        files = {};
        const fileNames = Object.keys(zip.files);

        for (const fileName of fileNames) {
          if (fileName.endsWith('.txt')) {
            const content = await zip.files[fileName].async('string');
            files[fileName] = content;
          }
        }
        break;
      } catch (zipError) {
        try {
          files = extractZipTextFilesFromCentralDirectory(zipBytes);
          logger.warn(
            'GTFS ZIP required central-directory fallback extraction',
            describeZipBytes(zipBytes)
          );
          break;
        } catch (fallbackError) {
          logger.warn('GTFS central-directory fallback extraction failed:', fallbackError);
        }

        const canRetryCorruptZip =
          zipError?.message?.includes('unexpected signature') &&
          parseAttempt < zipAttempts.length - 1;

        if (canRetryCorruptZip) {
          logger.warn(
            parseAttempt === 0
              ? 'GTFS ZIP payload looked corrupt; retrying with cache bypass'
              : parseAttempt === 1
              ? 'GTFS ZIP payload still looked corrupt; retrying with native file download'
              : 'GTFS ZIP payload still looked corrupt; retrying with local dev proxy',
            describeZipBytes(zipBytes)
          );
          continue;
        }
        throw zipError;
      }
    }

    if (!files) {
      throw new Error('GTFS ZIP extraction failed');
    }

    // Integrity check: verify expected files exist
    const requiredFiles = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'];
    const missingFiles = requiredFiles.filter((f) => !files[f]);
    if (missingFiles.length > 0) {
      logger.warn('GTFS integrity warning: missing expected files:', missingFiles);
    }

    // Sanity check: expect reasonable row counts
    const lineCount = (content) => content ? content.split('\n').length - 1 : 0;
    if (files['stops.txt'] && lineCount(files['stops.txt']) < 100) {
      logger.warn('GTFS integrity warning: unusually low stop count — possible incomplete download');
    }
    if (files['routes.txt'] && lineCount(files['routes.txt']) < 5) {
      logger.warn('GTFS integrity warning: unusually low route count — possible incomplete download');
    }

    return files;
  } catch (error) {
    logger.error('Error downloading GTFS ZIP:', error);
    throw error;
  }
};

/**
 * Parse routes from routes.txt content
 * @param {string} content - CSV content
 * @returns {Array<Object>} Array of route objects
 */
const parseRoutes = (content) => {
  const normalizeGtfsHexColor = (value) => {
    if (!value) return null;
    const stripped = String(value).trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(stripped)) return null;
    return `#${stripped.toUpperCase()}`;
  };

  const routes = parseCSV(content);
  return routes.map((route) => ({
    id: route.route_id,
    shortName: (route.route_short_name || route.route_id || '').trim(),
    longName: route.route_long_name || '',
    type: parseInt(route.route_type || '3', 10),
    color: normalizeGtfsHexColor(route.route_color),
    textColor: normalizeGtfsHexColor(route.route_text_color),
  }));
};

/**
 * Parse stops from stops.txt content
 * @param {string} content - CSV content
 * @returns {Array<Object>} Array of stop objects
 */
const parseStops = (content) => {
  const stops = parseCSV(content);
  return stops.map((stop) => ({
    id: stop.stop_id,
    code: stop.stop_code || stop.stop_id,
    name: stop.stop_name || 'Unknown Stop',
    latitude: parseFloat(stop.stop_lat),
    longitude: parseFloat(stop.stop_lon),
    locationType: parseInt(stop.location_type || '0', 10),
    parentStation: stop.parent_station || null,
    wheelchairBoarding: parseInt(stop.wheelchair_boarding || '0', 10),
  })).filter((stop) => !isNaN(stop.latitude) && !isNaN(stop.longitude));
};

/**
 * Parse shapes from shapes.txt content
 * @param {string} content - CSV content
 * @returns {Object} Object with shape_id as key and array of coordinates as value
 */
const parseShapes = (content) => {
  const shapesRaw = parseCSV(content);
  const shapes = {};

  shapesRaw.forEach((point) => {
    const shapeId = point.shape_id;
    if (!shapeId) return;

    if (!shapes[shapeId]) {
      shapes[shapeId] = [];
    }

    const lat = parseFloat(point.shape_pt_lat);
    const lon = parseFloat(point.shape_pt_lon);

    if (!isNaN(lat) && !isNaN(lon)) {
      shapes[shapeId].push({
        latitude: lat,
        longitude: lon,
        sequence: parseInt(point.shape_pt_sequence || '0', 10),
      });
    }
  });

  // Sort each shape's points by sequence
  Object.keys(shapes).forEach((shapeId) => {
    shapes[shapeId].sort((a, b) => a.sequence - b.sequence);
  });

  return shapes;
};

/**
 * Parse trips from trips.txt content
 * @param {string} content - CSV content
 * @returns {Array<Object>} Array of trip objects
 */
const parseTrips = (content) => {
  const trips = parseCSV(content);
  return trips.map((trip) => ({
    routeId: trip.route_id,
    serviceId: trip.service_id,
    tripId: trip.trip_id,
    headsign: trip.trip_headsign || '',
    directionId: parseInt(trip.direction_id || '0', 10),
    shapeId: trip.shape_id || null,
    blockId: trip.block_id || null,
    wheelchairAccessible: parseInt(trip.wheelchair_accessible || '0', 10),
    bikesAllowed: parseInt(trip.bikes_allowed || '0', 10),
  }));
};

/**
 * Create a mapping of trip_id to shape_id and route_id
 * @param {Array<Object>} trips - Array of trip objects
 * @returns {Object} Mapping object
 */
export const createTripMapping = (trips) => {
  const mapping = {};
  trips.forEach((trip) => {
    mapping[trip.tripId] = {
      routeId: trip.routeId,
      shapeId: trip.shapeId,
      headsign: trip.headsign,
      directionId: trip.directionId,
      blockId: trip.blockId,
    };
  });
  return mapping;
};

/**
 * Create a mapping of route_id to shape_ids (one for each direction)
 * @param {Array<Object>} trips - Array of trip objects
 * @returns {Object} Mapping of route_id to array of shape_ids
 */
export const createRouteShapeMapping = (trips) => {
  const mapping = {};
  trips.forEach((trip) => {
    if (!mapping[trip.routeId]) {
      mapping[trip.routeId] = new Set();
    }
    if (trip.shapeId) {
      mapping[trip.routeId].add(trip.shapeId);
    }
  });

  // Convert Sets to Arrays
  Object.keys(mapping).forEach((routeId) => {
    mapping[routeId] = Array.from(mapping[routeId]);
  });

  return mapping;
};

/**
 * Convert GTFS time string (HH:MM:SS) to seconds since midnight
 * Handles times past midnight (e.g., 25:30:00 = 1:30 AM next day)
 * @param {string} timeStr - Time in HH:MM:SS format
 * @returns {number} Seconds since midnight
 */
const parseTimeToSeconds = (timeStr) => {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map((p) => parseInt(p, 10));
  if (parts.length < 2) return null;
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;
  return hours * 3600 + minutes * 60 + seconds;
};

/**
 * Parse stop_times from stop_times.txt content
 * Now includes arrival/departure times for routing
 * @param {string} content - CSV content
 * @returns {Array<Object>} Array of stop_time objects with times in seconds
 */
const parseStopTimes = (content) => {
  const stopTimes = parseCSV(content);
  return stopTimes.map((st) => ({
    tripId: st.trip_id,
    stopId: st.stop_id,
    stopSequence: parseInt(st.stop_sequence || '0', 10),
    arrivalTime: parseTimeToSeconds(st.arrival_time),
    departureTime: parseTimeToSeconds(st.departure_time),
    pickupType: parseInt(st.pickup_type || '0', 10),
    dropOffType: parseInt(st.drop_off_type || '0', 10),
  }));
};

/**
 * Parse calendar from calendar.txt content
 * Defines regular weekly service patterns
 * @param {string} content - CSV content
 * @returns {Array<Object>} Array of calendar objects
 */
export const parseCalendar = (content) => {
  if (!content) return [];
  const calendars = parseCSV(content);
  return calendars.map((cal) => ({
    serviceId: cal.service_id,
    monday: cal.monday === '1',
    tuesday: cal.tuesday === '1',
    wednesday: cal.wednesday === '1',
    thursday: cal.thursday === '1',
    friday: cal.friday === '1',
    saturday: cal.saturday === '1',
    sunday: cal.sunday === '1',
    startDate: cal.start_date,
    endDate: cal.end_date,
  }));
};

/**
 * Parse calendar_dates from calendar_dates.txt content
 * Defines exceptions to regular service (additions or removals)
 * @param {string} content - CSV content
 * @returns {Array<Object>} Array of calendar_date exception objects
 */
export const parseCalendarDates = (content) => {
  if (!content) return [];
  const dates = parseCSV(content);
  return dates.map((cd) => ({
    serviceId: cd.service_id,
    date: cd.date,
    exceptionType: parseInt(cd.exception_type || '1', 10), // 1=added, 2=removed
  }));
};

/**
 * Create a mapping of route_id to stop_ids
 * @param {Array<Object>} trips - Array of trip objects
 * @param {Array<Object>} stopTimes - Array of stop_time objects
 * @returns {Object} Mapping of route_id to array of stop_ids
 */
export const createRouteStopsMapping = (trips, stopTimes) => {
  // First, create trip_id to route_id mapping
  const tripToRoute = {};
  trips.forEach((trip) => {
    tripToRoute[trip.tripId] = trip.routeId;
  });

  // Then, collect stops per route
  const mapping = {};
  stopTimes.forEach((st) => {
    const routeId = tripToRoute[st.tripId];
    if (routeId) {
      if (!mapping[routeId]) {
        mapping[routeId] = new Set();
      }
      mapping[routeId].add(st.stopId);
    }
  });

  // Convert Sets to Arrays
  Object.keys(mapping).forEach((routeId) => {
    mapping[routeId] = Array.from(mapping[routeId]);
  });

  return mapping;
};

/**
 * Fetch all static GTFS data from the ZIP file
 * @returns {Promise<Object>} Object containing all parsed GTFS data
 */
export const fetchAllStaticData = async () => {
  try {
    const files = await downloadGTFSZip();

    // Parse each file
    const routes = files['routes.txt'] ? parseRoutes(files['routes.txt']) : [];
    const stops = files['stops.txt'] ? parseStops(files['stops.txt']) : [];
    const shapes = files['shapes.txt'] ? parseShapes(files['shapes.txt']) : {};
    const trips = files['trips.txt'] ? parseTrips(files['trips.txt']) : [];
    const stopTimes = files['stop_times.txt'] ? parseStopTimes(files['stop_times.txt']) : [];
    const calendar = files['calendar.txt'] ? parseCalendar(files['calendar.txt']) : [];
    const calendarDates = files['calendar_dates.txt'] ? parseCalendarDates(files['calendar_dates.txt']) : [];

    const tripMapping = createTripMapping(trips);
    const routeShapeMapping = createRouteShapeMapping(trips);
    const routeStopsMapping = createRouteStopsMapping(trips, stopTimes);
    const routeStopSequencesMapping = createRouteStopSequencesMapping(trips, stopTimes);

    return {
      routes,
      stops,
      shapes,
      trips,
      stopTimes,
      calendar,
      calendarDates,
      tripMapping,
      routeShapeMapping,
      routeStopsMapping,
      routeStopSequencesMapping,
    };
  } catch (error) {
    logger.error('Error fetching all static data:', error);
    throw error;
  }
};

// Export individual parsers and GTFS helpers for testing
export {
  parseCSV,
  parseRoutes,
  parseStops,
  parseShapes,
  parseTrips,
  createRouteStopSequencesMapping,
  DEFAULT_ROUTE_STOP_SEQUENCE_KEY,
};
