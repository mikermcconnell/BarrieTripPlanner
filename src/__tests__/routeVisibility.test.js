import {
  getVisibleRoutesForDate,
  filterRouteMappingToVisibleRoutes,
  isSpecialServiceRoute,
  routeHasServiceOnDate,
} from '../utils/routeVisibility';

const routes = [
  { id: '10', shortName: '10', longName: 'NORTH LOOP', desc: '' },
  { id: 'KP1', shortName: 'KP1', longName: 'Kempenfest Shuttle', desc: 'Kempenfest Shuttle' },
];

const trips = [
  { routeId: '10', serviceId: 'WEEKDAY', tripId: 'trip-10' },
  { routeId: 'KP1', serviceId: 'KEMPENFEST', tripId: 'trip-kp1' },
];

const calendar = [
  {
    serviceId: 'WEEKDAY',
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
    startDate: '20260628',
    endDate: '20261031',
  },
];

const calendarDates = [
  { serviceId: 'KEMPENFEST', date: '20260803', exceptionType: 1 },
  { serviceId: 'WEEKDAY', date: '20260803', exceptionType: 2 },
];

describe('routeVisibility', () => {
  test('hides future special-event shuttle routes from the regular route list', () => {
    const visibleRoutes = getVisibleRoutesForDate({
      routes,
      trips,
      calendar,
      calendarDates,
      date: new Date('2026-06-29T12:00:00-04:00'),
    });

    expect(visibleRoutes.map((route) => route.id)).toEqual(['10']);
  });

  test('shows special-event shuttles on the date they are scheduled', () => {
    const visibleRoutes = getVisibleRoutesForDate({
      routes,
      trips,
      calendar,
      calendarDates,
      date: new Date('2026-08-03T12:00:00-04:00'),
    });

    expect(visibleRoutes.map((route) => route.id)).toEqual(['KP1']);
    expect(visibleRoutes[0]).toMatchObject({
      id: 'KP1',
      isSpecialService: true,
      isActiveOnServiceDate: true,
    });
  });

  test('detects shuttle routes as special service', () => {
    expect(isSpecialServiceRoute(routes[1])).toBe(true);
    expect(isSpecialServiceRoute(routes[0])).toBe(false);
  });

  test('uses calendar_dates removals to block regular service', () => {
    expect(routeHasServiceOnDate({
      routeId: '10',
      trips,
      calendar,
      calendarDates,
      date: new Date('2026-08-03T12:00:00-04:00'),
    })).toBe(false);
  });

  test('filters route mappings to the visible route set', () => {
    const visibleRoutes = [{ id: '10' }];

    expect(filterRouteMappingToVisibleRoutes({
      mapping: {
        10: ['shape-10'],
        KP1: ['shape-kp1'],
      },
      visibleRoutes,
    })).toEqual({
      10: ['shape-10'],
    });
  });
});
