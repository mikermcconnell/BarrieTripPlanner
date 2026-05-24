const SETTLED_STATUSES = new Set(['healthy', 'degraded', 'error', 'offline']);

export const getAppStartupState = ({
  fontsLoaded = false,
  authLoading = false,
  isLoadingStatic = false,
  staticError = null,
  routesCount = 0,
  stopsCount = 0,
  isOffline = false,
  isRoutingReady = false,
  lastVehicleUpdate = null,
  vehicleError = null,
  hasLoadedServiceAlerts = false,
  hasLoadedDetourFeed = false,
  diagnostics = null,
  optionalWaitElapsed = false,
} = {}) => {
  const hasStaticData = routesCount > 0 && stopsCount > 0;
  const staticSettled = !isLoadingStatic && (hasStaticData || Boolean(staticError));
  const shouldWaitForStartupServices = staticSettled && hasStaticData && !staticError && !isOffline;
  const routingStatus = diagnostics?.routing?.status || 'idle';
  const realtimeStatus = diagnostics?.realtimeVehicles?.status || 'idle';
  const proxyStatus = diagnostics?.proxyApi?.status || 'idle';

  const routingSettled =
    !shouldWaitForStartupServices ||
    isRoutingReady ||
    SETTLED_STATUSES.has(routingStatus);
  const realtimeSettled =
    !shouldWaitForStartupServices ||
    Boolean(lastVehicleUpdate) ||
    Boolean(vehicleError) ||
    SETTLED_STATUSES.has(realtimeStatus);
  const proxySettled =
    !shouldWaitForStartupServices ||
    SETTLED_STATUSES.has(proxyStatus);
  const serviceAlertsSettled = !shouldWaitForStartupServices || hasLoadedServiceAlerts;
  const detoursSettled = !shouldWaitForStartupServices || hasLoadedDetourFeed;

  const criticalReady =
    fontsLoaded &&
    !authLoading &&
    staticSettled;
  const optionalReady =
    routingSettled &&
    realtimeSettled &&
    proxySettled &&
    serviceAlertsSettled &&
    detoursSettled;

  if (!fontsLoaded) {
    return {
      ready: false,
      percent: 18,
      title: 'Getting Barrie Transit ready',
      detail: 'Loading app fonts and assets.',
      statusText: 'Loading app fonts and assets...',
    };
  }

  if (authLoading) {
    return {
      ready: false,
      percent: 30,
      title: 'Getting Barrie Transit ready',
      detail: 'Checking saved profile and preferences.',
      statusText: 'Checking saved profile and preferences...',
    };
  }

  if (!staticSettled) {
    return {
      ready: false,
      percent: 42,
      title: 'Getting Barrie Transit ready',
      detail: isOffline
        ? 'Looking for saved transit data.'
        : 'Loading routes, stops, and schedules.',
      statusText: isOffline
        ? 'Looking for saved transit data...'
        : 'Loading routes, stops, and schedules...',
    };
  }

  if (!criticalReady) {
    return {
      ready: false,
      percent: 50,
      title: 'Getting Barrie Transit ready',
      detail: 'Finishing startup.',
      statusText: 'Finishing startup...',
    };
  }

  if (staticError && !hasStaticData) {
    return {
      ready: true,
      percent: 100,
      title: 'Opening Barrie Transit',
      detail: 'Opening the app.',
      statusText: 'Opening the app...',
    };
  }

  if (!optionalReady && !optionalWaitElapsed) {
    if (!routingSettled) {
      return {
        ready: false,
        percent: 62,
        title: 'Getting Barrie Transit ready',
        detail: 'Preparing trip planning.',
        statusText: 'Preparing trip planning...',
      };
    }

    if (!realtimeSettled) {
      return {
        ready: false,
        percent: 76,
        title: 'Getting Barrie Transit ready',
        detail: 'Loading live bus locations.',
        statusText: 'Loading live bus locations...',
      };
    }

    if (!serviceAlertsSettled) {
      return {
        ready: false,
        percent: 84,
        title: 'Getting Barrie Transit ready',
        detail: 'Checking service alerts.',
        statusText: 'Checking service alerts...',
      };
    }

    if (!detoursSettled) {
      return {
        ready: false,
        percent: 92,
        title: 'Getting Barrie Transit ready',
        detail: 'Checking detour updates.',
        statusText: 'Checking detour updates...',
      };
    }

    return {
      ready: false,
      percent: 96,
      title: 'Getting Barrie Transit ready',
      detail: 'Checking trip planning connection.',
      statusText: 'Checking trip planning connection...',
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
