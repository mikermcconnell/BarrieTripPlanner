import {
  buildBusApproachLines,
  buildTripEndpointMarkers,
  buildTripMarkers,
} from '../hooks/useTripVisualization';

describe('buildTripMarkers', () => {
  test('uses boarding and alighting stops for walk access and egress markers', () => {
    const tripFrom = { lat: 44.381, lon: -79.701 };
    const tripTo = { lat: 44.401, lon: -79.681 };
    const legs = [
      {
        mode: 'WALK',
        distance: 291,
        from: { name: 'Origin', lat: tripFrom.lat, lon: tripFrom.lon },
        to: { name: 'Mapleview Stop', lat: 44.383, lon: -79.699, stopId: 'STOP-1', stopCode: '1001' },
      },
      {
        mode: 'BUS',
        from: { name: 'Mapleview Stop', lat: 44.383, lon: -79.699, stopId: 'STOP-1', stopCode: '1001' },
        to: { name: 'Georgian Mall', lat: 44.399, lon: -79.683, stopId: 'STOP-2', stopCode: '2002' },
        route: { id: '10', shortName: '10' },
      },
      {
        mode: 'WALK',
        distance: 104,
        from: { name: 'Georgian Mall', lat: 44.399, lon: -79.683, stopId: 'STOP-2', stopCode: '2002' },
        to: { name: 'Destination', lat: tripTo.lat, lon: tripTo.lon },
      },
    ];

    const markers = buildTripMarkers({ legs, tripFrom, tripTo });

    expect(markers).toEqual([
      {
        id: 'origin',
        coordinate: { latitude: 44.383, longitude: -79.699 },
        type: 'origin',
        title: 'Start',
        stopName: 'Mapleview Stop',
        stopCode: '1001',
        walkDistance: 291,
      },
      {
        id: 'destination',
        coordinate: { latitude: 44.399, longitude: -79.683 },
        type: 'destination',
        title: 'End',
        stopName: 'Georgian Mall',
        stopCode: '2002',
        walkDistance: 104,
      },
    ]);
  });

  test('does not reverse endpoints for walk-only itineraries', () => {
    const markers = buildTripMarkers({
      legs: [
        {
          mode: 'WALK',
          distance: 520,
          from: { name: 'Origin', lat: 44.381, lon: -79.701 },
          to: { name: 'Destination', lat: 44.384, lon: -79.696 },
        },
      ],
      tripFrom: { lat: 44.381, lon: -79.701 },
      tripTo: { lat: 44.384, lon: -79.696 },
    });

    expect(markers).toEqual([
      {
        id: 'origin',
        coordinate: { latitude: 44.381, longitude: -79.701 },
        type: 'origin',
        title: 'Start',
        stopName: 'Origin',
        stopCode: null,
        walkDistance: null,
      },
      {
        id: 'destination',
        coordinate: { latitude: 44.384, longitude: -79.696 },
        type: 'destination',
        title: 'End',
        stopName: 'Destination',
        stopCode: null,
        walkDistance: null,
      },
    ]);
  });
});

describe('buildTripEndpointMarkers', () => {
  test('adds separate actual origin and destination markers when stop markers are distinct', () => {
    const tripMarkers = [
      {
        id: 'origin',
        coordinate: { latitude: 44.383, longitude: -79.699 },
      },
      {
        id: 'destination',
        coordinate: { latitude: 44.399, longitude: -79.683 },
      },
    ];

    expect(buildTripEndpointMarkers({
      tripFrom: { lat: 44.381, lon: -79.701 },
      tripTo: { lat: 44.401, lon: -79.681 },
      tripMarkers,
    })).toEqual([
      {
        id: 'origin-location',
        coordinate: { latitude: 44.381, longitude: -79.701 },
        type: 'originLocation',
        title: 'Start location',
      },
      {
        id: 'destination-location',
        coordinate: { latitude: 44.401, longitude: -79.681 },
        type: 'destinationLocation',
        title: 'Destination location',
      },
    ]);
  });

  test('suppresses duplicate endpoint markers when stop and address are effectively the same point', () => {
    expect(buildTripEndpointMarkers({
      tripFrom: { lat: 44.381, lon: -79.701 },
      tripTo: { lat: 44.401, lon: -79.681 },
      tripMarkers: [
        {
          id: 'origin',
          coordinate: { latitude: 44.38101, longitude: -79.70101 },
        },
        {
          id: 'destination',
          coordinate: { latitude: 44.40101, longitude: -79.68101 },
        },
      ],
    })).toEqual([]);
  });
});

describe('buildBusApproachLines', () => {
  test('returns only the first boarding approach line for transfer itineraries', () => {
    const legs = [
      {
        mode: 'WALK',
        from: { name: 'Origin', lat: 44.381, lon: -79.701 },
        to: { name: 'Stop A', lat: 44.382, lon: -79.7 },
      },
      {
        mode: 'BUS',
        tripId: 'TRIP-1',
        from: { name: 'Stop A', lat: 44.382, lon: -79.7 },
        to: { name: 'Transfer Stop', lat: 44.385, lon: -79.697 },
        route: { color: '#101010' },
      },
      {
        mode: 'WALK',
        from: { name: 'Transfer Stop', lat: 44.385, lon: -79.697 },
        to: { name: 'Stop B', lat: 44.386, lon: -79.696 },
      },
      {
        mode: 'BUS',
        tripId: 'TRIP-2',
        from: { name: 'Stop B', lat: 44.386, lon: -79.696 },
        to: { name: 'Destination Stop', lat: 44.39, lon: -79.692 },
        route: { color: '#ff66aa' },
      },
    ];

    const shapes = {
      shapeA: [
        { latitude: 44.3815, longitude: -79.7005 },
        { latitude: 44.3818, longitude: -79.7002 },
        { latitude: 44.382, longitude: -79.7 },
        { latitude: 44.384, longitude: -79.698 },
      ],
      shapeB: [
        { latitude: 44.3855, longitude: -79.6965 },
        { latitude: 44.386, longitude: -79.696 },
        { latitude: 44.388, longitude: -79.694 },
      ],
    };

    const tripVehicles = [
      {
        tripId: 'TRIP-1',
        coordinate: { latitude: 44.3815, longitude: -79.7005 },
      },
      {
        tripId: 'TRIP-2',
        coordinate: { latitude: 44.3855, longitude: -79.6965 },
      },
    ];

    const tripMapping = {
      'TRIP-1': { shapeId: 'shapeA' },
      'TRIP-2': { shapeId: 'shapeB' },
    };

    expect(buildBusApproachLines({
      legs,
      tripVehicles,
      shapes,
      tripMapping,
    })).toEqual([
      {
        id: 'bus-approach-TRIP-1',
        coordinates: [
          { latitude: 44.3815, longitude: -79.7005 },
          { latitude: 44.3818, longitude: -79.7002 },
          { latitude: 44.382, longitude: -79.7 },
        ],
        color: '#101010',
      },
    ]);
  });

  test('returns no line when the first bus has already passed the origin stop', () => {
    expect(buildBusApproachLines({
      legs: [
        {
          mode: 'BUS',
          tripId: 'TRIP-1',
          from: { name: 'Stop A', lat: 44.382, lon: -79.7 },
          to: { name: 'Stop B', lat: 44.385, lon: -79.697 },
          route: { color: '#101010' },
        },
      ],
      tripVehicles: [
        {
          tripId: 'TRIP-1',
          coordinate: { latitude: 44.384, longitude: -79.698 },
        },
      ],
      shapes: {
        shapeA: [
          { latitude: 44.382, longitude: -79.7 },
          { latitude: 44.383, longitude: -79.699 },
          { latitude: 44.384, longitude: -79.698 },
        ],
      },
      tripMapping: {
        'TRIP-1': { shapeId: 'shapeA' },
      },
    })).toEqual([]);
  });
});
