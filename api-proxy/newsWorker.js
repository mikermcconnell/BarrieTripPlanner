const { fetchNewsItems } = require('./newsFetcher');
const { publishNews, getKnownNewsIds } = require('./newsPublisher');
const { notifyUsersOfNews } = require('./pushNotifier');

const TICK_INTERVAL = 15 * 60 * 1000; // 15 minutes

let interval = null;
let running = false;
let tickCount = 0;
let lastSuccessfulTick = null;
let consecutiveFailureCount = 0;
let tickInProgress = false;
let lastItemCount = 0;

async function tick() {
  if (tickInProgress) return;
  tickInProgress = true;
  try {
    const items = await fetchNewsItems();
    const newItems = await publishNews(items);

    if (newItems.length > 0) {
      await notifyUsersOfNews(newItems);
    }

    lastItemCount = items.length;
    tickCount++;
    lastSuccessfulTick = new Date().toISOString();
    consecutiveFailureCount = 0;
    console.log(
      `[newsWorker] tick #${tickCount}: ${items.length} items, ${newItems.length} new`
    );
  } catch (err) {
    consecutiveFailureCount++;
    console.error(
      `[newsWorker] tick failed (${consecutiveFailureCount} consecutive):`,
      err.message
    );
  } finally {
    tickInProgress = false;
  }
}

function start() {
  if (interval) return;
  running = true;
  console.log('[newsWorker] Starting news polling loop (15min interval)');
  tick();
  interval = setInterval(tick, TICK_INTERVAL);
}

function stop() {
  if (interval) clearInterval(interval);
  interval = null;
  running = false;
  console.log('[newsWorker] Stopped');
}

function getStatus() {
  return {
    running,
    tickCount,
    lastSuccessfulTick,
    consecutiveFailureCount,
    lastItemCount,
    knownNewsIds: [...getKnownNewsIds()],
  };
}

module.exports = { start, stop, getStatus };
