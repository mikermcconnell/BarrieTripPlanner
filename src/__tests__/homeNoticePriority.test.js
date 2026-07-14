import { getHomeNoticeVisibility } from '../utils/homeNoticePriority';

describe('home notice priority', () => {
  test('shows only the highest-priority rider notice', () => {
    expect(getHomeNoticeVisibility({
      hasActiveDetour: true,
      officialImpactCount: 1,
      upcomingDetourCount: 1,
      hasHolidayNotice: true,
    })).toEqual({ activeDetour: true, official: false, upcoming: false, holiday: false });

    expect(getHomeNoticeVisibility({
      officialImpactCount: 1,
      upcomingDetourCount: 1,
      hasHolidayNotice: true,
    })).toEqual({ activeDetour: false, official: true, upcoming: false, holiday: false });

    expect(getHomeNoticeVisibility({ hasHolidayNotice: true })).toEqual({
      activeDetour: false,
      official: false,
      upcoming: false,
      holiday: true,
    });
  });
});
