const { createDetourRunLock } = require('../services/detourRunLock');

function makeTimestamp(ms) {
  return { toMillis: () => ms };
}

function makeDb(initial = null) {
  const store = { data: initial, writes: [] };
  const ref = { id: 'detourRunOnce' };
  return {
    store,
    collection: jest.fn(() => ({ doc: jest.fn(() => ref) })),
    runTransaction: jest.fn(async (fn) => {
      const transaction = {
        get: jest.fn(async () => ({ exists: Boolean(store.data), data: () => store.data })),
        set: jest.fn((_ref, data) => { store.data = { ...(store.data || {}), ...data }; store.writes.push({ type: 'set', data }); }),
        update: jest.fn((_ref, data) => { store.data = { ...(store.data || {}), ...data }; store.writes.push({ type: 'update', data }); }),
      };
      return fn(transaction);
    }),
  };
}

describe('detourRunLock', () => {
  test('acquires the lock when no live lease exists', async () => {
    const db = makeDb();
    const lock = createDetourRunLock({ db, leaseMs: 45000 });

    const lease = await lock.acquire({ holder: 'scheduler-primary', nowMs: 1000 });

    expect(lease).toEqual(expect.objectContaining({ holder: 'scheduler-primary' }));
    expect(db.store.data).toMatchObject({
      locked: true,
      holder: 'scheduler-primary',
      leaseExpiresAtMs: 46000,
    });
  });

  test('skips acquisition while another lease is still active', async () => {
    const db = makeDb({ locked: true, holder: 'other', leaseExpiresAt: makeTimestamp(60000) });
    const lock = createDetourRunLock({ db, leaseMs: 45000 });

    const lease = await lock.acquire({ holder: 'scheduler-primary', nowMs: 1000 });

    expect(lease).toBeNull();
    expect(db.store.writes).toHaveLength(0);
  });

  test('releases only the matching holder lease', async () => {
    const db = makeDb({ locked: true, holder: 'scheduler-primary', leaseToken: 'abc' });
    const lock = createDetourRunLock({ db, leaseMs: 45000 });

    await lock.release({ holder: 'scheduler-primary', leaseToken: 'abc' });

    expect(db.store.data).toMatchObject({ locked: false, releasedBy: 'scheduler-primary' });
  });
});
