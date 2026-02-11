/**
 * Production-safe logger utility
 * Only logs in development mode (__DEV__), except for errors which always log.
 * In production, errors are captured by Sentry.
 */

import * as Sentry from '@sentry/react-native';

const noop = () => {};

const logger = {
  log: __DEV__ ? console.log.bind(console) : noop,
  warn: __DEV__ ? console.warn.bind(console) : noop,
  info: __DEV__ ? console.info.bind(console) : noop,
  debug: __DEV__ ? console.debug.bind(console) : noop,

  // Errors always log and report to Sentry in production
  error: (...args) => {
    console.error(...args);
    if (!__DEV__) {
      const firstArg = args[0];
      if (firstArg instanceof Error) {
        Sentry.captureException(firstArg);
      } else if (typeof firstArg === 'string') {
        Sentry.captureException(new Error(firstArg));
      }
    }
  },
};

export default logger;
