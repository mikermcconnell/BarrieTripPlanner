const crypto = require('crypto');

const DEFAULT_LEASE_MS = 45 * 1000;
const LOCK_COLLECTION = 'systemLocks';
const LOCK_DOC_ID = 'detourRunOnce';

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createDetourRunLock({
  db,
  leaseMs = DEFAULT_LEASE_MS,
} = {}) {
  if (!db || typeof db.runTransaction !== 'function') {
    return null;
  }

  const lockRef = db.collection(LOCK_COLLECTION).doc(LOCK_DOC_ID);

  async function acquire({ holder = 'detour-run-once', nowMs = Date.now() } = {}) {
    const leaseToken = crypto.randomUUID();
    const leaseExpiresAtMs = nowMs + leaseMs;

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(lockRef);
      const data = snapshot.exists ? snapshot.data() : null;
      const existingExpiryMs = timestampToMillis(data?.leaseExpiresAt) || data?.leaseExpiresAtMs || 0;

      if (data?.locked === true && existingExpiryMs > nowMs) {
        return null;
      }

      const lease = {
        holder,
        leaseToken,
        acquiredAtMs: nowMs,
        leaseExpiresAtMs,
      };

      transaction.set(lockRef, {
        locked: true,
        holder,
        leaseToken,
        acquiredAt: new Date(nowMs),
        acquiredAtMs: nowMs,
        leaseExpiresAt: new Date(leaseExpiresAtMs),
        leaseExpiresAtMs,
      }, { merge: true });

      return lease;
    });
  }

  async function release(lease) {
    if (!lease?.holder || !lease?.leaseToken) return false;

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(lockRef);
      const data = snapshot.exists ? snapshot.data() : null;

      if (data?.holder !== lease.holder || data?.leaseToken !== lease.leaseToken) {
        return false;
      }

      transaction.update(lockRef, {
        locked: false,
        releasedAt: new Date(),
        releasedBy: lease.holder,
      });
      return true;
    });
  }

  return { acquire, release };
}

module.exports = {
  createDetourRunLock,
  DEFAULT_LEASE_MS,
};
