/**
 * Production-safe logger utility
 * Only logs in development mode (__DEV__), except for errors which always log.
 * In production, errors are captured by Sentry.
 */

import * as Sentry from '@sentry/react-native';

const noop = () => {};
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

const SAFE_ERROR_CODE = /^[A-Za-z0-9._/-]{1,80}$/;
const SAFE_LOG_CONTEXT = /^[A-Za-z][A-Za-z0-9 _-]{0,80}:?$/;

const getErrorLike = (args) => args.find((value) => (
  value instanceof Error
  || (value && typeof value === 'object'
    && (typeof value.message === 'string' || typeof value.code === 'string'))
));

const toCapturedError = (args) => {
  const errorLike = getErrorLike(args);
  if (errorLike instanceof Error) {
    return errorLike;
  }

  if (errorLike) {
    const message = String(errorLike.message || errorLike.code || 'Unknown error').trim();
    const error = new Error(message || 'Unknown error');
    if (typeof errorLike.name === 'string' && SAFE_ERROR_CODE.test(errorLike.name)) {
      error.name = errorLike.name;
    }
    if (typeof errorLike.code === 'string' && SAFE_ERROR_CODE.test(errorLike.code)) {
      error.code = errorLike.code;
    }
    return error;
  }

  const firstString = args.find((value) => typeof value === 'string' && value.trim());
  return firstString ? new Error(firstString) : null;
};

const captureProductionError = (args) => {
  const error = toCapturedError(args);
  if (!error) return;

  Sentry.withScope((scope) => {
    const context = typeof args[0] === 'string' ? args[0].trim() : '';
    if (context && SAFE_LOG_CONTEXT.test(context)) {
      scope.setTag('logger.context', context.replace(/:$/, ''));
    }

    const code = typeof error.code === 'string' ? error.code : '';
    if (code && SAFE_ERROR_CODE.test(code)) {
      scope.setTag('error.code', code);
    }

    Sentry.captureException(error);
  });
};

const logger = {
  log: IS_DEV ? console.log.bind(console) : noop,
  warn: IS_DEV ? console.warn.bind(console) : noop,
  info: IS_DEV ? console.info.bind(console) : noop,
  debug: IS_DEV ? console.debug.bind(console) : noop,

  // Errors always log and report to Sentry in production
  error: (...args) => {
    console.error(...args);
    if (!IS_DEV) {
      captureProductionError(args);
    }
  },
};

export default logger;
