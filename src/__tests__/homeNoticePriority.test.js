import { getHomeNoticeVisibility } from '../utils/homeNoticePriority';

describe('home notice priority', () => {
  test('shows the highest-priority detour notice while retaining holiday service information', () => {
    expect(getHomeNoticeVisibility({
      hasActiveDetour: true,
      officialImpactCount: 1,
      upcomingDetourCount: 1,
      hasHolidayNotice: true,
    })).toEqual({ activeDetour: true, official: false, upcoming: false, holiday: true });

    expect(getHomeNoticeVisibility({
      officialImpactCount: 1,
      upcomingDetourCount: 1,
      hasHolidayNotice: true,
    })).toEqual({ activeDetour: false, official: true, upcoming: false, holiday: true });

    expect(getHomeNoticeVisibility({ hasHolidayNotice: true })).toEqual({
      activeDetour: false,
      official: false,
      upcoming: false,
      holiday: true,
    });
  });
});
