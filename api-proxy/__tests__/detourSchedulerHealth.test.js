const { evaluateDetourSchedulerHealth } = require('../services/detourSchedulerHealth');

describe('detour scheduler health evaluation', () => {
  const now = Date.parse('2026-05-27T14:10:00.000Z');

  test('passes when scheduler auth matches, recent scheduler calls succeed, and active detours are fresh', () => {
    const result = evaluateDetourSchedulerHealth({
      now,
      lookbackMs: 10 * 60 * 1000,
      tokenMatch: true,
      logEntries: [
        {
          timestamp: '2026-05-27T14:08:00.000Z',
          status: 200,
          userAgent: 'Google-Cloud-Scheduler',
        },
      ],
      activeDetours: {
        '10': { updatedAt: now - 60 * 1000 },
      },
      maxActiveDetourAgeMs: 15 * 60 * 1000,
    });

    expect(result.ok).toBe(true);
    expect(result.checks.schedulerTokenMatches.ok).toBe(true);
    expect(result.checks.recentSchedulerSuccess.ok).toBe(true);
    expect(result.checks.noRecentScheduler401.ok).toBe(true);
    expect(result.checks.activeDetoursFresh.ok).toBe(true);
  });

  test('fails when recent scheduler calls are unauthenticated', () => {
    const result = evaluateDetourSchedulerHealth({
      now,
      lookbackMs: 10 * 60 * 1000,
      tokenMatch: true,
      logEntries: [
        {
          timestamp: '2026-05-27T14:08:00.000Z',
          status: 401,
          userAgent: 'Google-Cloud-Scheduler',
        },
      ],
      activeDetours: {
        '10': { updatedAt: now - 60 * 1000 },
      },
      maxActiveDetourAgeMs: 15 * 60 * 1000,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.recentSchedulerSuccess.ok).toBe(false);
    expect(result.checks.noRecentScheduler401.ok).toBe(false);
  });

  test('fails when active detours are stale during service hours', () => {
    const result = evaluateDetourSchedulerHealth({
      now,
      lookbackMs: 10 * 60 * 1000,
      tokenMatch: true,
      logEntries: [
        {
          timestamp: '2026-05-27T14:08:00.000Z',
          status: 200,
          userAgent: 'Google-Cloud-Scheduler',
        },
      ],
      activeDetours: {
        '10': { updatedAt: now - 30 * 60 * 1000 },
      },
      maxActiveDetourAgeMs: 15 * 60 * 1000,
      enforceActiveDetourFreshness: true,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.activeDetoursFresh.ok).toBe(false);
    expect(result.checks.activeDetoursFresh.ageMs).toBe(30 * 60 * 1000);
  });
});
