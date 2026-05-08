export const shouldShowMainMapFloatingControls = ({
  isTripPlanningMode,
  isRouteFilterSheetOpen,
  startupVariant,
}) => (
  !isTripPlanningMode &&
  !isRouteFilterSheetOpen &&
  startupVariant !== 'full'
);

