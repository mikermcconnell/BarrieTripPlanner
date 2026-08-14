export const getHomeNoticeVisibility = ({
  hasActiveDetour = false,
  officialImpactCount = 0,
  upcomingDetourCount = 0,
  hasHolidayNotice = false,
} = {}) => {
  const activeDetour = Boolean(hasActiveDetour);
  const official = !activeDetour && officialImpactCount > 0;
  const upcoming = !activeDetour && !official && upcomingDetourCount > 0;
  // Schedule changes and detours answer different rider questions, so keep the
  // holiday notice available alongside the highest-priority detour notice.
  const holiday = Boolean(hasHolidayNotice);

  return { activeDetour, official, upcoming, holiday };
};
