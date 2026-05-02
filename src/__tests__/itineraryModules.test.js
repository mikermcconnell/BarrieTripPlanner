const { encodePolyline, decodePolyline } = require('../utils/polylineUtils');
const { calculateLegDistance } = require('../services/itinerary/calculateLegDistance');
const { getIntermediateStops } = require('../services/itinerary/getIntermediateStops');
const { buildTransitLegGeometry } = require('../services/itinerary/buildTransitLegGeometry');
const { mergeTransitLegs } = require('../services/itinerary/mergeTransitLegs');
const { buildItinerary } = require('../services/itineraryBuilder');

describe('itinerary modules', () => {
  test('calculateLegDistance sums intermediate segments', () => {
    const distance = calculateLegDistance(
      { lat: 44.0, lon: -79.0 },
      { lat: 44.003, lon: -79.003 },
      [{ lat: 44.0015, lon: -79.0015 }]
    );

    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeGreaterThan(400);
  });

  test('getIntermediateStops returns only stops between boarding and alighting', () => {
    const routingData = {
      stopTimes: [
        { tripId: 'trip-1', stopId: 'A', stopSequence: 1 },
        { tripId: 'trip-1', stopId: 'B', stopSequence: 2 },
        { tripId: 'trip-1', stopId: 'C', stopSequence: 3 },
        { tripId: 'trip-1', stopId: 'D', stopSequence: 4 },
      ],
      stopIndex: {
        A: { id: 'A', name: 'A', latitude: 44.0, longitude: -79.0, code: '1' },
        B: { id: 'B', name: 'B', latitude: 44.001, longitude: -79.001, code: '2' },
        C: { id: 'C', name: 'C', latitude: 44.002, longitude: -79.002, code: '3' },
        D: { id: 'D', name: 'D', latitude: 44.003, longitude: -79.003, code: '4' },
      },
    };

    expect(getIntermediateStops(routingData, 'trip-1', 'A', 'D')).toEqual([
      expect.objectContaining({ stopId: 'B', stopCode: '2' }),
      expect.objectContaining({ stopId: 'C', stopCode: '3' }),
    ]);
  });

  test('buildTransitLegGeometry falls back to stop lines when shape data is unavailable', () => {
    const geometry = buildTransitLegGeometry({
      tripId: 'trip-1',
      tripIndex: {},
      shapes: {},
      from: { lat: 44.0, lon: -79.0 },
      to: { lat: 44.002, lon: -79.002 },
      intermediateStops: [{ lat: 44.001, lon: -79.001 }],
    });

    expect(geometry.length).toBe(3);
    expect(geometry.points).toBe(
      encodePolyline([
        { latitude: 44.0, longitude: -79.0 },
        { latitude: 44.001, longitude: -79.001 },
        { latitude: 44.002, longitude: -79.002 },
      ])
    );
  });

  test('buildTransitLegGeometry prefers ordered waypoint extraction for loop-like routes', () => {
    const geometry = buildTransitLegGeometry({
      tripId: 'trip-loop',
      tripIndex: {
        'trip-loop': { shapeId: 'shape-loop' },
      },
      shapes: {
        'shape-loop': [
          { latitude: 44.38, longitude: -79.7 },
          { latitude: 44.381, longitude: -79.699 },
          { latitude: 44.385, longitude: -79.695 },
          { latitude: 44.39, longitude: -79.69 },
          { latitude: 44.395, longitude: -79.685 },
          { latitude: 44.398, longitude: -79.682 },
          { latitude: 44.3806, longitude: -79.6994 },
        ],
      },
      from: { lat: 44.38, lon: -79.7 },
      to: { lat: 44.3801, lon: -79.6999 },
      intermediateStops: [{ lat: 44.395, lon: -79.685 }],
    });

    expect(geometry.length).toBe(7);
    expect(decodePolyline(geometry.points)).toEqual([
      { latitude: 44.38, longitude: -79.7 },
      { latitude: 44.381, longitude: -79.699 },
      { latitude: 44.385, longitude: -79.695 },
      { latitude: 44.39, longitude: -79.69 },
      { latitude: 44.395, longitude: -79.685 },
      { latitude: 44.398, longitude: -79.682 },
      { latitude: 44.3806, longitude: -79.6994 },
    ]);
  });

  test('mergeTransitLegs merges same-route bus legs and removes the transfer walk', () => {
    const legs = [
      {
        mode: 'BUS',
        startTime: 1000000,
        endTime: 1600000,
        scheduledEndTime: 1600000,
        duration: 600,
        from: { name: 'A', lat: 44.0, lon: -79.0, stopId: 'A', stopCode: '1' },
        to: { name: 'B', lat: 44.001, lon: -79.001, stopId: 'B', stopCode: '2' },
        route: { shortName: '1' },
        tripId: 'trip-1',
        intermediateStops: [],
      },
      {
        mode: 'WALK',
        startTime: 1600000,
        endTime: 1660000,
      },
      {
        mode: 'BUS',
        startTime: 1660000,
        endTime: 2200000,
        scheduledEndTime: 2200000,
        duration: 540,
        from: { name: 'B', lat: 44.001, lon: -79.001, stopId: 'B', stopCode: '2' },
        to: { name: 'C', lat: 44.003, lon: -79.003, stopId: 'C', stopCode: '3' },
        route: { shortName: '1' },
        tripId: 'trip-1',
        intermediateStops: [{ name: 'Mid', lat: 44.002, lon: -79.002, stopId: 'MID', stopCode: '9' }],
      },
    ];

    const merged = mergeTransitLegs(legs);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(
      expect.objectContaining({
        mode: 'BUS',
        duration: 1200,
      })
    );
    expect(merged[0].to.stopId).toBe('C');
    expect(merged[0].intermediateStops).toEqual([
      expect.objectContaining({ stopId: 'B' }),
      expect.objectContaining({ stopId: 'MID' }),
    ]);
  });

  test('buildItinerary collapses adjacent final walking legs into one egress walk', () => {
    const date = new Date('2026-05-01T12:00:00');
    const routingData = {
      stopIndex: {
        ORIGIN_STOP: {
          id: 'ORIGIN_STOP',
          name: 'Origin stop',
          latitude: 44.3800,
          longitude: -79.7000,
          code: '100',
        },
        ALIGHT_STOP: {
          id: 'ALIGHT_STOP',
          name: 'Alight stop',
          latitude: 44.3900,
          longitude: -79.7100,
          code: '200',
        },
        DEST_STOP: {
          id: 'DEST_STOP',
          name: 'Destination-side stop',
          latitude: 44.3905,
          longitude: -79.7105,
          code: '201',
        },
      },
      tripIndex: {},
      shapes: {},
      stopTimes: [
        { tripId: 'trip-8b', stopId: 'ORIGIN_STOP', stopSequence: 1 },
        { tripId: 'trip-8b', stopId: 'ALIGHT_STOP', stopSequence: 2 },
      ],
      routes: [
        { id: '8B', shortName: '8B', longName: 'Route 8B', color: '#111111' },
      ],
    };

    const itinerary = buildItinerary(
      {
        arrivalTime: 2180,
        walkToDestSeconds: 120,
        destinationStopId: 'DEST_STOP',
        path: [
          { type: 'ORIGIN_WALK', toStopId: 'ORIGIN_STOP', walkSeconds: 780 },
          {
            type: 'TRANSIT',
            tripId: 'trip-8b',
            routeId: '8B',
            directionId: 0,
            headsign: 'Park Place',
            boardingStopId: 'ORIGIN_STOP',
            alightingStopId: 'ALIGHT_STOP',
            boardingTime: 1000,
            alightingTime: 2000,
          },
          {
            type: 'TRANSFER',
            fromStopId: 'ALIGHT_STOP',
            toStopId: 'DEST_STOP',
            walkSeconds: 60,
            walkMeters: 70,
          },
        ],
      },
      routingData,
      {
        fromLat: 44.3790,
        fromLon: -79.6990,
        toLat: 44.3915,
        toLon: -79.7115,
        date,
      }
    );

    expect(itinerary.legs.map((leg) => leg.mode)).toEqual(['WALK', 'BUS', 'WALK']);
    expect(itinerary.legs[2]).toEqual(expect.objectContaining({
      duration: 180,
      from: expect.objectContaining({ stopId: 'ALIGHT_STOP' }),
      to: expect.objectContaining({ name: 'Destination' }),
    }));
  });

  test('mergeTransitLegs preserves loop geometry across same-route trip switches', () => {
    const grove = { latitude: 44.40646, longitude: -79.66828 };
    const hub = { latitude: 44.38775, longitude: -79.69024 };
    const maple = { latitude: 44.3904, longitude: -79.69251 };
    const eden = { latitude: 44.38343, longitude: -79.71934 };

    const legs = [
      {
        mode: 'BUS',
        startTime: 1000000,
        endTime: 1600000,
        scheduledEndTime: 1600000,
        duration: 600,
        from: { name: 'Grove at Cook', lat: grove.latitude, lon: grove.longitude, stopId: '941', stopCode: '941' },
        to: { name: 'Downtown Hub', lat: hub.latitude, lon: hub.longitude, stopId: '2', stopCode: '2' },
        route: { shortName: '10' },
        tripId: 'trip-before-switch',
        intermediateStops: [],
        legGeometry: {
          points: encodePolyline([grove, hub]),
          length: 2,
        },
      },
      {
        mode: 'WALK',
        startTime: 1600000,
        endTime: 1660000,
      },
      {
        mode: 'BUS',
        startTime: 1660000,
        endTime: 2200000,
        scheduledEndTime: 2200000,
        duration: 540,
        from: { name: 'Downtown Hub', lat: hub.latitude, lon: hub.longitude, stopId: '2', stopCode: '2' },
        to: { name: 'Eden Drive', lat: eden.latitude, lon: eden.longitude, stopId: '324', stopCode: '324' },
        route: { shortName: '10' },
        tripId: 'trip-after-switch',
        intermediateStops: [{ name: 'Maple at Ross', lat: maple.latitude, lon: maple.longitude, stopId: '485', stopCode: '485' }],
        legGeometry: {
          points: encodePolyline([hub, maple, eden]),
          length: 3,
        },
      },
    ];

    const routingData = {
      tripIndex: {
        'trip-before-switch': { shapeId: 'route-10-loop' },
        'trip-after-switch': { shapeId: 'route-10-loop' },
      },
      shapes: {
        'route-10-loop': [hub, maple, eden, grove, hub],
      },
    };

    const merged = mergeTransitLegs(legs, routingData);
    const decoded = decodePolyline(merged[0].legGeometry.points);

    expect(merged).toHaveLength(1);
    expect(merged[0].tripIds).toEqual(['trip-before-switch', 'trip-after-switch']);
    expect(decoded).toEqual([grove, hub, maple, eden]);
  });

  test('mergeTransitLegs does not merge bus legs on different routes', () => {
    const legs = [
      {
        mode: 'BUS',
        startTime: 1000000,
        endTime: 1600000,
        scheduledEndTime: 1600000,
        duration: 600,
        from: { name: 'A', lat: 44.0, lon: -79.0, stopId: 'A', stopCode: '1' },
        to: { name: 'B', lat: 44.001, lon: -79.001, stopId: 'B', stopCode: '2' },
        route: { shortName: '1' },
        tripId: 'trip-1',
        intermediateStops: [],
      },
      {
        mode: 'WALK',
        startTime: 1600000,
        endTime: 1660000,
      },
      {
        mode: 'BUS',
        startTime: 1660000,
        endTime: 2200000,
        scheduledEndTime: 2200000,
        duration: 540,
        from: { name: 'C', lat: 44.002, lon: -79.002, stopId: 'C', stopCode: '3' },
        to: { name: 'D', lat: 44.003, lon: -79.003, stopId: 'D', stopCode: '4' },
        route: { shortName: '2' },
        tripId: 'trip-2',
        intermediateStops: [],
      },
    ];

    const merged = mergeTransitLegs(legs);

    expect(merged).toHaveLength(3);
    expect(merged[0].route.shortName).toBe('1');
    expect(merged[2].route.shortName).toBe('2');
  });

  test('buildItinerary calculates exact timing totals across walks, wait, and transfers', () => {
    const routingData = {
      stopIndex: {
        STOP_A: { id: 'STOP_A', name: 'Stop A', latitude: 44.0, longitude: -79.0, code: '100' },
        STOP_B: { id: 'STOP_B', name: 'Stop B', latitude: 44.001, longitude: -79.001, code: '101' },
        STOP_C: { id: 'STOP_C', name: 'Stop C', latitude: 44.002, longitude: -79.002, code: '102' },
        STOP_D: { id: 'STOP_D', name: 'Stop D', latitude: 44.003, longitude: -79.003, code: '103' },
      },
      stopTimes: [
        { tripId: 'trip-1', stopId: 'STOP_A', stopSequence: 1 },
        { tripId: 'trip-1', stopId: 'STOP_B', stopSequence: 2 },
        { tripId: 'trip-2', stopId: 'STOP_C', stopSequence: 1 },
        { tripId: 'trip-2', stopId: 'STOP_D', stopSequence: 2 },
      ],
      tripIndex: {
        'trip-1': {},
        'trip-2': {},
      },
      routes: [
        { id: '1', shortName: '1', longName: 'Route 1', color: '#123456' },
        { id: '2', shortName: '2', longName: 'Route 2', color: '#654321' },
      ],
      shapes: {},
    };

    const result = {
      path: [
        { type: 'ORIGIN_WALK', toStopId: 'STOP_A', walkSeconds: 120 },
        {
          type: 'TRANSIT',
          routeId: '1',
          tripId: 'trip-1',
          boardingStopId: 'STOP_A',
          alightingStopId: 'STOP_B',
          boardingTime: 600,
          alightingTime: 900,
          headsign: 'North',
        },
        {
          type: 'TRANSFER',
          fromStopId: 'STOP_B',
          toStopId: 'STOP_C',
          walkSeconds: 90,
          walkMeters: 100,
        },
        {
          type: 'TRANSIT',
          routeId: '2',
          tripId: 'trip-2',
          boardingStopId: 'STOP_C',
          alightingStopId: 'STOP_D',
          boardingTime: 1020,
          alightingTime: 1380,
          headsign: 'Downtown',
        },
      ],
      arrivalTime: 1380,
      walkToDestSeconds: 60,
      destinationStopId: 'STOP_D',
    };

    const itinerary = buildItinerary(result, routingData, {
      fromLat: 43.9995,
      fromLon: -78.9995,
      toLat: 44.0035,
      toLon: -79.0035,
      date: '2026-04-10',
    });

    expect(itinerary.legs).toHaveLength(5);
    expect(itinerary.walkTime).toBe(270);
    expect(itinerary.transitTime).toBe(660);
    expect(itinerary.waitingTime).toBe(30);
    expect(itinerary.transfers).toBe(1);
    expect(itinerary.duration).toBe(960);
  });

  test('buildItinerary keeps the public itineraryBuilder entrypoint stable', () => {
    const routingData = {
      stopIndex: {
        STOP_A: { id: 'STOP_A', name: 'Stop A', latitude: 44.0, longitude: -79.0, code: '100' },
        STOP_B: { id: 'STOP_B', name: 'Stop B', latitude: 44.001, longitude: -79.001, code: '101' },
        STOP_C: { id: 'STOP_C', name: 'Stop C', latitude: 44.002, longitude: -79.002, code: '102' },
      },
      stopTimes: [
        { tripId: 'trip-1', stopId: 'STOP_A', stopSequence: 1 },
        { tripId: 'trip-1', stopId: 'STOP_B', stopSequence: 2 },
        { tripId: 'trip-1', stopId: 'STOP_C', stopSequence: 3 },
      ],
      tripIndex: {
        'trip-1': {},
      },
      routes: [
        { id: '1', shortName: '1', longName: 'Route 1', color: '#123456' },
      ],
      shapes: {},
    };

    const result = {
      path: [
        {
          type: 'ORIGIN_WALK',
          toStopId: 'STOP_A',
          walkSeconds: 120,
        },
        {
          type: 'TRANSIT',
          routeId: '1',
          tripId: 'trip-1',
          boardingStopId: 'STOP_A',
          alightingStopId: 'STOP_C',
          boardingTime: 600,
          alightingTime: 1200,
          headsign: 'Downtown',
        },
      ],
      arrivalTime: 1200,
      walkToDestSeconds: 60,
      destinationStopId: 'STOP_C',
    };

    const itinerary = buildItinerary(result, routingData, {
      fromLat: 43.9995,
      fromLon: -78.9995,
      toLat: 44.0025,
      toLon: -79.0025,
      date: '2026-04-10',
    });

    expect(itinerary.legs).toHaveLength(3);
    expect(itinerary.legs[1]).toEqual(
      expect.objectContaining({
        mode: 'BUS',
        tripId: 'trip-1',
        headsign: 'Downtown',
      })
    );
    expect(itinerary.legs[1].intermediateStops).toEqual([
      expect.objectContaining({ stopId: 'STOP_B' }),
    ]);
    expect(itinerary.transfers).toBe(0);
  });
});
