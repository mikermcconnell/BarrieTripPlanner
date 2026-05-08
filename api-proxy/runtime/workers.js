function getDetourWorkerMode(env = process.env) {
  return String(env.DETOUR_WORKER_MODE || 'interval').trim().toLowerCase();
}

function getNewsWorkerMode(env = process.env) {
  return String(env.NEWS_WORKER_MODE || 'interval').trim().toLowerCase();
}

function startWorkers({ detourWorker = null, newsWorker = null } = {}) {
  if (detourWorker && getDetourWorkerMode() === 'interval') {
    detourWorker.start();
  }
  if (newsWorker && getNewsWorkerMode() === 'interval') {
    newsWorker.start();
  }
}

function stopWorkers({ detourWorker = null, newsWorker = null } = {}) {
  if (detourWorker) {
    detourWorker.stop();
  }
  if (newsWorker) {
    newsWorker.stop();
  }
}

function maybeStartCloudWorkers(workers = {}, env = process.env) {
  if (
    env.NODE_ENV !== 'test' &&
    env.K_SERVICE &&
    (getDetourWorkerMode(env) === 'interval' || getNewsWorkerMode(env) === 'interval')
  ) {
    startWorkers(workers);
  }
}

module.exports = {
  startWorkers,
  stopWorkers,
  maybeStartCloudWorkers,
  getDetourWorkerMode,
  getNewsWorkerMode,
};
