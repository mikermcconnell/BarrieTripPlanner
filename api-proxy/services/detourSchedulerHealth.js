function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') {
    const dateValue = value.toDate();
    return dateValue instanceof Date ? dateValue.getTime() : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function getStatus(entry) {
  const parsed = Number.parseInt(String(entry?.status ?? entry?.httpRequest?.status ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTimestamp(entry) {
  return toMillis(entry?.timestamp ?? entry?.time ?? entry?.occurredAt);
}

function isSchedulerEntry(entry) {
  const userAgent = String(entry?.userAgent ?? entry?.httpRequest?.userAgent ?? '');
  return !userAgent || userAgent.includes('Google-Cloud-Scheduler');
}

function getRecentSchedulerEntries(logEntries = [], now = Date.now(), lookbackMs = 10 * 60 * 1000) {
  const cutoff = now - lookbackMs;
  return (logEntries || [])
    .filter((entry) => {
      const timestampMs = getTimestamp(entry);
      return Number.isFinite(timestampMs) && timestampMs >= cutoff && timestampMs <= now && isSchedulerEntry(entry);
    })
    .map((entry) => ({
      timestampMs: getTimestamp(entry),
      status: getStatus(entry),
    }))
    .filter((entry) => Number.isFinite(entry.status));
}

function getActiveDetourFreshness(activeDetours = {}, now = Date.now(), maxAgeMs = 15 * 60 * 1000) {
  const entries = Object.entries(activeDetours || {});
  if (entries.length === 0) {
    return {
      ok: true,
      reason: 'no-active-detours',
      activeDetourCount: 0,
      staleRoutes: [],
      ageMs: null,
    };
  }

  const routeAges = entries.map(([routeId, detour]) => {
    const updatedAtMs = toMillis(detour?.updatedAt);
    return {
      routeId,
      updatedAtMs,
      ageMs: Number.isFinite(updatedAtMs) ? now - updatedAtMs : null,
    };
  });
  const staleRoutes = routeAges
    .filter((item) => !Number.isFinite(item.ageMs) || item.ageMs > maxAgeMs)
    .map((item) => item.routeId);
  const oldestAgeMs = routeAges.reduce((max, item) => (
    Number.isFinite(item.ageMs) ? Math.max(max, item.ageMs) : max
  ), 0);

  return {
    ok: staleRoutes.length === 0,
    reason: staleRoutes.length === 0 ? 'fresh' : 'stale-active-detours',
    activeDetourCount: entries.length,
    staleRoutes,
    ageMs: oldestAgeMs,
    maxAgeMs,
  };
}

function evaluateDetourSchedulerHealth({
  now = Date.now(),
  lookbackMs = 10 * 60 * 1000,
  tokenMatch = false,
  logEntries = [],
  activeDetours = {},
  maxActiveDetourAgeMs = 15 * 60 * 1000,
  enforceActiveDetourFreshness = true,
} = {}) {
  const recentEntries = getRecentSchedulerEntries(logEntries, now, lookbackMs);
  const recentSuccesses = recentEntries.filter((entry) => entry.status >= 200 && entry.status < 300);
  const recent401s = recentEntries.filter((entry) => entry.status === 401);
  const activeDetoursFresh = enforceActiveDetourFreshness
    ? getActiveDetourFreshness(activeDetours, now, maxActiveDetourAgeMs)
    : {
      ok: true,
      reason: 'skipped',
      activeDetourCount: Object.keys(activeDetours || {}).length,
      staleRoutes: [],
      ageMs: null,
    };

  const checks = {
    schedulerTokenMatches: {
      ok: tokenMatch === true,
      reason: tokenMatch === true ? 'matching-token' : 'token-mismatch',
    },
    recentSchedulerSuccess: {
      ok: recentSuccesses.length > 0,
      reason: recentSuccesses.length > 0 ? 'recent-2xx' : 'no-recent-2xx',
      count: recentSuccesses.length,
      latestAt: recentSuccesses.reduce((latest, entry) => Math.max(latest, entry.timestampMs), 0) || null,
    },
    noRecentScheduler401: {
      ok: recent401s.length === 0,
      reason: recent401s.length === 0 ? 'none' : 'recent-401',
      count: recent401s.length,
      latestAt: recent401s.reduce((latest, entry) => Math.max(latest, entry.timestampMs), 0) || null,
    },
    activeDetoursFresh,
  };

  return {
    ok: Object.values(checks).every((check) => check.ok === true),
    checkedAt: now,
    lookbackMs,
    checks,
  };
}

module.exports = {
  evaluateDetourSchedulerHealth,
  getActiveDetourFreshness,
  getRecentSchedulerEntries,
  toMillis,
};
