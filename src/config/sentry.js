import * as Sentry from '@sentry/react-native';
import runtimeConfig from './runtimeConfig';

let initialized = false;

export const isSentryEnabled = Boolean(runtimeConfig.sentry.dsn)
  && !runtimeConfig.isDevelopment
  && !runtimeConfig.isTest;

export function initializeSentry() {
  if (!isSentryEnabled || initialized) {
    return false;
  }

  Sentry.init({
    dsn: runtimeConfig.sentry.dsn,
    enabled: true,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });

  initialized = true;
  return true;
}

export function wrapWithSentry(RootComponent) {
  return isSentryEnabled ? Sentry.wrap(RootComponent) : RootComponent;
}

