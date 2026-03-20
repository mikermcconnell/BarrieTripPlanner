import { COLORS } from '../config/theme';

const getSavedStaticState = (staticData = {}) => {
  const hasSavedData = Boolean(staticData?.isAvailable);
  const isRefreshingSavedData = Boolean(
    staticData?.isRefreshing &&
    staticData?.usingCachedData &&
    hasSavedData
  );

  return {
    hasSavedData,
    isRefreshingSavedData,
  };
};

export const getTransitLoadingState = (diagnostics) => {
  if (!diagnostics) {
    return {
      title: 'Starting Barrie Transit',
      detail: 'Loading routes, stops, and schedules.',
    };
  }

  const { overall, staticData } = diagnostics;
  const { hasSavedData, isRefreshingSavedData } = getSavedStaticState(staticData);

  if (staticData?.status === 'loading' && !hasSavedData) {
    if (overall?.status === 'offline' || staticData?.isOffline) {
      return {
        title: 'Internet connection needed',
        detail: 'Connect once to download Barrie Transit routes and stops.',
      };
    }

    return {
      title: 'Getting Barrie Transit ready',
      detail: 'Downloading routes and stops for the first time.',
    };
  }

  if (isRefreshingSavedData) {
    return {
      title: 'Opening with saved transit info',
      detail: 'Checking for updates in the background.',
    };
  }

  if (overall?.status === 'offline' && hasSavedData) {
    return {
      title: "You're offline",
      detail: 'Showing the last saved routes, stops, and schedules.',
    };
  }

  return null;
};

export const getSystemHealthChipState = (diagnostics) => {
  if (!diagnostics) {
    return {
      label: 'LOADING',
      accessibilityLabel: 'Transit status loading',
      backgroundColor: COLORS.grey100,
      dotColor: COLORS.grey500,
      textColor: COLORS.textSecondary,
    };
  }

  const { overall, proxyApi, staticData, realtimeVehicles } = diagnostics;
  const { isRefreshingSavedData } = getSavedStaticState(staticData);

  if (overall?.status === 'offline') {
    return {
      label: 'OFFLINE',
      accessibilityLabel: 'Transit status offline',
      backgroundColor: COLORS.grey100,
      dotColor: COLORS.grey500,
      textColor: COLORS.grey600,
    };
  }

  if (isRefreshingSavedData) {
    return {
      label: 'UPDATING',
      accessibilityLabel: 'Transit status updating saved transit information',
      backgroundColor: COLORS.grey100,
      dotColor: COLORS.primary,
      textColor: COLORS.textPrimary,
    };
  }

  if (staticData?.usingCachedData) {
    return {
      label: 'SAVED',
      accessibilityLabel: 'Transit status showing saved transit information',
      backgroundColor: COLORS.warningSubtle,
      dotColor: COLORS.warning,
      textColor: COLORS.warning,
    };
  }

  if (proxyApi?.status === 'error' || proxyApi?.status === 'degraded') {
    return {
      label: 'TRIPS',
      accessibilityLabel: 'Transit status trip planning issue',
      backgroundColor: proxyApi?.status === 'error' ? COLORS.errorSubtle : COLORS.warningSubtle,
      dotColor: proxyApi?.status === 'error' ? COLORS.error : COLORS.warning,
      textColor: proxyApi?.status === 'error' ? COLORS.error : COLORS.warning,
    };
  }

  if (realtimeVehicles?.status === 'degraded' || realtimeVehicles?.status === 'error') {
    return {
      label: 'LIVE',
      accessibilityLabel: 'Transit status live bus locations delayed',
      backgroundColor: COLORS.warningSubtle,
      dotColor: COLORS.warning,
      textColor: COLORS.warning,
    };
  }

  if (overall?.status === 'error') {
    return {
      label: 'ISSUE',
      accessibilityLabel: 'Transit status issue',
      backgroundColor: COLORS.errorSubtle,
      dotColor: COLORS.error,
      textColor: COLORS.error,
    };
  }

  if (overall?.status === 'degraded') {
    return {
      label: 'NOTICE',
      accessibilityLabel: 'Transit status notice',
      backgroundColor: COLORS.warningSubtle,
      dotColor: COLORS.warning,
      textColor: COLORS.warning,
    };
  }

  return {
    label: 'READY',
    accessibilityLabel: 'Transit status ready',
    backgroundColor: COLORS.successSubtle,
    dotColor: COLORS.success,
    textColor: COLORS.success,
  };
};

export const getSystemHealthBannerState = (diagnostics) => {
  if (!diagnostics) {
    return null;
  }

  const { overall, proxyApi, staticData, realtimeVehicles } = diagnostics;
  const { hasSavedData, isRefreshingSavedData } = getSavedStaticState(staticData);

  if (overall?.status === 'offline' && hasSavedData) {
    return {
      tone: 'neutral',
      title: "You're offline",
      detail: 'Showing the last saved routes, stops, and schedules.',
      actionLabel: null,
      actionKey: null,
    };
  }

  if (proxyApi?.status === 'error') {
    return {
      tone: 'error',
      title: 'Trip planning is unavailable right now.',
      detail: 'Routes and stops are still available, but new trip searches may fail.',
      actionLabel: 'Try again',
      actionKey: 'proxy',
    };
  }

  if (proxyApi?.status === 'degraded') {
    return {
      tone: 'warning',
      title: 'Trip planning may be delayed.',
      detail: 'The planner is checking its connection.',
      actionLabel: 'Refresh trips',
      actionKey: 'proxy',
    };
  }

  if (staticData?.status === 'error') {
    return {
      tone: 'error',
      title: 'Transit info could not be loaded.',
      detail: staticData?.isOffline
        ? 'Connect once to download Barrie Transit routes and stops.'
        : 'Please try loading routes and stops again.',
      actionLabel: 'Retry data',
      actionKey: 'static',
    };
  }

  if (isRefreshingSavedData) {
    return {
      tone: 'neutral',
      title: 'Opening with saved transit info',
      detail: 'Checking for updates in the background.',
      actionLabel: null,
      actionKey: null,
    };
  }

  if (staticData?.usingCachedData) {
    return {
      tone: 'warning',
      title: 'Showing saved transit info',
      detail: "Couldn't update just now, but the map is ready to use.",
      actionLabel: 'Refresh now',
      actionKey: 'static',
    };
  }

  if (realtimeVehicles?.status === 'error') {
    return {
      tone: 'warning',
      title: 'Live bus locations are unavailable.',
      detail: 'Schedules and stop info are still available.',
      actionLabel: 'Retry live buses',
      actionKey: 'realtime',
    };
  }

  if (realtimeVehicles?.status === 'degraded') {
    return {
      tone: 'warning',
      title: 'Live bus locations may be delayed.',
      detail: 'Bus markers may update more slowly than usual.',
      actionLabel: 'Refresh live buses',
      actionKey: 'realtime',
    };
  }

  return null;
};
