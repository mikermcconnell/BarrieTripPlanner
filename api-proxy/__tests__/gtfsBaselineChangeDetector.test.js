const { buildGtfsBaselineChanges } = require('../gtfsBaselineChangeDetector');

const stop = (id, name) => ({ id, code: id, name, latitude: 44, longitude: -79 });

describe('gtfsBaselineChangeDetector', () => {
  test('flags a route as significant when a major terminal stop is removed from the GTFS baseline', () => {
    const previous = {
      routeStopSequencesMapping: {
        '12B': {
          __default__: ['100', '200', '725'],
        },
      },
      stopsById: new Map([
        ['100', stop('100', 'Big Bay Point at Ashford')],
        ['200', stop('200', 'Mapleview at Chef')],
        ['725', stop('725', 'Barrie South GO')],
      ]),
    };
    const current = {
      routeStopSequencesMapping: {
        '12B': {
          __default__: ['100', '200', '5960'],
        },
      },
      stopsById: new Map([
        ['100', stop('100', 'Big Bay Point at Ashford')],
        ['200', stop('200', 'Mapleview at Chef')],
        ['5960', stop('5960', 'Prince William at Mapleview')],
      ]),
    };

    const result = buildGtfsBaselineChanges({ previous, current });

    expect(result.significantChanges).toHaveLength(1);
    expect(result.significantChanges[0]).toMatchObject({
      routeId: '12B',
      changeType: 'route_stop_sequence_changed',
      significant: true,
    });
    expect(result.significantChanges[0].removedStops).toEqual([
      expect.objectContaining({ id: '725', name: 'Barrie South GO', isMajor: true }),
    ]);
    expect(result.significantChanges[0].reasons).toContain('major_stop_removed');
    expect(result.significantChanges[0].reasons).toContain('terminal_changed');
  });

  test('ignores routes whose canonical stop sequence did not change', () => {
    const previous = {
      routeStopSequencesMapping: {
        '12A': { __default__: ['1', '2', '3'] },
      },
      stopsById: new Map([
        ['1', stop('1', 'First')],
        ['2', stop('2', 'Second')],
        ['3', stop('3', 'Third')],
      ]),
    };
    const current = {
      routeStopSequencesMapping: {
        '12A': { __default__: ['1', '2', '3'] },
      },
      stopsById: previous.stopsById,
    };

    const result = buildGtfsBaselineChanges({ previous, current });

    expect(result.changes).toEqual([]);
    expect(result.significantChanges).toEqual([]);
  });
});
