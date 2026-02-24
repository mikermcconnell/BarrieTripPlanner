import { findContainingZone, isZoneOperating, findNearestHubStop, formatZoneHours } from '../utils/zoneUtils';

// Mock zone data
const mockZones = {
  'south-end': {
    id: 'south-end',
    name: 'South End On-Demand Zone',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-79.72, 44.35],
        [-79.66, 44.35],
        [-79.66, 44.38],
        [-79.72, 44.38],
        [-79.72, 44.35],
      ]],
    },
    serviceHours: {
      weekday: { start: '06:00', end: '22:00' },
      saturday: { start: '08:00', end: '20:00' },
      sunday: null,
    },
    hubStops: ['stop_1', 'stop_2'],
    bookingPhone: '705-555-1234',
    color: '#4CAF50',
    active: true,
  },
  'north-end': {
    id: 'north-end',
    name: 'North End On-Demand Zone',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-79.72, 44.42],
        [-79.66, 44.42],
        [-79.66, 44.46],
        [-79.72, 44.46],
        [-79.72, 44.42],
      ]],
    },
    serviceHours: {
      weekday: { start: '07:00', end: '21:00' },
      saturday: { start: '09:00', end: '18:00' },
      sunday: { start: '10:00', end: '16:00' },
    },
    hubStops: ['stop_3'],
    bookingPhone: '705-555-5678',
    color: '#2196F3',
    active: true,
  },
};

const mockStops = [
  { id: 'stop_1', name: 'Hub Stop A', latitude: 44.36, longitude: -79.70 },
  { id: 'stop_2', name: 'Hub Stop B', latitude: 44.37, longitude: -79.68 },
  { id: 'stop_3', name: 'Hub Stop C', latitude: 44.43, longitude: -79.69 },
  { id: 'stop_4', name: 'Regular Stop', latitude: 44.39, longitude: -79.69 },
];

describe('findContainingZone', () => {
  it('returns zone when point is inside', () => {
    const zone = findContainingZone(44.36, -79.69, mockZones);
    expect(zone).not.toBeNull();
    expect(zone.id).toBe('south-end');
  });

  it('returns correct zone for north-end', () => {
    const zone = findContainingZone(44.44, -79.69, mockZones);
    expect(zone).not.toBeNull();
    expect(zone.id).toBe('north-end');
  });

  it('returns null when point is outside all zones', () => {
    const zone = findContainingZone(44.39, -79.69, mockZones);
    expect(zone).toBeNull();
  });

  it('returns null for empty zones map', () => {
    expect(findContainingZone(44.36, -79.69, {})).toBeNull();
    expect(findContainingZone(44.36, -79.69, null)).toBeNull();
  });
});

describe('isZoneOperating', () => {
  it('returns true during weekday operating hours', () => {
    // Wednesday at 10:00 AM
    const wed10am = new Date(2026, 1, 25, 10, 0); // Feb 25, 2026 is a Wednesday
    expect(isZoneOperating(mockZones['south-end'], wed10am)).toBe(true);
  });

  it('returns false before weekday start time', () => {
    const wed5am = new Date(2026, 1, 25, 5, 0);
    expect(isZoneOperating(mockZones['south-end'], wed5am)).toBe(false);
  });

  it('returns false after weekday end time', () => {
    const wed23 = new Date(2026, 1, 25, 23, 0);
    expect(isZoneOperating(mockZones['south-end'], wed23)).toBe(false);
  });

  it('returns true during saturday hours', () => {
    // Saturday at 12:00 PM
    const sat12pm = new Date(2026, 1, 28, 12, 0); // Feb 28, 2026 is a Saturday
    expect(isZoneOperating(mockZones['south-end'], sat12pm)).toBe(true);
  });

  it('returns false on sunday when no service', () => {
    const sun12pm = new Date(2026, 2, 1, 12, 0); // Mar 1, 2026 is a Sunday
    expect(isZoneOperating(mockZones['south-end'], sun12pm)).toBe(false);
  });

  it('returns true on sunday when service exists', () => {
    const sun12pm = new Date(2026, 2, 1, 12, 0);
    expect(isZoneOperating(mockZones['north-end'], sun12pm)).toBe(true);
  });

  it('returns false for null zone', () => {
    expect(isZoneOperating(null)).toBe(false);
  });
});

describe('findNearestHubStop', () => {
  it('returns the nearest hub stop', () => {
    // Point close to stop_1
    const nearest = findNearestHubStop(44.361, -79.701, ['stop_1', 'stop_2'], mockStops);
    expect(nearest).not.toBeNull();
    expect(nearest.id).toBe('stop_1');
  });

  it('returns the nearest when closer to stop_2', () => {
    const nearest = findNearestHubStop(44.371, -79.681, ['stop_1', 'stop_2'], mockStops);
    expect(nearest).not.toBeNull();
    expect(nearest.id).toBe('stop_2');
  });

  it('only considers hub stop IDs', () => {
    // stop_4 is closer but not a hub stop
    const nearest = findNearestHubStop(44.39, -79.69, ['stop_1', 'stop_2'], mockStops);
    expect(nearest).not.toBeNull();
    expect(nearest.id).not.toBe('stop_4');
  });

  it('returns null for empty hub stops', () => {
    expect(findNearestHubStop(44.36, -79.69, [], mockStops)).toBeNull();
  });

  it('returns null for empty stops array', () => {
    expect(findNearestHubStop(44.36, -79.69, ['stop_1'], [])).toBeNull();
  });
});

describe('formatZoneHours', () => {
  it('formats all three day types', () => {
    const result = formatZoneHours(mockZones['south-end'].serviceHours);
    expect(result).toEqual([
      { day: 'Mon-Fri', hours: '06:00 - 22:00' },
      { day: 'Saturday', hours: '08:00 - 20:00' },
      { day: 'Sunday', hours: 'No service' },
    ]);
  });

  it('formats zone with sunday service', () => {
    const result = formatZoneHours(mockZones['north-end'].serviceHours);
    expect(result).toEqual([
      { day: 'Mon-Fri', hours: '07:00 - 21:00' },
      { day: 'Saturday', hours: '09:00 - 18:00' },
      { day: 'Sunday', hours: '10:00 - 16:00' },
    ]);
  });

  it('returns empty array for null input', () => {
    expect(formatZoneHours(null)).toEqual([]);
  });
});
