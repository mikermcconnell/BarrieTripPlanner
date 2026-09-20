const {
  buildDataStructures,
  buildTripTerminalStopMapping,
} = require('../gtfsLoader');

describe('GTFS loader terminal context', () => {
  test('derives first and last stop IDs by stop sequence', () => {
    const mapping = buildTripTerminalStopMapping([
      { trip_id: 'trip-100', stop_id: '485', stop_sequence: '2' },
      { trip_id: 'trip-100', stop_id: '2', stop_sequence: '1' },
      { trip_id: 'trip-100', stop_id: '2', stop_sequence: '29' },
    ]);

    expect(mapping.get('trip-100')).toEqual({
      firstStopId: '2',
      firstSequence: 1,
      lastStopId: '2',
      lastSequence: 29,
    });
  });

  test('adds terminal stop context to every loaded trip', () => {
    const data = buildDataStructures(
      [
        'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
        'shape-100,44.387753,-79.690237,1',
        'shape-100,44.388719,-79.691065,2',
      ].join('\n'),
      [
        'route_id,service_id,trip_id,trip_headsign,direction_id,shape_id',
        '100,weekday,trip-100,Red,0,shape-100',
      ].join('\n'),
      {
        stopTimesCSV: [
          'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
          'trip-100,08:00:00,08:00:00,2,1',
          'trip-100,08:01:00,08:01:00,485,2',
          'trip-100,08:30:00,08:30:00,2,29',
        ].join('\n'),
      }
    );

    expect(data.tripMapping.get('trip-100')).toEqual(expect.objectContaining({
      routeId: '100',
      shapeId: 'shape-100',
      firstStopId: '2',
      lastStopId: '2',
    }));
  });
});
