const { buildDataStructures } = require('../gtfsLoader');
const {
  calculateActiveServiceTimeMs,
  estimateExactRouteHeadwayMs,
  getExactRouteServiceWindow,
} = require('../detour/routeSchedule');

describe('route schedule visibility support', () => {
  test('indexes exact route shape, direction, and trip end times from GTFS', () => {
    const data = buildDataStructures(
      'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nshape-8b,44.38,-79.72,1\nshape-8b,44.38,-79.69,2',
      'route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\n8B,sunday,trip-1,Blake,1,shape-8b',
      {
        stopTimesCSV: [
          'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
          'trip-1,09:11:00,09:12:00,start,1',
          'trip-1,10:01:00,10:02:00,end,2',
        ].join('\n'),
        calendarCSV: 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nsunday,0,0,0,0,0,0,1,20260101,20261231',
      }
    );

    expect(data.scheduleIndex.tripsByRouteId.get('8B')).toEqual([
      expect.objectContaining({
        tripId: 'trip-1',
        directionId: '1',
        shapeId: 'shape-8b',
        startTimeSeconds: 9 * 3600 + 12 * 60,
        endTimeSeconds: 10 * 3600 + 2 * 60,
      }),
    ]);
  });

  test('counts only exact-direction scheduled service time', () => {
    const scheduleIndex = {
      timeZone: 'America/Toronto',
      tripsByRouteId: new Map([['8B', [
        { tripId: 'a', routeId: '8B', serviceId: 'daily', directionId: '1', startTimeSeconds: 9 * 3600, endTimeSeconds: 9 * 3600 + 50 * 60 },
        { tripId: 'b', routeId: '8B', serviceId: 'daily', directionId: '1', startTimeSeconds: 10 * 3600, endTimeSeconds: 10 * 3600 + 50 * 60 },
        { tripId: 'c', routeId: '8B', serviceId: 'daily', directionId: '0', startTimeSeconds: 7 * 3600, endTimeSeconds: 8 * 3600 },
      ]]]),
      calendarByServiceId: new Map([['daily', {
        sunday: true,
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: true,
        startDate: '20260101',
        endDate: '20261231',
      }]]),
      calendarDatesByServiceId: new Map(),
    };

    const active = calculateActiveServiceTimeMs(
      '8B',
      scheduleIndex,
      Date.parse('2026-08-09T11:00:00Z'), // 7:00 AM local
      Date.parse('2026-08-09T14:00:00Z'), // 10:00 AM local
      { directionId: '1' }
    );
    const headway = estimateExactRouteHeadwayMs(
      '8B',
      scheduleIndex,
      Date.parse('2026-08-09T13:30:00Z'),
      { directionId: '1' }
    );

    expect(active).toMatchObject({ available: true, activeServiceMs: 60 * 60 * 1000 });
    expect(headway).toMatchObject({ headwayMs: 60 * 60 * 1000, source: 'exact-route-direction' });
  });

  test('fails safe when exact-direction trip end times are missing', () => {
    const serviceDay = { dateKey: '20260809', weekday: 'sunday' };
    const scheduleIndex = {
      tripsByRouteId: new Map([['8B', [
        { tripId: 'a', routeId: '8B', serviceId: 'daily', directionId: '1', startTimeSeconds: 9 * 3600, endTimeSeconds: null },
        { tripId: 'b', routeId: '8B', serviceId: 'daily', directionId: '1', startTimeSeconds: 10 * 3600, endTimeSeconds: 10 * 3600 + 50 * 60 },
      ]]]),
      calendarByServiceId: new Map([['daily', {
        sunday: true,
        startDate: '20260101',
        endDate: '20261231',
      }]]),
      calendarDatesByServiceId: new Map(),
    };

    expect(getExactRouteServiceWindow(
      '8B',
      scheduleIndex,
      serviceDay,
      { directionId: '1' }
    )).toEqual({ available: false, reason: 'missing-trip-end-times' });
  });
});
