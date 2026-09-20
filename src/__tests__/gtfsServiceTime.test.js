const { getServiceDayStartMs } = require('../utils/gtfsServiceTime');
const { getRequestedTimeMs } = require('../utils/itineraryFeasibility');

test.each([[2026, 2, 8], [2026, 10, 1], [2026, 8, 20]])(
  'GTFS noon anchor preserves daytime timetable on %s/%s/%s', (year, month, day) => {
    const date = new Date(year, month, day);
    expect(getServiceDayStartMs(date) + 9.75 * 3600000)
      .toBe(new Date(year, month, day, 9, 45).getTime());
  }
);

test('elapsed GTFS times over 24 hours cross spring DST without losing the service date', () => {
  const previousServiceDay = new Date(2026, 2, 7);
  expect(getServiceDayStartMs(previousServiceDay) + 26.5 * 3600000)
    .toBe(new Date('2026-03-08T03:30:00-04:00').getTime());
});

test('repeated autumn hour keeps both explicit instants distinct', () => {
  const date = new Date(2026, 10, 1);
  const first = new Date('2026-11-01T01:30:00-04:00');
  const second = new Date('2026-11-01T01:30:00-05:00');
  expect(getRequestedTimeMs({date, time:first})).toBe(first.getTime());
  expect(getRequestedTimeMs({date, time:second})).toBe(second.getTime());
  expect((second.getTime() - getServiceDayStartMs(date)) / 1000).toBe(5400);
});

test('separate date and time picker values use the requested calendar day', () => {
  const date = new Date(2026, 2, 8);
  const time = new Date(2026, 8, 20, 9, 30);
  expect(getRequestedTimeMs({date, time})).toBe(new Date(2026, 2, 8, 9, 30).getTime());
});
