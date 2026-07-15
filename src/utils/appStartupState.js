export const getAppStartupState = ({
  isLoadingStatic = false,
  staticError = null,
  routesCount = 0,
  stopsCount = 0,
  isOffline = false,
} = {}) => {
  const hasStaticData = routesCount > 0 && stopsCount > 0;
  const staticSettled = !isLoadingStatic && (hasStaticData || Boolean(staticError));

  if (!staticSettled) {
    return {
      ready: false,
      percent: 55,
      title: 'Getting Barrie Transit ready',
      detail: isOffline
        ? 'Looking for saved transit data.'
        : 'Loading routes, stops, and schedules.',
      statusText: isOffline
        ? 'Looking for saved transit data...'
        : 'Loading routes, stops, and schedules...',
    };
  }

  return {
    ready: true,
    percent: 100,
    title: 'Opening Barrie Transit',
    detail: 'Opening the app.',
    statusText: 'Opening the app...',
  };
};
