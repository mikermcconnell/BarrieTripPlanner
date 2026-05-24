const {
  getHolidayServiceInfo,
  getHolidayNameForDate,
} = require('../utils/holidayService');

const weekdayServiceId = 'weekday';
const sundayServiceId = 'sunday-holiday';

const calendar = [
  {
    serviceId: weekdayServiceId,
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
    startDate: '20260501',
    endDate: '20260831',
  },
  {
    serviceId: sundayServiceId,
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
    sunday: true,
    startDate: '20260501',
    endDate: '20260831',
  },
];

const routes = [
  { id: '2A', shortName: '2A', longName: 'Dunlop' },
  { id: '8A', shortName: '8A', longName: 'RVH / Yonge' },
];

const trips = [
  { tripId: 'w1', routeId: '2A', serviceId: weekdayServiceId },
  { tripId: 'h1', routeId: '2A', serviceId: sundayServiceId },
  { tripId: 'h2', routeId: '8A', serviceId: sundayServiceId },
];

const stopTimes = [
  { tripId: 'h1', departureTime: 8 * 3600, arrivalTime: 8 * 3600 + 120 },
  { tripId: 'h1', departureTime: 9 * 3600, arrivalTime: 9 * 3600 + 120 },
  { tripId: 'h2', departureTime: 10 * 3600 + 30 * 60, arrivalTime: 11 * 3600 },
];

describe('holidayService', () => {
  test('builds holiday service info from calendar_dates additions and removals', () => {
    const info = getHolidayServiceInfo({
      date: new Date('2026-07-01T09:00:00-04:00'),
      calendar,
      calendarDates: [
        { serviceId: weekdayServiceId, date: '20260701', exceptionType: 2 },
        { serviceId: sundayServiceId, date: '20260701', exceptionType: 1 },
      ],
      trips,
      routes,
      stopTimes,
    });

    expect(info).toMatchObject({
      dateKey: '20260701',
      status: 'holiday_service',
      title: 'Canada Day service',
      badgeLabel: 'Holiday service',
      activeRouteCount: 2,
    });
    expect(info.routes.map((route) => route.routeShortName)).toEqual(['2A', '8A']);
    expect(info.routes[0]).toMatchObject({
      firstTripLabel: '8:00 AM',
      lastTripLabel: '9:02 AM',
    });
  });

  test('reports no service when calendar_dates removes the only active service', () => {
    const info = getHolidayServiceInfo({
      date: new Date('2026-05-18T09:00:00-04:00'),
      calendar,
      calendarDates: [
        { serviceId: weekdayServiceId, date: '20260518', exceptionType: 2 },
      ],
      trips,
      routes,
    });

    expect(info).toMatchObject({
      status: 'no_service',
      title: 'Victoria Day service',
      badgeLabel: 'No service',
      activeRouteCount: 0,
    });
  });

  test('returns null on regular dates without calendar_dates exceptions', () => {
    expect(getHolidayServiceInfo({
      date: new Date('2026-05-19T09:00:00-04:00'),
      calendar,
      calendarDates: [],
      trips,
      routes,
    })).toBeNull();
  });

  test('names common Barrie holiday service dates for display only', () => {
    expect(getHolidayNameForDate(new Date('2026-08-03T09:00:00-04:00'))).toBe('Civic Holiday');
    expect(getHolidayNameForDate(new Date('2026-12-26T09:00:00-04:00'))).toBe('Boxing Day');
  });
});
