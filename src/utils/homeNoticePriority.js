export const getHomeNoticeVisibility = ({
  hasActiveDetour = false,
  officialImpactCount = 0,
  upcomingDetourCount = 0,
  hasHolidayNotice = false,
} = {}) => {
  const activeDetour = Boolean(hasActiveDetour);
  const official = !activeDetour && officialImpactCount > 0;
  const upcoming = !activeDetour && !official && upcomingDetourCount > 0;
  const holiday = !activeDetour && !official && !upcoming && Boolean(hasHolidayNotice);

  return { activeDetour, official, upcoming, holiday };
};
