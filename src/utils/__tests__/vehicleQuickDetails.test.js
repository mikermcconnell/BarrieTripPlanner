import { getVehicleQuickDetails } from '../vehicleQuickDetails';

const stops = [
  { id: 'one', name: 'First Stop' },
  { id: 'two', name: 'Second Stop' },
];

describe('getVehicleQuickDetails', () => {
  test('shows the stop a bus is travelling to and its late status', () => {
    expect(getVehicleQuickDetails({
      vehicle: { id: 'bus-1', vehicleLabel: '401', routeId: '1', shapeId: 'shape', stopId: 'two', currentStatus: 2 },
      stops,
      routeStopSequencesMapping: { 1: { shape: ['one', 'two'] } },
      tripUpdate: { stopTimeUpdates: [{ stopId: 'two', arrival: { delay: 125 } }] },
    })).toEqual({
      busIdentifier: '401',
      nextStopName: 'Second Stop',
      scheduleStatus: 'Late · 3 min',
    });
  });

  test('uses the following stop when a bus is stopped at a stop', () => {
    expect(getVehicleQuickDetails({
      vehicle: { id: 'bus-1', routeId: '1', shapeId: 'shape', stopId: 'one', currentStatus: 1 },
      stops,
      routeStopSequencesMapping: { 1: { shape: ['one', 'two'] } },
      tripUpdate: { stopTimeUpdates: [{ stopId: 'two', departure: { delay: -90 } }] },
    })).toEqual({
      busIdentifier: 'bus-1',
      nextStopName: 'Second Stop',
      scheduleStatus: 'Early · 2 min',
    });
  });

  test('treats a delay within one minute as on time', () => {
    expect(getVehicleQuickDetails({
      vehicle: { id: 'bus-1', routeId: '1', stopId: 'two', currentStatus: 2 },
      stops,
      tripUpdate: { stopTimeUpdates: [{ stopId: 'two', arrival: { delay: 60 } }] },
    }).scheduleStatus).toBe('On time');
  });

  test('matches a trip update that identifies the next stop by sequence only', () => {
    expect(getVehicleQuickDetails({
      vehicle: { id: 'bus-1', routeId: '1', stopId: 'two', currentStatus: 2, currentStopSequence: 4 },
      stops,
      tripUpdate: { stopTimeUpdates: [{ stopSequence: 4, arrival: { delay: 61 } }] },
    }).scheduleStatus).toBe('Late · 2 min');
  });
});
