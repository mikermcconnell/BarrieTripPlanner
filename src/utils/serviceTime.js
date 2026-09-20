export const AGENCY_TIME_ZONE = 'America/Toronto';

const DATE_KEY_PATTERN = /^\d{8}$/;

const agencyDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: AGENCY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const getPart = (parts, type) => Number(parts.find((part) => part.type === type)?.value);

export const getAgencyDateTimeParts = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = agencyDateTimeFormatter.formatToParts(date);
  const result = {
    year: getPart(parts, 'year'),
    month: getPart(parts, 'month'),
    day: getPart(parts, 'day'),
    hour: getPart(parts, 'hour'),
    minute: getPart(parts, 'minute'),
    second: getPart(parts, 'second'),
  };

  return Object.values(result).every(Number.isFinite) ? result : null;
};

export const normalizeServiceDate = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && DATE_KEY_PATTERN.test(value)) return value;

  const parts = getAgencyDateTimeParts(value);
  if (!parts) return null;
  return `${parts.year}${String(parts.month).padStart(2, '0')}${String(parts.day).padStart(2, '0')}`;
};

export const getAgencySecondsSinceMidnight = (value = new Date()) => {
  const parts = getAgencyDateTimeParts(value);
  if (!parts) return null;
  return parts.hour * 3600 + parts.minute * 60 + parts.second;
};

// Date/time pickers expose device-local calendar fields. Treat those fields as
// Barrie wall-clock values at the UI boundary so a rider selecting 09:00 gets
// the same Barrie trip regardless of the device timezone.
export const pickerDateToAgencyInstant = (value) => {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const serviceDate = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  const timestamp = serviceDateTimeToTimestamp(serviceDate, seconds);
  if (!Number.isFinite(timestamp)) return null;
  const resolved = getAgencyDateTimeParts(timestamp);
  if (
    !resolved ||
    `${resolved.year}${String(resolved.month).padStart(2, '0')}${String(resolved.day).padStart(2, '0')}` !== serviceDate ||
    resolved.hour !== date.getHours() ||
    resolved.minute !== date.getMinutes() ||
    resolved.second !== date.getSeconds()
  ) {
    return null;
  }
  return new Date(timestamp);
};

export const getAgencyWallClockPickerDate = (value = new Date()) => {
  const parts = getAgencyDateTimeParts(value);
  if (!parts) return null;
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0
  );
};

const parseServiceDateParts = (serviceDate) => {
  const normalized = normalizeServiceDate(serviceDate);
  if (!normalized) return null;
  return {
    year: Number(normalized.slice(0, 4)),
    month: Number(normalized.slice(4, 6)),
    day: Number(normalized.slice(6, 8)),
  };
};

export const addServiceDays = (serviceDate, days) => {
  const parts = parseServiceDateParts(serviceDate);
  if (!parts || !Number.isFinite(Number(days))) return null;

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + Number(days)));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
};

export const getServiceDayOfWeek = (serviceDate) => {
  const parts = parseServiceDateParts(serviceDate);
  if (!parts) return null;
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  ];
};

const getTimeZoneOffsetMs = (timestamp) => {
  const parts = getAgencyDateTimeParts(timestamp);
  if (!parts) return 0;
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return representedAsUtc - Math.floor(timestamp / 1000) * 1000;
};

export const serviceDateTimeToTimestamp = (serviceDate, secondsSinceMidnight = 0) => {
  const parts = parseServiceDateParts(serviceDate);
  const seconds = Number(secondsSinceMidnight);
  if (!parts || !Number.isFinite(seconds)) return null;

  const wholeSeconds = Math.trunc(seconds);
  const nominalUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, wholeSeconds);
  let timestamp = nominalUtc - getTimeZoneOffsetMs(nominalUtc);
  timestamp = nominalUtc - getTimeZoneOffsetMs(timestamp);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const isCurrentAgencyServiceDate = (serviceDate, now = new Date()) => (
  normalizeServiceDate(serviceDate) === normalizeServiceDate(now)
);
