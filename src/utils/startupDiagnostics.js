let firstFatal = null;
let uninstallGlobalHandler = null;

const toSafeString = (value) => {
  if (!value) return null;
  return String(value);
};

export const recordStartupFatal = ({ error, componentStack = null, origin = 'unknown' } = {}) => {
  if (firstFatal) {
    return firstFatal;
  }

  firstFatal = {
    at: new Date().toISOString(),
    origin,
    message: toSafeString(error?.message) || toSafeString(error) || 'Unknown fatal error',
    stack: toSafeString(error?.stack),
    componentStack: toSafeString(componentStack),
  };

  return firstFatal;
};

export const getStartupFatal = () => firstFatal;

export const clearStartupFatal = () => {
  firstFatal = null;
};

export const installStartupDiagnostics = () => {
  if (uninstallGlobalHandler) {
    return uninstallGlobalHandler;
  }

  const errorUtils = global?.ErrorUtils;
  if (
    !errorUtils ||
    typeof errorUtils.getGlobalHandler !== 'function' ||
    typeof errorUtils.setGlobalHandler !== 'function'
  ) {
    return () => {};
  }

  const previousHandler = errorUtils.getGlobalHandler();

  const wrappedHandler = (error, isFatal) => {
    if (isFatal !== false) {
      recordStartupFatal({ error, origin: 'global' });
    }

    if (typeof previousHandler === 'function') {
      previousHandler(error, isFatal);
    }
  };

  errorUtils.setGlobalHandler(wrappedHandler);

  uninstallGlobalHandler = () => {
    if (typeof previousHandler === 'function') {
      errorUtils.setGlobalHandler(previousHandler);
    }
    uninstallGlobalHandler = null;
  };

  return uninstallGlobalHandler;
};

