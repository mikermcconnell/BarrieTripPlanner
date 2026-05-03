jest.mock('../newsFetcher', () => ({
  fetchNewsItems: jest.fn(),
}));

jest.mock('../newsPublisher', () => ({
  publishNews: jest.fn(),
  getKnownNewsIds: jest.fn(() => new Set(['1642'])),
}));

jest.mock('../pushNotifier', () => ({
  notifyUsersOfNews: jest.fn(),
}));

jest.mock('../newsImpactPublisher', () => ({
  publishNewsImpacts: jest.fn(() => Promise.resolve([])),
}));

const { fetchNewsItems } = require('../newsFetcher');
const { publishNews } = require('../newsPublisher');
const { notifyUsersOfNews } = require('../pushNotifier');
const { publishNewsImpacts } = require('../newsImpactPublisher');
const newsWorker = require('../newsWorker');

describe('newsWorker', () => {
  afterEach(() => {
    newsWorker.stop();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('reports a six-hour polling interval', () => {
    expect(newsWorker.getStatus().tickIntervalMs).toBe(6 * 60 * 60 * 1000);
  });

  test('start schedules polling every six hours and runs an initial tick', () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    fetchNewsItems.mockResolvedValue([]);
    publishNews.mockResolvedValue([]);

    newsWorker.start();

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 6 * 60 * 60 * 1000);
    expect(fetchNewsItems).toHaveBeenCalledTimes(1);
  });

  test('tick publishes fetched items and notifies for new items', async () => {
    const item = { id: '1642', title: 'Transit update' };
    fetchNewsItems.mockResolvedValue([item]);
    publishNews.mockResolvedValue([item]);

    await newsWorker.tick();

    expect(publishNews).toHaveBeenCalledWith([item]);
    expect(publishNewsImpacts).toHaveBeenCalledWith([item]);
    expect(notifyUsersOfNews).toHaveBeenCalledWith([item]);
  });
});
