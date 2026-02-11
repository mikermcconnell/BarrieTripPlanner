import JSZip from 'jszip';
import { GTFS_URLS } from '../config/constants';
import { fetchWithCORS } from '../utils/fetchWithCORS';
import logger from '../utils/logger';

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
    logger.log('Downloading GTFS ZIP from:', GTFS_URLS.STATIC_ZIP);
    // Use fetchWithCORS to handle web browser CORS restrictions
    const response = await fetchWithCORS(GTFS_URLS.STATIC_ZIP);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const files = {};
    const fileNames = Object.keys(zip.files);

    for (const fileName of fileNames) {
      if (fileName.endsWith('.txt')) {
        const content = await zip.files[fileName].async('string');
        files[fileName] = content;
      }
    }

    logger.log('Extracted files:', Object.keys(files));

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
  const routes = parseCSV(content);
  return routes.map((route) => ({
    id: route.route_id,
    shortName: route.route_short_name || route.route_id,
    longName: route.route_long_name || '',
    type: parseInt(route.route_type || '3', 10),
    color: route.route_color ? `#${route.route_color}` : null,
    textColor: route.route_text_color ? `#${route.route_text_color}` : null,
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

    logger.log(`Parsed: ${routes.length} routes, ${stops.length} stops, ${Object.keys(shapes).length} shapes, ${trips.length} trips, ${stopTimes.length} stop_times`);
    logger.log(`Calendar: ${calendar.length} service patterns, ${calendarDates.length} exceptions`);

    const tripMapping = createTripMapping(trips);
    const routeShapeMapping = createRouteShapeMapping(trips);
    const routeStopsMapping = createRouteStopsMapping(trips, stopTimes);

    logger.log('Route stops mapping created for routes:', Object.keys(routeStopsMapping).join(', '));

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
    };
  } catch (error) {
    logger.error('Error fetching all static data:', error);
    throw error;
  }
};

// Export individual parsers for testing
export { parseCSV, parseRoutes, parseStops, parseShapes, parseTrips };
