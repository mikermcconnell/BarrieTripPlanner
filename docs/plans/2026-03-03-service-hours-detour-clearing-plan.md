# Service-Hours-Aware Detour Clearing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add service-hours awareness to the detour detector so false-positive detours clear at end-of-service and real detours persist overnight with morning re-verification.

**Architecture:** All changes are in `api-proxy/detourDetector.js`. New `isWithinServiceHours()` function gates `processVehicles`. End-of-service cleanup uses `scoreConfidence()` from `detourGeometry.js` to decide which detours persist. Morning re-verification adds a `pendingReverification` flag with a 10-minute window.

**Tech Stack:** Node.js, Jest (TDD). No new dependencies.

---

### Task 1: `isWithinServiceHours` — pure function + tests

**Files:**
- Modify: `api-proxy/detourDetector.js:1-50` (add params + function)
- Test: `api-proxy/__tests__/detourDetector.test.js`

**Step 1: Write the failing tests**

Add to the end of `api-proxy/__tests__/detourDetector.test.js`:

```js
const { isWithinServiceHours } = require('../detourDetector');

describe('isWithinServiceHours', () => {
  // Service window: 5 AM - 1 AM (next day), America/Toronto

  test('returns true during midday (10 AM EST)', () => {
    // 2026-03-04 10:00 AM EST = 15:00 UTC
    const midday = new Date('2026-03-04T15:00:00Z').getTime();
    expect(isWithinServiceHours(midday)).toBe(true);
  });

  test('returns true at 11 PM EST (before midnight)', () => {
    // 2026-03-04 11:00 PM EST = 2026-03-05 04:00 UTC
    const lateNight = new Date('2026-03-05T04:00:00Z').getTime();
    expect(isWithinServiceHours(lateNight)).toBe(true);
  });

  test('returns true at 12:30 AM EST (before 1 AM cutoff)', () => {
    // 2026-03-05 00:30 AM EST = 2026-03-05 05:30 UTC
    const pastMidnight = new Date('2026-03-05T05:30:00Z').getTime();
    expect(isWithinServiceHours(pastMidnight)).toBe(true);
  });

  test('returns false at 3 AM EST (outside service)', () => {
    // 2026-03-05 03:00 AM EST = 2026-03-05 08:00 UTC
    const offHours = new Date('2026-03-05T08:00:00Z').getTime();
    expect(isWithinServiceHours(offHours)).toBe(false);
  });

  test('returns false at 2 AM EST (outside service)', () => {
    // 2026-03-05 02:00 AM EST = 2026-03-05 07:00 UTC
    const offHours = new Date('2026-03-05T07:00:00Z').getTime();
    expect(isWithinServiceHours(offHours)).toBe(false);
  });

  test('returns true at 5 AM EST (service start boundary)', () => {
    // 2026-03-04 05:00 AM EST = 2026-03-04 10:00 UTC
    const serviceStart = new Date('2026-03-04T10:00:00Z').getTime();
    expect(isWithinServiceHours(serviceStart)).toBe(true);
  });

  test('returns false at 1 AM EST (service end boundary)', () => {
    // 2026-03-05 01:00 AM EST = 2026-03-05 06:00 UTC
    const serviceEnd = new Date('2026-03-05T06:00:00Z').getTime();
    expect(isWithinServiceHours(serviceEnd)).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js -t "isWithinServiceHours" --no-coverage`
Expected: FAIL — `isWithinServiceHours` is not exported

**Step 3: Implement `isWithinServiceHours` and new config params**

Add to `api-proxy/detourDetector.js` after the existing config block (after line 49, before `// State`):

```js
const SERVICE_START_HOUR = Number.parseInt(process.env.DETOUR_SERVICE_START_HOUR || '5', 10);
const SERVICE_END_HOUR = Number.parseInt(process.env.DETOUR_SERVICE_END_HOUR || '1', 10);
const SERVICE_TIMEZONE = process.env.DETOUR_SERVICE_TIMEZONE || 'America/Toronto';

function isWithinServiceHours(nowMs) {
  const d = new Date(nowMs);
  const hour = Number.parseInt(
    d.toLocaleString('en-US', { timeZone: SERVICE_TIMEZONE, hour: 'numeric', hour12: false }),
    10
  );
  // Handle midnight-crossing window (e.g., start=5, end=1)
  if (SERVICE_START_HOUR > SERVICE_END_HOUR) {
    return hour >= SERVICE_START_HOUR || hour < SERVICE_END_HOUR;
  }
  return hour >= SERVICE_START_HOUR && hour < SERVICE_END_HOUR;
}
```

Export `isWithinServiceHours` in `module.exports` at the bottom of the file. Also export `SERVICE_START_HOUR`, `SERVICE_END_HOUR`.

**Step 4: Run tests to verify they pass**

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js -t "isWithinServiceHours" --no-coverage`
Expected: PASS (all 7 tests)

**Step 5: Commit**

```bash
git add api-proxy/detourDetector.js api-proxy/__tests__/detourDetector.test.js
git commit -m "feat(detour): add isWithinServiceHours with timezone-aware midnight crossing"
```

---

### Task 2: Service-hours guard in `processVehicles` + tests

**Files:**
- Modify: `api-proxy/detourDetector.js:93-95` (add guard at top of `processVehicles`)
- Modify: `api-proxy/detourDetector.js:51-54` (add `wasInService` state)
- Test: `api-proxy/__tests__/detourDetector.test.js`

**Step 1: Write the failing tests**

```js
describe('service hours guard', () => {
  beforeEach(() => clearVehicleState());

  test('processVehicles skips processing outside service hours', () => {
    // First, confirm a detour during service hours
    const offRouteVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    confirmDetour(offRouteVehicle);
    const before = getState();
    expect(before.activeDetourCount).toBe(1);

    // Mock Date.now to return 3 AM EST (outside service)
    // 3 AM EST = 8 AM UTC on a non-DST day
    const threeAmEst = new Date('2026-03-05T08:00:00Z').getTime();
    const originalNow = Date.now;
    Date.now = () => threeAmEst;

    // Process with a new vehicle — should be ignored
    const newVehicle = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
    const result = processVehicles([newVehicle], shapes, routeShapeMapping);

    // No new detour activity — state frozen
    const after = getState();
    expect(after.activeDetourCount).toBe(1);
    // bus-2 should NOT have been added
    expect(after.detours['route-1'].vehicleCount).toBe(1);

    Date.now = originalNow;
  });

  test('processVehicles resumes normal processing during service hours', () => {
    const tenAmEst = new Date('2026-03-04T15:00:00Z').getTime();
    const originalNow = Date.now;
    Date.now = () => tenAmEst;

    const offRouteVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    confirmDetour(offRouteVehicle);
    const state = getState();
    expect(state.activeDetourCount).toBe(1);

    Date.now = originalNow;
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js -t "service hours guard" --no-coverage`
Expected: FAIL — processVehicles doesn't check service hours yet

**Step 3: Add the guard**

In `api-proxy/detourDetector.js`, add state variable after `const detourEvidence = new Map();`:

```js
let wasInService = true;
```

Update `clearVehicleState` to also reset `wasInService = true;`.

At the top of `processVehicles`, before the existing code (line 94):

```js
const now = Date.now();
const inService = isWithinServiceHours(now);

if (!inService) {
  // First tick outside service — run end-of-service cleanup
  if (wasInService) {
    endOfServiceCleanup(now, shapes, routeShapeMapping);
    wasInService = false;
  }
  return getActiveDetours(shapes, routeShapeMapping);
}

// First tick back in service — run morning re-verification setup
if (!wasInService) {
  morningReverificationSetup(now);
  wasInService = true;
}
```

For now, create stub functions so the code compiles:

```js
function endOfServiceCleanup(now, shapes, routeShapeMapping) {
  // Task 3 implements this
}

function morningReverificationSetup(now) {
  // Task 4 implements this
}
```

**Step 4: Run tests to verify they pass**

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js -t "service hours guard" --no-coverage`
Expected: PASS

**Step 5: Run full test suite to check for regressions**

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js --no-coverage`
Expected: ALL PASS. Note: existing tests run during "service hours" by default (they use real `Date.now()` which is daytime). If any fail, the guard may need adjustment — check that the default service window covers test execution time. If tests run in CI at odd hours, consider making the guard a no-op when `SERVICE_START_HOUR === SERVICE_END_HOUR`.

**Step 6: Commit**

```bash
git add api-proxy/detourDetector.js api-proxy/__tests__/detourDetector.test.js
git commit -m "feat(detour): add service-hours guard to processVehicles"
```

---

### Task 3: End-of-service cleanup + tests

**Files:**
- Modify: `api-proxy/detourDetector.js:1-2` (import `scoreConfidence`)
- Modify: `api-proxy/detourDetector.js` (implement `endOfServiceCleanup`)
- Test: `api-proxy/__tests__/detourDetector.test.js`

**Step 1: Write the failing tests**

```js
describe('end-of-service cleanup', () => {
  beforeEach(() => clearVehicleState());

  test('clears low-confidence detours at service end', () => {
    // Confirm a detour with minimal evidence (low confidence: <5 points, <2 min, 1 vehicle)
    const offRouteVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    confirmDetour(offRouteVehicle);
    expect(getState().activeDetourCount).toBe(1);

    // Transition to out-of-service
    const oneAmEst = new Date('2026-03-05T06:00:00Z').getTime();
    const originalNow = Date.now;
    Date.now = () => oneAmEst;

    processVehicles([], shapes, routeShapeMapping);

    expect(getState().activeDetourCount).toBe(0);
    Date.now = originalNow;
  });

  test('preserves high-confidence detours at service end', () => {
    // Build a high-confidence detour:
    // - 2+ unique vehicles
    // - 10+ evidence points
    // - 5+ minutes duration
    const fiveMinAgo = Date.now() - 6 * 60 * 1000;
    const originalNow = Date.now;

    // Simulate detection 6 min ago
    Date.now = () => fiveMinAgo;
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
    // Run enough ticks with 2 vehicles to accumulate 10+ evidence points
    for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED + 6; i++) {
      Date.now = () => fiveMinAgo + i * 30000;
      processVehicles([bus1, bus2], shapes, routeShapeMapping);
    }

    const before = getState();
    expect(before.activeDetourCount).toBe(1);

    // Transition to out-of-service
    const oneAmEst = new Date('2026-03-05T06:00:00Z').getTime();
    Date.now = () => oneAmEst;
    processVehicles([], shapes, routeShapeMapping);

    // Detour should survive
    expect(getState().activeDetourCount).toBe(1);
    Date.now = originalNow;
  });

  test('cleanup only runs once per transition', () => {
    const offRouteVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    confirmDetour(offRouteVehicle);

    // First off-service tick — cleans low-confidence
    const oneAmEst = new Date('2026-03-05T06:00:00Z').getTime();
    const originalNow = Date.now;
    Date.now = () => oneAmEst;
    processVehicles([], shapes, routeShapeMapping);
    expect(getState().activeDetourCount).toBe(0);

    // Seed a new detour manually to simulate Firestore seed
    seedActiveDetour('route-1', Date.now() - 60000, Date.now() - 30000, 1);
    expect(getState().activeDetourCount).toBe(1);

    // Second off-service tick — should NOT clean again
    Date.now = () => oneAmEst + 30000;
    processVehicles([], shapes, routeShapeMapping);
    expect(getState().activeDetourCount).toBe(1);

    Date.now = originalNow;
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js -t "end-of-service cleanup" --no-coverage`
Expected: FAIL — `endOfServiceCleanup` is a stub

**Step 3: Implement `endOfServiceCleanup`**

At top of file, add import:

```js
const { buildGeometry, findClosestShapePoint, findAnchors, MIN_EVIDENCE_FOR_GEOMETRY, scoreConfidence } = require('./detourGeometry');
```

Replace the stub `endOfServiceCleanup`:

```js
function endOfServiceCleanup(now, shapes, routeShapeMapping) {
  const toDelete = [];
  for (const [routeId, detour] of activeDetours) {
    const evidence = detourEvidence.get(routeId);
    const detectedAtMs = detour.detectedAt instanceof Date
      ? detour.detectedAt.getTime()
      : Number(detour.detectedAt);
    const points = evidence ? evidence.points : [];
    const confidence = scoreConfidence(points, detectedAtMs, now);

    if (confidence === 'high') {
      // Preserve: prune stale vehicles but keep the detour
      detour.vehiclesOffRoute.clear();
      continue;
    }

    // Low or medium confidence — mark for deletion
    toDelete.push(routeId);
  }

  for (const routeId of toDelete) {
    activeDetours.delete(routeId);
    detourEvidence.delete(routeId);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js -t "end-of-service cleanup" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add api-proxy/detourDetector.js api-proxy/__tests__/detourDetector.test.js
git commit -m "feat(detour): clear low-confidence detours at end-of-service, preserve high"
```

---

### Task 4: Morning re-verification + tests

**Files:**
- Modify: `api-proxy/detourDetector.js` (add config, implement `morningReverificationSetup`, add check in `processVehicles`)
- Test: `api-proxy/__tests__/detourDetector.test.js`

**Step 1: Write the failing tests**

```js
describe('morning re-verification', () => {
  beforeEach(() => clearVehicleState());

  test('persisted detour is cleared if unconfirmed after reverification window', () => {
    const originalNow = Date.now;

    // Build high-confidence detour during daytime
    const daytime = new Date('2026-03-04T15:00:00Z').getTime(); // 10 AM EST
    Date.now = () => daytime;
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
    for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED + 6; i++) {
      Date.now = () => daytime + i * 30000;
      processVehicles([bus1, bus2], shapes, routeShapeMapping);
    }
    expect(getState().activeDetourCount).toBe(1);

    // Transition to out-of-service (1 AM EST)
    const oneAm = new Date('2026-03-05T06:00:00Z').getTime();
    Date.now = () => oneAm;
    processVehicles([], shapes, routeShapeMapping);
    expect(getState().activeDetourCount).toBe(1); // high confidence survives

    // Transition back to in-service (5 AM EST) — reverification starts
    const fiveAm = new Date('2026-03-05T10:00:00Z').getTime();
    Date.now = () => fiveAm;
    processVehicles([], shapes, routeShapeMapping);
    expect(getState().activeDetourCount).toBe(1); // still active, waiting

    // 11 minutes later (past 10-min window), still no off-route evidence
    const fiveAmPlus11 = fiveAm + 11 * 60 * 1000;
    Date.now = () => fiveAmPlus11;
    processVehicles([], shapes, routeShapeMapping);
    expect(getState().activeDetourCount).toBe(0); // cleared — unconfirmed

    Date.now = originalNow;
  });

  test('persisted detour survives if re-confirmed within window', () => {
    const originalNow = Date.now;

    // Build high-confidence detour
    const daytime = new Date('2026-03-04T15:00:00Z').getTime();
    Date.now = () => daytime;
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
    for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED + 6; i++) {
      Date.now = () => daytime + i * 30000;
      processVehicles([bus1, bus2], shapes, routeShapeMapping);
    }

    // End of service
    const oneAm = new Date('2026-03-05T06:00:00Z').getTime();
    Date.now = () => oneAm;
    processVehicles([], shapes, routeShapeMapping);

    // Morning — service resumes
    const fiveAm = new Date('2026-03-05T10:00:00Z').getTime();
    Date.now = () => fiveAm;
    processVehicles([], shapes, routeShapeMapping);

    // 3 minutes later, a bus goes off-route and confirms the detour
    const fiveAmPlus3 = fiveAm + 3 * 60 * 1000;
    for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED; i++) {
      Date.now = () => fiveAmPlus3 + i * 30000;
      processVehicles(
        [makeVehicle({ id: 'morning-bus', coordinate: OFF_ROUTE_COORD })],
        shapes,
        routeShapeMapping
      );
    }

    // Detour should be re-verified and persist past the window
    const fiveAmPlus15 = fiveAm + 15 * 60 * 1000;
    Date.now = () => fiveAmPlus15;
    processVehicles([], shapes, routeShapeMapping);
    expect(getState().activeDetourCount).toBe(1);

    Date.now = originalNow;
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js -t "morning re-verification" --no-coverage`
Expected: FAIL — `morningReverificationSetup` is a stub, no reverification logic

**Step 3: Implement morning re-verification**

Add config param after the other service-hours params:

```js
const configuredReverificationMs = Number.parseFloat(
  process.env.DETOUR_REVERIFICATION_WINDOW_MS || '600000'
);
const REVERIFICATION_WINDOW_MS =
  Number.isFinite(configuredReverificationMs) && configuredReverificationMs > 0
    ? configuredReverificationMs
    : 600_000;
```

Replace the stub `morningReverificationSetup`:

```js
function morningReverificationSetup(now) {
  for (const [routeId, detour] of activeDetours) {
    detour.pendingReverification = true;
    detour.reverificationDeadline = now + REVERIFICATION_WINDOW_MS;
  }
}
```

In `addVehicleToDetour`, after the line `detour.seedVehicleCount = 0;` add:

```js
// Vehicle confirmed off-route — re-verification passed
if (detour.pendingReverification) {
  detour.pendingReverification = false;
  detour.reverificationDeadline = null;
}
```

In `tickClearPending`, add a new block at the beginning of the for-loop (before the existing `if (detour.state === 'active' ...` block):

```js
// Check reverification deadline for overnight-persisted detours
if (detour.pendingReverification && detour.reverificationDeadline && now >= detour.reverificationDeadline) {
  activeDetours.delete(routeId);
  detourEvidence.delete(routeId);
  continue;
}
```

Export `REVERIFICATION_WINDOW_MS` in `module.exports`.

**Step 4: Run tests to verify they pass**

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js -t "morning re-verification" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add api-proxy/detourDetector.js api-proxy/__tests__/detourDetector.test.js
git commit -m "feat(detour): add morning re-verification for overnight-persisted detours"
```

---

### Task 5: Full regression test + integration check

**Files:**
- Test: `api-proxy/__tests__/detourDetector.test.js` (full suite)
- Test: `api-proxy/__tests__/detourIntegration.test.js` (full suite)

**Step 1: Run full detector test suite**

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js --no-coverage`
Expected: ALL PASS

**Step 2: Run full integration test suite**

Run: `cd api-proxy && npx jest __tests__/detourIntegration.test.js --no-coverage`
Expected: ALL PASS. If any tests mock `Date.now` and simulate overnight scenarios, they may need adjustment.

**Step 3: Run entire api-proxy test suite**

Run: `cd api-proxy && npx jest --no-coverage`
Expected: ALL PASS across all 6 test files (143+ tests)

**Step 4: Commit if any test fixes were needed**

```bash
git add -A
git commit -m "fix(detour): adjust existing tests for service-hours compatibility"
```

---

### Task 6: Update docs + config reference

**Files:**
- Modify: `docs/AUTO-DETOUR-DETECTION.md` (sections 3, 5, 6)
- Modify: `api-proxy/.env.example` (if it exists — add new env vars)

**Step 1: Update AUTO-DETOUR-DETECTION.md**

In section 3 "Current State", update to reflect that service-hours cleanup is now active.

In section 5 "Configuration Reference", add to the "Detection Tuning" table:

```markdown
| `DETOUR_SERVICE_START_HOUR` | `5` | Local hour when detection activates (24h format) |
| `DETOUR_SERVICE_END_HOUR` | `1` | Local hour when detection freezes |
| `DETOUR_SERVICE_TIMEZONE` | `America/Toronto` | IANA timezone for service hour evaluation |
| `DETOUR_REVERIFICATION_WINDOW_MS` | `600000` | Time after service start to re-confirm overnight detours (10min) |
```

In section 6 "Failure Modes", add:

```markdown
| **Service ends with active detours** | Low/medium-confidence detours cleared immediately. High-confidence detours frozen and re-verified at morning service start within 10 minutes. |
| **Worker restarts overnight** | Seeded detours from Firestore get `pendingReverification` flag at next service start. |
```

**Step 2: Commit**

```bash
git add docs/AUTO-DETOUR-DETECTION.md
git commit -m "docs: update detour detection docs with service-hours clearing behavior"
```
