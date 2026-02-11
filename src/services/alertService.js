import { GTFS_URLS } from '../config/constants';
import { decodeVarint, skipField, decodeString } from '../utils/protobufDecoder';
import { fetchWithCORS } from '../utils/fetchWithCORS';

/**
 * Parse GTFS-RT ServiceAlerts feed
 */
const parseServiceAlerts = (buffer) => {
  const alerts = [];
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
      const alert = parseAlertEntity(entityData);
      if (alert) alerts.push(alert);
      offset += length;
    } else {
      offset = skipField(view, offset, wireType);
    }
  }

  return alerts;
};

/**
 * Parse a FeedEntity for alerts
 */
const parseAlertEntity = (buffer) => {
  let offset = 0;
  const entity = { id: '', alert: null };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      const { value, newOffset } = decodeString(buffer, offset);
      entity.id = value;
      offset = newOffset;
    } else if (fieldNumber === 5 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      entity.alert = parseAlert(buffer.slice(offset, offset + length));
      offset += length;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return entity.alert ? { id: entity.id, ...entity.alert } : null;
};

/**
 * Parse Alert message
 */
const parseAlert = (buffer) => {
  let offset = 0;
  const alert = {
    activePeriods: [],
    informedEntities: [],
    cause: null,
    effect: null,
    url: null,
    headerText: null,
    descriptionText: null,
  };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      // active_period
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const period = parseTimeRange(buffer.slice(offset, offset + length));
      alert.activePeriods.push(period);
      offset += length;
    } else if (fieldNumber === 5 && wireType === 2) {
      // informed_entity
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const entity = parseEntitySelector(buffer.slice(offset, offset + length));
      alert.informedEntities.push(entity);
      offset += length;
    } else if (fieldNumber === 6 && wireType === 0) {
      // cause
      const { value, bytesRead } = decodeVarint(buffer, offset);
      alert.cause = getCauseName(value);
      offset += bytesRead;
    } else if (fieldNumber === 7 && wireType === 0) {
      // effect
      const { value, bytesRead } = decodeVarint(buffer, offset);
      alert.effect = getEffectName(value);
      offset += bytesRead;
    } else if (fieldNumber === 8 && wireType === 2) {
      // url
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      alert.url = parseTranslatedString(buffer.slice(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 10 && wireType === 2) {
      // header_text
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      alert.headerText = parseTranslatedString(buffer.slice(offset, offset + length));
      offset += length;
    } else if (fieldNumber === 11 && wireType === 2) {
      // description_text
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      alert.descriptionText = parseTranslatedString(buffer.slice(offset, offset + length));
      offset += length;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return alert;
};

/**
 * Parse TimeRange
 */
const parseTimeRange = (buffer) => {
  let offset = 0;
  const range = { start: null, end: null };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      range.start = value * 1000; // Convert to milliseconds
      offset += bytesRead;
    } else if (fieldNumber === 2 && wireType === 0) {
      const { value, bytesRead } = decodeVarint(buffer, offset);
      range.end = value * 1000;
      offset += bytesRead;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return range;
};

/**
 * Parse EntitySelector
 */
const parseEntitySelector = (buffer) => {
  let offset = 0;
  const entity = { agencyId: null, routeId: null, stopId: null, tripId: null };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      const { value, newOffset } = decodeString(buffer, offset);
      entity.agencyId = value;
      offset = newOffset;
    } else if (fieldNumber === 2 && wireType === 2) {
      const { value, newOffset } = decodeString(buffer, offset);
      entity.routeId = value;
      offset = newOffset;
    } else if (fieldNumber === 3 && wireType === 2) {
      // trip descriptor (may include route_id even if route_id field is empty)
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      const trip = parseTripDescriptor(buffer.slice(offset, offset + length));
      if (trip.routeId && !entity.routeId) {
        entity.routeId = trip.routeId;
      }
      if (trip.tripId) {
        entity.tripId = trip.tripId;
      }
      offset += length;
    } else if (fieldNumber === 4 && wireType === 2) {
      const { value, newOffset } = decodeString(buffer, offset);
      entity.stopId = value;
      offset = newOffset;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return entity;
};

/**
 * Parse TripDescriptor inside informed_entity
 */
const parseTripDescriptor = (buffer) => {
  let offset = 0;
  const trip = { tripId: null, routeId: null };

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      const { value, newOffset } = decodeString(buffer, offset);
      trip.tripId = value;
      offset = newOffset;
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

const normalizeRouteId = (routeId) => {
  if (!routeId || typeof routeId !== 'string') return null;
  const trimmed = routeId.trim();
  if (!trimmed) return null;

  // If route IDs arrive as decorated strings (e.g. "Route 8", "BT-08"),
  // keep a numeric canonical form for route matching.
  const digitMatch = trimmed.match(/\d+/);
  if (!digitMatch) return trimmed;
  return String(parseInt(digitMatch[0], 10));
};

const getNormalizedRouteIds = (informedEntities = []) => {
  const ids = new Set();
  for (const entity of informedEntities) {
    if (!entity?.routeId) continue;
    ids.add(entity.routeId);
    const normalized = normalizeRouteId(entity.routeId);
    if (normalized) ids.add(normalized);
  }
  return Array.from(ids);
};

/**
 * Parse TranslatedString (get first translation)
 */
const parseTranslatedString = (buffer) => {
  let offset = 0;

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      const { value: length, bytesRead: lenBytes } = decodeVarint(buffer, offset);
      offset += lenBytes;
      return parseTranslation(buffer.slice(offset, offset + length));
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return null;
};

/**
 * Parse Translation
 */
const parseTranslation = (buffer) => {
  let offset = 0;

  while (offset < buffer.length) {
    const { value: fieldTag, bytesRead: tagBytes } = decodeVarint(buffer, offset);
    offset += tagBytes;

    const fieldNumber = fieldTag >> 3;
    const wireType = fieldTag & 0x7;

    if (fieldNumber === 1 && wireType === 2) {
      const { value } = decodeString(buffer, offset);
      return value;
    } else {
      offset = skipField(buffer, offset, wireType);
    }
  }

  return null;
};

/**
 * Get cause name from enum value
 */
const getCauseName = (value) => {
  const causes = {
    1: 'Unknown',
    2: 'Other',
    3: 'Technical Problem',
    4: 'Strike',
    5: 'Demonstration',
    6: 'Accident',
    7: 'Holiday',
    8: 'Weather',
    9: 'Maintenance',
    10: 'Construction',
    11: 'Police Activity',
    12: 'Medical Emergency',
  };
  return causes[value] || 'Unknown';
};

/**
 * Get effect name from enum value
 */
const getEffectName = (value) => {
  const effects = {
    1: 'No Service',
    2: 'Reduced Service',
    3: 'Significant Delays',
    4: 'Detour',
    5: 'Additional Service',
    6: 'Modified Service',
    7: 'Other',
    8: 'Unknown',
    9: 'Stop Moved',
  };
  return effects[value] || 'Unknown';
};

/**
 * Fetch service alerts from GTFS-RT feed
 */
export const fetchServiceAlerts = async () => {
  try {
    // Use fetchWithCORS to handle web browser CORS restrictions
    const response = await fetchWithCORS(GTFS_URLS.SERVICE_ALERTS);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const alerts = parseServiceAlerts(buffer);

    // Filter and format alerts
    const now = Date.now();
    const activeAlerts = alerts.filter((alert) => {
      if (alert.activePeriods.length === 0) return true;
      return alert.activePeriods.some(
        (period) =>
          (!period.start || period.start <= now) && (!period.end || period.end >= now)
      );
    });

    return activeAlerts.map((alert) => ({
      id: alert.id,
      title: alert.headerText || 'Service Alert',
      description: alert.descriptionText || '',
      cause: alert.cause,
      effect: alert.effect,
      url: alert.url,
      activePeriods: alert.activePeriods,
      affectedRoutes: getNormalizedRouteIds(alert.informedEntities),
      affectedStops: alert.informedEntities
        .filter((e) => e.stopId)
        .map((e) => e.stopId),
      severity: getSeverity(alert.effect),
    }));
  } catch (error) {
    console.error('Error fetching service alerts:', error);
    return [];
  }
};

/**
 * Get severity level from effect
 */
const getSeverity = (effect) => {
  const highSeverity = ['No Service', 'Significant Delays'];
  const mediumSeverity = ['Reduced Service', 'Detour', 'Modified Service'];

  if (highSeverity.includes(effect)) return 'high';
  if (mediumSeverity.includes(effect)) return 'medium';
  return 'low';
};
