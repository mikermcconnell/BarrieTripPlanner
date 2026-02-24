/**
 * Tests for onDemandRouter.js
 *
 * Validates zone analysis, hub stop routing, same-zone trips,
 * and on-demand duration estimation.
 */

import {
  analyzeZoneInvolvement,
  buildZoneAwareTrip,
  estimateOnDemandDuration,
} from '../services/onDemandRouter';

// ─── Test Fixtures ───────────────────────────────────────────────

// A simple square zone polygon (GeoJSON [lng, lat] order)
const SOUTH_ZONE_GEOMETRY = {
  type: 'Polygon',
  coordinates: [[
    [-79.72, 44.34], // SW
    [-79.68, 44.34], // SE
    [-79.68, 44.37], // NE
    [-79.72, 44.37], // NW
    [-79.72, 44.34], // close ring
  ]],
};

const NORTH_ZONE_GEOMETRY = {
  type: 'Polygon',
  coordinates: [[
    [-79.72, 44.42],
    [-79.68, 44.42],
    [-79.68, 44.45],
    [-79.72, 44.45],
    [-79.72, 44.42],
  ]],
};

const makeZone = (id, name, geometry, hubStopIds = [], overrides = {}) => ({
  id,
  name,
  geometry,
  serviceHours: {
    weekday: { start: '06:00', end: '22:00' },
    saturday: { start: '08:00', end: '20:00' },
    sunday: null,
  },
  hubStops: hubStopIds,
  bookingPhone: '705-555-1234',
  color: '#4CAF50',
  active: true,
  ...overrides,
});

const SOUTH_ZONE = makeZone('south-end', 'South End Zone', SOUTH_ZONE_GEOMETRY, ['hub-1', 'hub-2']);
const NORTH_ZONE = makeZone('north-end', 'North End Zone', NORTH_ZONE_GEOMETRY, ['hub-3']);

const ON_DEMAND_ZONES = {
  'south-end': SOUTH_ZONE,
  'north-end': NORTH_ZONE,
};

// Mock stops array (matches hub stop IDs in zones)
const STOPS = [
  { id: 'hub-1', name: 'South Hub A', latitude: 44.345, longitude: -79.700 },
  { id: 'hub-2', name: 'South Hub B', latitude: 44.360, longitude: -79.695 },
  { id: 'hub-3', name: 'North Hub', latitude: 44.430, longitude: -79.700 },
  { id: 'regular-1', name: 'Regular Stop', latitude: 44.390, longitude: -79.690 },
];

// A weekday within service hours
const WEEKDAY_10AM = new Date('2026-02-23T10:00:00');
// A Sunday (no service in test zones)
const SUNDAY_10AM = new Date('2026-02-22T10:00:00');

// ─── analyzeZoneInvolvement ─────────────────────────────────────

describe('analyzeZoneInvolvement', () => {
  test('detects origin inside a zone', () => {
    const result = analyzeZoneInvolvement({
      fromLat: 44.35,
      fromLon: -79.70,
      toLat: 44.39, // outside zones (downtown)
      toLon: -79.69,
      onDemandZones: ON_DEMAND_ZONES,
      stops: STOPS,
      departureTime: WEEKDAY_10AM,
    });

    expect(result.needsOnDemand).toBe(true);
    expect(result.originZone).not.toBeNull();
    expect(result.originZone.id).toBe('south-end');
    expect(result.originHubStop).not.toBeNull();
    expect(result.destZone).toBeNull();
  });

  test('detects destination inside a zone', () => {
    const result = analyzeZoneInvolvement({
      fromLat: 44.39, // outside zones
      fromLon: -79.69,
      toLat: 44.43,  // inside north zone
      toLon: -79.70,
      onDemandZones: ON_DEMAND_ZONES,
      stops: STOPS,
      departureTime: WEEKDAY_10AM,
    });

    expect(result.needsOnDemand).toBe(true);
    expect(result.originZone).toBeNull();
    expect(result.destZone).not.toBeNull();
    expect(result.destZone.id).toBe('north-end');
    expect(result.destHubStop).not.toBeNull();
  });

  test('detects both endpoints in different zones', () => {
    const result = analyzeZoneInvolvement({
      fromLat: 44.35,  // south zone
      fromLon: -79.70,
      toLat: 44.43,    // north zone
      toLon: -79.70,
      onDemandZones: ON_DEMAND_ZONES,
      stops: STOPS,
      departureTime: WEEKDAY_10AM,
    });

    expect(result.needsOnDemand).toBe(true);
    expect(result.originZone.id).toBe('south-end');
    expect(result.destZone.id).toBe('north-end');
  });

  test('detects both endpoints in same zone', () => {
    const result = analyzeZoneInvolvement({
      fromLat: 44.35,  // south zone
      fromLon: -79.70,
      toLat: 44.36,    // also south zone
      toLon: -79.69,
      onDemandZones: ON_DEMAND_ZONES,
      stops: STOPS,
      departureTime: WEEKDAY_10AM,
    });

    expect(result.needsOnDemand).toBe(true);
    expect(result.originZone.id).toBe('south-end');
    expect(result.destZone.id).toBe('south-end');
  });

  test('returns no on-demand when both points outside zones', () => {
    const result = analyzeZoneInvolvement({
      fromLat: 44.39,  // downtown
      fromLon: -79.69,
      toLat: 44.40,
      toLon: -79.68,
      onDemandZones: ON_DEMAND_ZONES,
      stops: STOPS,
      departureTime: WEEKDAY_10AM,
    });

    expect(result.needsOnDemand).toBe(false);
    expect(result.originZone).toBeNull();
    expect(result.destZone).toBeNull();
  });

  test('returns no on-demand when zone is not operating (Sunday)', () => {
    const result = analyzeZoneInvolvement({
      fromLat: 44.35,  // inside south zone
      fromLon: -79.70,
      toLat: 44.39,
      toLon: -79.69,
      onDemandZones: ON_DEMAND_ZONES,
      stops: STOPS,
      departureTime: SUNDAY_10AM,
    });

    expect(result.needsOnDemand).toBe(false);
    expect(result.originZone).toBeNull();
  });

  test('returns no on-demand with empty zones map', () => {
    const result = analyzeZoneInvolvement({
      fromLat: 44.35,
      fromLon: -79.70,
      toLat: 44.39,
      toLon: -79.69,
      onDemandZones: {},
      stops: STOPS,
      departureTime: WEEKDAY_10AM,
    });

    expect(result.needsOnDemand).toBe(false);
  });

  test('returns no on-demand with null zones', () => {
    const result = analyzeZoneInvolvement({
      fromLat: 44.35,
      fromLon: -79.70,
      toLat: 44.39,
      toLon: -79.69,
      onDemandZones: null,
      stops: STOPS,
      departureTime: WEEKDAY_10AM,
    });

    expect(result.needsOnDemand).toBe(false);
  });

  test('picks nearest hub stop to origin', () => {
    const result = analyzeZoneInvolvement({
      fromLat: 44.346, // Closer to hub-1 (44.345)
      fromLon: -79.700,
      toLat: 44.39,
      toLon: -79.69,
      onDemandZones: ON_DEMAND_ZONES,
      stops: STOPS,
      departureTime: WEEKDAY_10AM,
    });

    expect(result.originHubStop.id).toBe('hub-1');
  });
});

// ─── buildZoneAwareTrip ─────────────────────────────────────────

describe('buildZoneAwareTrip', () => {
  test('same-zone trip returns sameZone: true', () => {
    const analysis = {
      originZone: SOUTH_ZONE,
      destZone: SOUTH_ZONE,
      originHubStop: STOPS[0],
      destHubStop: STOPS[1],
      needsOnDemand: true,
    };

    const trip = buildZoneAwareTrip(analysis);
    expect(trip.sameZone).toBe(true);
    expect(trip.zone.id).toBe('south-end');
    expect(trip.raptorFrom).toBeNull();
    expect(trip.raptorTo).toBeNull();
  });

  test('origin-in-zone adjusts RAPTOR start to hub stop', () => {
    const analysis = {
      originZone: SOUTH_ZONE,
      destZone: null,
      originHubStop: STOPS[0],
      destHubStop: null,
      needsOnDemand: true,
    };

    const trip = buildZoneAwareTrip(analysis);
    expect(trip.sameZone).toBe(false);
    expect(trip.raptorFrom).toEqual({
      lat: STOPS[0].latitude,
      lon: STOPS[0].longitude,
    });
    expect(trip.prependLeg).not.toBeNull();
    expect(trip.prependLeg.zone.id).toBe('south-end');
    expect(trip.appendLeg).toBeNull();
  });

  test('destination-in-zone adjusts RAPTOR end to hub stop', () => {
    const analysis = {
      originZone: null,
      destZone: NORTH_ZONE,
      originHubStop: null,
      destHubStop: STOPS[2],
      needsOnDemand: true,
    };

    const trip = buildZoneAwareTrip(analysis);
    expect(trip.sameZone).toBe(false);
    expect(trip.raptorTo).toEqual({
      lat: STOPS[2].latitude,
      lon: STOPS[2].longitude,
    });
    expect(trip.prependLeg).toBeNull();
    expect(trip.appendLeg).not.toBeNull();
    expect(trip.appendLeg.zone.id).toBe('north-end');
  });

  test('both zones creates both prepend and append legs', () => {
    const analysis = {
      originZone: SOUTH_ZONE,
      destZone: NORTH_ZONE,
      originHubStop: STOPS[0],
      destHubStop: STOPS[2],
      needsOnDemand: true,
    };

    const trip = buildZoneAwareTrip(analysis);
    expect(trip.sameZone).toBe(false);
    expect(trip.prependLeg).not.toBeNull();
    expect(trip.appendLeg).not.toBeNull();
    expect(trip.raptorFrom.lat).toBe(STOPS[0].latitude);
    expect(trip.raptorTo.lat).toBe(STOPS[2].latitude);
  });
});

// ─── estimateOnDemandDuration ───────────────────────────────────

describe('estimateOnDemandDuration', () => {
  test('returns duration in seconds', () => {
    const duration = estimateOnDemandDuration(44.35, -79.70, 44.36, -79.69);
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThan(0);
  });

  test('includes 5-minute pickup wait', () => {
    // Very short distance — should be ~5 min (300s) plus small travel time
    const duration = estimateOnDemandDuration(44.35, -79.70, 44.3501, -79.70);
    expect(duration).toBeGreaterThanOrEqual(300); // At least 5 min wait
  });

  test('longer trips have proportionally more duration', () => {
    const short = estimateOnDemandDuration(44.35, -79.70, 44.355, -79.70);
    const long = estimateOnDemandDuration(44.35, -79.70, 44.40, -79.70);
    expect(long).toBeGreaterThan(short);
  });

  test('same point returns just the pickup wait', () => {
    const duration = estimateOnDemandDuration(44.35, -79.70, 44.35, -79.70);
    expect(duration).toBe(300); // 5 min pickup wait only
  });
});
