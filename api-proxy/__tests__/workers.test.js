const {
  getNewsWorkerMode,
  startWorkers,
} = require('../runtime/workers');

describe('runtime workers', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('uses scheduled news mode when configured', () => {
    expect(getNewsWorkerMode({ NEWS_WORKER_MODE: 'scheduled' })).toBe('scheduled');
  });

  test('does not start the news interval loop in scheduled mode', () => {
    const detourStart = jest.fn();
    const newsStart = jest.fn();

    process.env = {
      ...ORIGINAL_ENV,
      DETOUR_WORKER_MODE: 'scheduled',
      NEWS_WORKER_MODE: 'scheduled',
    };

    startWorkers({
      detourWorker: { start: detourStart },
      newsWorker: { start: newsStart },
    });

    expect(detourStart).not.toHaveBeenCalled();
    expect(newsStart).not.toHaveBeenCalled();
  });
});
