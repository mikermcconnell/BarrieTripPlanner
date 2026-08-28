const {
  buildServiceCalendar,
  getActiveServicesForDate,
  getServiceCalendarRange,
} = require('../services/calendarService');

describe('service calendar horizon', () => {
  test('builds through the actual GTFS feed end date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-28T16:00:00Z'));
    const result = buildServiceCalendar([{
      serviceId: 'weekday',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
      startDate: '20260101',
      endDate: '20261031',
    }], []);

    expect(getServiceCalendarRange(result)).toEqual({
      startDate: '20260827',
      endDate: '20261031',
    });
    expect(getActiveServicesForDate(result, '20261030')).toEqual(new Set(['weekday']));
    jest.useRealTimers();
  });

  test('honours an explicit shorter window for bounded callers', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-28T16:00:00Z'));
    const result = buildServiceCalendar([], [], 3, 1);
    expect(getServiceCalendarRange(result)).toEqual({
      startDate: '20260827',
      endDate: '20260830',
    });
    jest.useRealTimers();
  });
});
