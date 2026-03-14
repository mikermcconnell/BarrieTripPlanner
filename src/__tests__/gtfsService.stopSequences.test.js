import {
  createRouteStopSequencesMapping,
  DEFAULT_ROUTE_STOP_SEQUENCE_KEY,
} from '../utils/gtfsStopSequences';
import {
  barrieStopTimes,
  barrieTrips,
  BARRIE_12A_FULL_SHAPE_ID,
  BARRIE_12A_FULL_STOP_IDS,
  BARRIE_12A_SHORT_SHAPE_ID,
  BARRIE_12A_SHORT_STOP_IDS,
  BARRIE_8A_BRANCH_SHAPE_ID,
  BARRIE_8A_BRANCH_STOP_IDS,
  BARRIE_8A_MAIN_SHAPE_ID,
  BARRIE_8A_MAIN_STOP_IDS,
} from './fixtures/barrieGtfsFixtures';

describe('createRouteStopSequencesMapping', () => {
  test('preserves canonical stop order by route and shape', () => {
    const trips = [
      { tripId: 'trip-a-1', routeId: 'R1', shapeId: 'shape-a' },
      { tripId: 'trip-a-2', routeId: 'R1', shapeId: 'shape-a' },
      { tripId: 'trip-b-1', routeId: 'R1', shapeId: 'shape-b' },
    ];

    const stopTimes = [
      { tripId: 'trip-a-1', stopId: 's1', stopSequence: 1 },
      { tripId: 'trip-a-1', stopId: 's2', stopSequence: 2 },
      { tripId: 'trip-a-1', stopId: 's3', stopSequence: 3 },
      { tripId: 'trip-a-2', stopId: 's1', stopSequence: 1 },
      { tripId: 'trip-a-2', stopId: 's2', stopSequence: 2 },
      { tripId: 'trip-a-2', stopId: 's3', stopSequence: 3 },
      { tripId: 'trip-b-1', stopId: 's1', stopSequence: 1 },
      { tripId: 'trip-b-1', stopId: 's4', stopSequence: 2 },
      { tripId: 'trip-b-1', stopId: 's5', stopSequence: 3 },
    ];

    const result = createRouteStopSequencesMapping(trips, stopTimes);

    expect(result.R1['shape-a']).toEqual(['s1', 's2', 's3']);
    expect(result.R1['shape-b']).toEqual(['s1', 's4', 's5']);
    expect(result.R1[DEFAULT_ROUTE_STOP_SEQUENCE_KEY]).toEqual(['s1', 's2', 's3']);
  });

  test('falls back to a route-level default sequence when trips have no shape id', () => {
    const trips = [
      { tripId: 'trip-1', routeId: 'R2', shapeId: null },
      { tripId: 'trip-2', routeId: 'R2', shapeId: null },
    ];

    const stopTimes = [
      { tripId: 'trip-1', stopId: 'a', stopSequence: 1 },
      { tripId: 'trip-1', stopId: 'b', stopSequence: 2 },
      { tripId: 'trip-2', stopId: 'a', stopSequence: 1 },
      { tripId: 'trip-2', stopId: 'b', stopSequence: 2 },
    ];

    const result = createRouteStopSequencesMapping(trips, stopTimes);

    expect(result.R2[DEFAULT_ROUTE_STOP_SEQUENCE_KEY]).toEqual(['a', 'b']);
  });

  test('keeps Barrie 8A shape variants separate while preserving their real stop order', () => {
    const result = createRouteStopSequencesMapping(barrieTrips, barrieStopTimes);

    expect(result['8A'][BARRIE_8A_BRANCH_SHAPE_ID]).toEqual(BARRIE_8A_BRANCH_STOP_IDS);
    expect(result['8A'][BARRIE_8A_MAIN_SHAPE_ID]).toEqual(BARRIE_8A_MAIN_STOP_IDS);
  });

  test('uses the Barrie 12A full trip as the route default over the short-turn variant', () => {
    const result = createRouteStopSequencesMapping(barrieTrips, barrieStopTimes);

    expect(result['12A'][BARRIE_12A_FULL_SHAPE_ID]).toEqual(BARRIE_12A_FULL_STOP_IDS);
    expect(result['12A'][BARRIE_12A_SHORT_SHAPE_ID]).toEqual(BARRIE_12A_SHORT_STOP_IDS);
    expect(result['12A'][DEFAULT_ROUTE_STOP_SEQUENCE_KEY]).toEqual(BARRIE_12A_FULL_STOP_IDS);
  });
});
