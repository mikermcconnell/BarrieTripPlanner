jest.mock('../utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
}));

import { buildRoutingData } from '../services/routingDataService';
import { planTripLocal } from '../services/localRouter';

const makeActiveCalendar = () => ([{
  serviceId: 'weekday',
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
  sunday: true,
  startDate: '20200101',
  endDate: '20991231',
}]);

const makeTodayAt = (hour, minute = 0) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

describe('localRouter duplicate stop handling', () => {
  test('uses the first matching alighting stop after boarding when a trip visits a stop twice', async () => {
    const stops = [
      { id: 'A', name: 'Origin stop', latitude: 44.000, longitude: -79.000, code: 'A' },
      { id: 'B', name: 'Loop stop', latitude: 44.010, longitude: -79.000, code: 'B' },
      { id: 'C', name: 'Far loop stop', latitude: 44.020, longitude: -79.000, code: 'C' },
      { id: 'D', name: 'End stop', latitude: 44.030, longitude: -79.000, code: 'D' },
    ];
    const trips = [{
      tripId: 'loop-trip',
      routeId: 'R1',
      serviceId: 'weekday',
      directionId: 0,
      headsign: 'Loop',
    }];
    const stopTimes = [
      { tripId: 'loop-trip', stopId: 'A', stopSequence: 1, arrivalTime: 8 * 3600, departureTime: 8 * 3600, pickupType: 0, dropOffType: 0 },
      { tripId: 'loop-trip', stopId: 'B', stopSequence: 2, arrivalTime: 8 * 3600 + 10 * 60, departureTime: 8 * 3600 + 10 * 60, pickupType: 0, dropOffType: 0 },
      { tripId: 'loop-trip', stopId: 'C', stopSequence: 3, arrivalTime: 8 * 3600 + 20 * 60, departureTime: 8 * 3600 + 20 * 60, pickupType: 0, dropOffType: 0 },
      { tripId: 'loop-trip', stopId: 'B', stopSequence: 4, arrivalTime: 8 * 3600 + 30 * 60, departureTime: 8 * 3600 + 30 * 60, pickupType: 0, dropOffType: 0 },
      { tripId: 'loop-trip', stopId: 'D', stopSequence: 5, arrivalTime: 8 * 3600 + 40 * 60, departureTime: 8 * 3600 + 40 * 60, pickupType: 0, dropOffType: 0 },
    ];
    const routingData = buildRoutingData({
      stops,
      trips,
      stopTimes,
      routes: [{ id: 'R1', shortName: 'R1', longName: 'Loop route' }],
      shapes: {},
      calendar: makeActiveCalendar(),
      calendarDates: [],
    });
    routingData.routes = [{ id: 'R1', shortName: 'R1', longName: 'Loop route' }];
    routingData.shapes = {};

    const date = makeTodayAt(8);
    const result = await planTripLocal({
      fromLat: 44.000,
      fromLon: -79.000,
      toLat: 44.010,
      toLon: -79.000,
      date,
      time: date,
      routingData,
    });

    const busLeg = result.itineraries[0].legs.find((leg) => leg.mode === 'BUS');

    expect(busLeg.from.stopId).toBe('A');
    expect(busLeg.to.stopId).toBe('B');
    expect(busLeg.duration).toBe(10 * 60);
  });
});
