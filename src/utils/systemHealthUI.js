import { COLORS } from '../config/theme';

export const getSystemHealthChipState = (diagnostics) => {
  if (!diagnostics) {
    return {
      label: 'INIT',
      accessibilityLabel: 'System health unavailable',
      backgroundColor: COLORS.grey100,
      dotColor: COLORS.grey500,
      textColor: COLORS.textSecondary,
    };
  }

  const { overall, proxyApi, staticData, realtimeVehicles } = diagnostics;

  if (overall?.status === 'offline') {
    return {
      label: 'OFFLINE',
      accessibilityLabel: 'System health offline',
      backgroundColor: COLORS.grey100,
      dotColor: COLORS.grey500,
      textColor: COLORS.grey600,
    };
  }

  if (proxyApi?.status === 'error') {
    return {
      label: 'PROXY',
      accessibilityLabel: 'System health degraded, API proxy unavailable',
      backgroundColor: COLORS.errorSubtle,
      dotColor: COLORS.error,
      textColor: COLORS.error,
    };
  }

  if (proxyApi?.status === 'degraded') {
    return {
      label: 'PROXY',
      accessibilityLabel: 'System health degraded, API proxy is stale',
      backgroundColor: COLORS.warningSubtle,
      dotColor: COLORS.warning,
      textColor: COLORS.warning,
    };
  }

  if (staticData?.usingCachedData) {
    return {
      label: 'CACHED',
      accessibilityLabel: 'System health degraded, using cached static transit data',
      backgroundColor: COLORS.warningSubtle,
      dotColor: COLORS.warning,
      textColor: COLORS.warning,
    };
  }

  if (realtimeVehicles?.status === 'degraded' || realtimeVehicles?.status === 'error') {
    return {
      label: 'REALTIME',
      accessibilityLabel: 'System health degraded, realtime vehicle feed is stale or unavailable',
      backgroundColor: COLORS.warningSubtle,
      dotColor: COLORS.warning,
      textColor: COLORS.warning,
    };
  }

  if (overall?.status === 'error') {
    return {
      label: 'ISSUE',
      accessibilityLabel: 'System health error',
      backgroundColor: COLORS.errorSubtle,
      dotColor: COLORS.error,
      textColor: COLORS.error,
    };
  }

  if (overall?.status === 'degraded') {
    return {
      label: 'PARTIAL',
      accessibilityLabel: 'System health partially degraded',
      backgroundColor: COLORS.warningSubtle,
      dotColor: COLORS.warning,
      textColor: COLORS.warning,
    };
  }

  return {
    label: 'OK',
    accessibilityLabel: 'System health healthy',
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

  if (overall?.status === 'offline') {
    return {
      tone: 'neutral',
      message: 'Offline mode is active. Cached transit data may be limited.',
      actionLabel: null,
      actionKey: null,
    };
  }

  if (proxyApi?.status === 'error') {
    return {
      tone: 'error',
      message: 'Trip backend is unavailable right now.',
      actionLabel: 'Retry backend',
      actionKey: 'proxy',
    };
  }

  if (proxyApi?.status === 'degraded') {
    return {
      tone: 'warning',
      message: 'Trip backend status is stale.',
      actionLabel: 'Refresh backend',
      actionKey: 'proxy',
    };
  }

  if (staticData?.status === 'error') {
    return {
      tone: 'error',
      message: 'Transit data could not be loaded.',
      actionLabel: 'Retry data',
      actionKey: 'static',
    };
  }

  if (staticData?.usingCachedData) {
    return {
      tone: 'warning',
      message: 'Using cached transit data while fresh data reloads.',
      actionLabel: 'Refresh data',
      actionKey: 'static',
    };
  }

  if (realtimeVehicles?.status === 'error') {
    return {
      tone: 'warning',
      message: 'Live vehicle positions are unavailable.',
      actionLabel: 'Retry live data',
      actionKey: 'realtime',
    };
  }

  if (realtimeVehicles?.status === 'degraded') {
    return {
      tone: 'warning',
      message: 'Live vehicle positions may be stale.',
      actionLabel: 'Refresh live data',
      actionKey: 'realtime',
    };
  }

  return null;
};
