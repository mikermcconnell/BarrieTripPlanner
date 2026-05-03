const runtimeStatus = {
  lastTask: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
  successCount: 0,
  failureCount: 0,
};

function recordAiSuccess(taskName) {
  runtimeStatus.lastTask = taskName || null;
  runtimeStatus.lastSuccessAt = new Date().toISOString();
  runtimeStatus.lastError = null;
  runtimeStatus.successCount += 1;
}

function recordAiFailure(taskName, error) {
  runtimeStatus.lastTask = taskName || null;
  runtimeStatus.lastFailureAt = new Date().toISOString();
  runtimeStatus.lastError = error ? String(error.message || error) : 'Unknown AI error';
  runtimeStatus.failureCount += 1;
}

function getAiRuntimeStatus() {
  return { ...runtimeStatus };
}

module.exports = {
  recordAiSuccess,
  recordAiFailure,
  getAiRuntimeStatus,
};
