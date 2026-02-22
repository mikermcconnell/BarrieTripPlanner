/**
 * Production-safe logger utility
 * Only logs in development mode (__DEV__), except for errors which always log.
 * In production, errors are captured by Sentry.
 */

import * as Sentry from '@sentry/react-native';

const noop = () => {};
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

const logger = {
  log: IS_DEV ? console.log.bind(console) : noop,
  warn: IS_DEV ? console.warn.bind(console) : noop,
  info: IS_DEV ? console.info.bind(console) : noop,
  debug: IS_DEV ? console.debug.bind(console) : noop,

  // Errors always log and report to Sentry in production
  error: (...args) => {
    console.error(...args);
    if (!IS_DEV) {
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
