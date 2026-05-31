'use strict';

function getDetectorForStorageConfig(storageConfig = {}) {
  return storageConfig.detourVersion === 'v2'
    ? require('../detourV2/workerAdapter')
    : require('../detourDetector');
}

module.exports = {
  getDetectorForStorageConfig,
};
