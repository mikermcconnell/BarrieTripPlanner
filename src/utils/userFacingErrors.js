const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const messageFromError = (error) => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  return '';
};

const codeFromError = (error) => {
  if (!error || typeof error === 'string') return '';
  return String(error.code || error.name || '');
};

const isTechnicalMessage = (message) => {
  if (!message) return true;
  return [
    /^Firebase:/i,
    /^Error:/i,
    /^TypeError:/i,
    /^ReferenceError:/i,
    /^SyntaxError:/i,
    /permission-denied/i,
    /missing or insufficient permissions/i,
    /network-request-failed/i,
    /failed to fetch/i,
    /undefined is not/i,
    /null is not/i,
    /not a function/i,
    /stack trace/i,
  ].some((pattern) => pattern.test(message));
};

export const getUserFacingErrorMessage = (error, fallback = DEFAULT_ERROR_MESSAGE) => {
  const code = codeFromError(error).toLowerCase();
  const message = messageFromError(error).trim();
  const combined = `${code} ${message}`.toLowerCase();

  if (/permission[- ]denied|insufficient permissions|forbidden|unauthorized/.test(combined)) {
    return 'You do not have permission to do that. Sign in and try again.';
  }

  if (/unauthenticated|auth\/user-token-expired|auth\/requires-recent-login/.test(combined)) {
    return 'Please sign in again, then try once more.';
  }

  if (/network|offline|failed to fetch|timeout|timed out|unavailable/.test(combined)) {
    return 'Check your connection, then try again.';
  }

  if (/quota|resource-exhausted|too many requests/.test(combined)) {
    return 'Too many requests right now. Please wait a moment and try again.';
  }

  if (message && !isTechnicalMessage(message) && message.length <= 180) {
    return message;
  }

  return fallback;
};

export default getUserFacingErrorMessage;
