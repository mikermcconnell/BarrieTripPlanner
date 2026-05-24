# Auto-Detour Memory Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move BTTP auto-detour detection to the new low-cost baseline: one scheduled GTFS-RT sample per minute, backend-owned rolling memory, longer low-frequency candidate confirmation, and active detours that persist until normal-route GPS proof clears them.

**Architecture:** Barrie's public GTFS-RT `VehiclePositions` feed remains the bus-location source. The backend becomes the durable detection brain: it keeps short vehicle traces, longer compact candidate memory, and persistent active-detour state; Firestore remains the rider-facing publication layer. The app continues to subscribe to `activeDetours` and should not become a detection source.

**Tech Stack:** Node 22 `api-proxy`, GTFS/GTFS-RT, Firestore Admin SDK, Jest, Expo/React Native client consuming Firestore.

## Implementation Status

Status: **Implemented locally and committed** (`46ea505 feat(detours): add memory baseline`).

Updated: 2026-05-24 after verification.

Completed implementation scope:

- Low-cost scheduled baseline configuration and docs now prefer one GTFS-RT snapshot per minute with burst sampling disabled for normal operations.
- Backend normal-detour candidate memory is implemented and persisted across scheduled/manual ticks.
- Vehicle evidence uses GTFS-RT sample timestamps when available.
- Active Firestore detour snapshots hydrate on cold start when runtime state is missing, with a first-tick deletion guard.
- Detours remain active through service gaps or zero-current-vehicle periods until normal-route GPS traversal proof clears them.

Verified locally:

- `npm --prefix api-proxy test -- --runTestsByPath __tests__/detectionConfig.test.js __tests__/detourCandidateMemory.test.js __tests__/detourRuntimeStateStore.test.js __tests__/detourDetector.test.js __tests__/activeDetourSnapshotStore.test.js __tests__/detourWorkerColdStart.test.js __tests__/detourIntegration.test.js __tests__/detourPublisher.test.js`
  - Result: 36 suites / 419 tests passed.
- `npm test -- --runTestsByPath src/__tests__/detourIntegration.test.js src/__tests__/detourOverlays.test.js src/__tests__/detourAlertStrip.test.js src/__tests__/detourVisibility.test.js src/__tests__/detourService.test.js src/__tests__/UpcomingDetourStrip.test.js src/__tests__/DetourDetailsSheet.timing.test.js src/__tests__/detourOverlayLayerOrder.test.js src/__tests__/useAffectedStops.test.js`
  - Result: 9 suites / 162 tests passed.

Still pending outside this implementation plan:

- Confirm deployed Cloud Scheduler cadence and production environment variables.
- Run a live validation window against production GTFS/Firestore.
- Complete the manual QA checklist in `docs/AUTO-DETOUR-QA-CHECKLIST.md`.

---

## Baseline Decision

Use the **best low-cost setup**:

```text
Cloud Scheduler every 60 seconds during service hours
→ POST /api/detour-run-once
→ one GTFS-RT VehiclePositions fetch
→ backend rolling memory compares against previous samples
→ confirmed detours publish to Firestore
→ app renders Firestore only
```

Production posture:

- `DETOUR_WORKER_MODE=scheduled`
- `DETOUR_BURST_SAMPLING_ENABLED=false`
- Cloud Scheduler cadence: every 1 minute during service hours
- Cloud Run/Firebase Gen 2 minimum instances: `0`
- Firestore writes only for confirmed detour state, throttled geometry, history, and compact runtime state
- no app-side bus-location evidence

Confirmation identity:

- normal detours still require two unique physical buses before rider UI when `vehicleId` is available.
- use `vehicleId` first, then `tripId` only as a fallback when the feed lacks vehicle IDs.
- this preserves the current false-positive guard; if a 60-minute route has only one physical bus assigned, auto-confirmation may still need an operator/manual path or a future product decision to allow two unique trips instead.

This removes the need for multiple burst samples per cron call, but it does **not** remove the need for a scheduler. The public GTFS-RT feed is an HTTP snapshot, not a push stream.

---

## Current Repo Starting Point

Already present and should be preserved:

- GTFS-RT bus source: `api-proxy/vehicleFetcher.js`
- scheduled/manual tick endpoint: `api-proxy/routes/detourRoutes.js`
- worker orchestration: `api-proxy/detourWorker.js`
- duplicate snapshot guard: `api-proxy/detour/vehicleSampleFreshness.js`
- core detector: `api-proxy/detourDetector.js`
- detector runtime persistence: `api-proxy/detour/runtimeState.js`, `api-proxy/detourRuntimeStateStore.js`
- learned persistent detours: `api-proxy/persistentDetourStore.js`
- Firestore publishing: `api-proxy/detourPublisher.js`
- app consumption: `src/services/firebase/detourService.js`, `src/context/TransitContext.js`
- rider visibility gate: `src/utils/detourVisibility.js`

Main gap:

- normal two-bus detour confirmation can still depend too much on the short geometry/evidence window.
- low-frequency routes need compact candidate memory that survives 30- to 60-minute headways without keeping all raw GPS points.

---

## File Structure Changes

### Create

- `api-proxy/detour/candidateMemory.js`
  - Owns compact candidate creation, matching, pruning, and promotion logic for normal off-route detours.

- `api-proxy/__tests__/detourCandidateMemory.test.js`
  - Tests candidate matching, expiry, vehicle-first evidence signatures, and low-frequency route windows.

- `api-proxy/activeDetourSnapshotStore.js`
  - Loads currently published `activeDetours` documents so a cold backend does not delete active rider-facing detours when runtime state is missing.

- `api-proxy/__tests__/activeDetourSnapshotStore.test.js`
  - Tests Firestore normalization and missing-Firestore behavior.

### Modify

- `api-proxy/detour/detectionConfig.js`
  - Add explicit config for vehicle trace memory and candidate confirmation memory.

- `api-proxy/detour/state.js`
  - Add `normalDetourCandidates`.

- `api-proxy/detour/runtimeState.js`
  - Serialize/hydrate `normalDetourCandidates`.

- `api-proxy/detourDetector.js`
  - Use GTFS-RT vehicle sample timestamps for evidence.
  - Record normal detour candidates separately from short recurring candidates.
  - Promote matching candidates after two unique vehicle-first evidence signatures.
  - Preserve all existing clear and geometry gates.

- `api-proxy/detourWorker.js`
  - Hydrate active published detour snapshots before the first publish when runtime state is absent or incomplete.
  - Keep one tick per scheduler invocation.

- `api-proxy/detourPublisher.js`
  - Add a startup deletion guard so existing `activeDetours` are not deleted just because runtime state was unavailable on the first tick.

- `.env.example`
  - Set the low-cost scheduled baseline.
  - Remove or clearly mark unused detour env keys.

- `docs/API-PROXY-OPERATIONS.md`
  - Replace burst-sampling recommendation with one-sample-per-minute scheduled mode.

- `docs/AUTO-DETOUR-DETECTION.md`
  - Document the new three-memory-layer model.

- `docs/AUTO-DETOUR-QA-CHECKLIST.md`
  - Add low-frequency and cold-start validation checks.

---

## Task 1: Add Candidate Memory Configuration

**Files:**

- Modify: `api-proxy/detour/detectionConfig.js`
- Test: `api-proxy/__tests__/detectionConfig.test.js`

- [x] **Step 1: Add failing config tests**

Add tests that verify these defaults:

```js
test('exposes normal detour candidate memory defaults', () => {
  const config = require('../detour/detectionConfig');

  expect(config.DETOUR_VEHICLE_TRACE_WINDOW_MS).toBe(20 * 60 * 1000);
  expect(config.DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS).toBe(3 * 60 * 60 * 1000);
  expect(config.DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER).toBe(2);
  expect(config.DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS).toBe(10 * 60 * 1000);
  expect(config.DETOUR_CANDIDATE_CONFIRMATION_MAX_MS).toBe(3 * 60 * 60 * 1000);
});
```

Expected: test fails because exports do not exist.

- [x] **Step 2: Add config constants**

Add to `api-proxy/detour/detectionConfig.js`:

```js
const configuredVehicleTraceWindowMs = Number.parseFloat(
  process.env.DETOUR_VEHICLE_TRACE_WINDOW_MS || String(20 * 60 * 1000)
);
const DETOUR_VEHICLE_TRACE_WINDOW_MS =
  Number.isFinite(configuredVehicleTraceWindowMs) && configuredVehicleTraceWindowMs > 0
    ? configuredVehicleTraceWindowMs
    : 20 * 60 * 1000;

const configuredCandidateConfirmationWindowMs = Number.parseFloat(
  process.env.DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS || String(3 * 60 * 60 * 1000)
);
const DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS =
  Number.isFinite(configuredCandidateConfirmationWindowMs) && configuredCandidateConfirmationWindowMs > 0
    ? configuredCandidateConfirmationWindowMs
    : 3 * 60 * 60 * 1000;

const configuredCandidateHeadwayMultiplier = Number.parseFloat(
  process.env.DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER || '2'
);
const DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER =
  Number.isFinite(configuredCandidateHeadwayMultiplier) && configuredCandidateHeadwayMultiplier > 0
    ? configuredCandidateHeadwayMultiplier
    : 2;

const configuredCandidateBufferMs = Number.parseFloat(
  process.env.DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS || String(10 * 60 * 1000)
);
const DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS =
  Number.isFinite(configuredCandidateBufferMs) && configuredCandidateBufferMs >= 0
    ? configuredCandidateBufferMs
    : 10 * 60 * 1000;

const configuredCandidateMaxMs = Number.parseFloat(
  process.env.DETOUR_CANDIDATE_CONFIRMATION_MAX_MS || String(3 * 60 * 60 * 1000)
);
const DETOUR_CANDIDATE_CONFIRMATION_MAX_MS =
  Number.isFinite(configuredCandidateMaxMs) && configuredCandidateMaxMs > 0
    ? configuredCandidateMaxMs
    : 3 * 60 * 60 * 1000;
```

Export all five constants.

Also re-export the five constants from `api-proxy/detourDetector.js`, because detector tests and downstream debug tooling import detector thresholds from that module.

- [x] **Step 3: Run targeted test**

Run:

```bash
npm --prefix api-proxy test -- --runTestsByPath __tests__/detectionConfig.test.js
```

Expected: PASS.

---

## Task 2: Add Normal Detour Candidate Memory Module

**Files:**

- Create: `api-proxy/detour/candidateMemory.js`
- Create: `api-proxy/__tests__/detourCandidateMemory.test.js`

- [x] **Step 1: Write module tests**

Add tests covering:

```js
const {
  createCandidateKey,
  makeCandidateObservationSignature,
  upsertCandidateObservation,
  pruneExpiredCandidates,
  findMatchingCandidate,
  hasEnoughUniqueEvidence,
} = require('../detour/candidateMemory');

test('matches candidates on same route, shape, and nearby progress window', () => {
  const candidates = new Map();
  const first = {
    routeId: '8A',
    shapeId: 'shape-8a',
    progressMinMeters: 1000,
    progressMaxMeters: 1250,
    timestampMs: 1000,
    vehicleId: 'bus-1',
    tripId: 'trip-1',
    evidencePoints: [],
  };
  const second = {
    routeId: '8A',
    shapeId: 'shape-8a',
    progressMinMeters: 1280,
    progressMaxMeters: 1450,
    timestampMs: 60 * 60 * 1000,
    vehicleId: 'bus-2',
    tripId: 'trip-2',
    evidencePoints: [],
  };

  upsertCandidateObservation(candidates, first, { maxGapMeters: 350 });
  const match = findMatchingCandidate(candidates, second, { maxGapMeters: 350 });

  expect(match).toBeDefined();
  expect(match.candidate.routeId).toBe('8A');
});

test('requires two unique vehicle-first signatures before promotion', () => {
  const candidates = new Map();
  const first = {
    routeId: '8A',
    shapeId: 'shape-8a',
    progressMinMeters: 1000,
    progressMaxMeters: 1250,
    timestampMs: 1000,
    vehicleId: 'bus-1',
    tripId: 'trip-1',
    evidencePoints: [],
  };
  const repeat = { ...first, timestampMs: 2000 };
  const second = { ...first, vehicleId: 'bus-2', tripId: 'trip-2', timestampMs: 60 * 60 * 1000 };

  const candidate = upsertCandidateObservation(candidates, first, { maxGapMeters: 350 });
  upsertCandidateObservation(candidates, repeat, { maxGapMeters: 350 });
  expect(hasEnoughUniqueEvidence(candidate, { minUniqueSignatures: 2 })).toBe(false);

  const promoted = upsertCandidateObservation(candidates, second, { maxGapMeters: 350 });
  expect(hasEnoughUniqueEvidence(promoted, { minUniqueSignatures: 2 })).toBe(true);
});

test('does not count the same vehicle on a later trip as a second bus', () => {
  const candidates = new Map();
  const first = {
    routeId: '8A',
    shapeId: 'shape-8a',
    progressMinMeters: 1000,
    progressMaxMeters: 1250,
    timestampMs: 1000,
    vehicleId: 'bus-1',
    tripId: 'trip-1',
    evidencePoints: [],
  };
  const sameBusLaterTrip = {
    ...first,
    tripId: 'trip-2',
    timestampMs: 60 * 60 * 1000,
  };

  const candidate = upsertCandidateObservation(candidates, first, { maxGapMeters: 350 });
  upsertCandidateObservation(candidates, sameBusLaterTrip, { maxGapMeters: 350 });

  expect(hasEnoughUniqueEvidence(candidate, { minUniqueSignatures: 2 })).toBe(false);
});

test('keeps repeated observations from the same signature compact', () => {
  const candidates = new Map();
  const first = {
    routeId: '8A',
    shapeId: 'shape-8a',
    progressMinMeters: 1000,
    progressMaxMeters: 1250,
    timestampMs: 1000,
    vehicleId: 'bus-1',
    tripId: 'trip-1',
    evidencePoints: [],
  };

  const candidate = upsertCandidateObservation(candidates, first, { maxGapMeters: 350 });
  upsertCandidateObservation(candidates, { ...first, timestampMs: 2000 }, { maxGapMeters: 350 });

  expect(candidate.observations).toHaveLength(1);
});

test('prunes candidates outside the confirmation window', () => {
  const candidates = new Map();
  upsertCandidateObservation(candidates, {
    routeId: '8A',
    shapeId: 'shape-8a',
    progressMinMeters: 1000,
    progressMaxMeters: 1250,
    timestampMs: 1000,
    vehicleId: 'bus-1',
    tripId: 'trip-1',
    evidencePoints: [],
  }, { maxGapMeters: 350 });

  pruneExpiredCandidates(candidates, {
    nowMs: 4 * 60 * 60 * 1000,
    windowMs: 3 * 60 * 60 * 1000,
  });

  expect(candidates.size).toBe(0);
});

test('route-scoped pruning does not expire unrelated route candidates', () => {
  const candidates = new Map();
  upsertCandidateObservation(candidates, {
    routeId: '8A',
    shapeId: 'shape-8a',
    progressMinMeters: 1000,
    progressMaxMeters: 1250,
    timestampMs: 1000,
    vehicleId: 'bus-1',
    tripId: 'trip-1',
    evidencePoints: [],
  }, { maxGapMeters: 350 });
  upsertCandidateObservation(candidates, {
    routeId: '2A',
    shapeId: 'shape-2a',
    progressMinMeters: 1000,
    progressMaxMeters: 1250,
    timestampMs: 1000,
    vehicleId: 'bus-9',
    tripId: 'trip-9',
    evidencePoints: [],
  }, { maxGapMeters: 350 });

  pruneExpiredCandidates(candidates, {
    nowMs: 4 * 60 * 60 * 1000,
    windowMs: 3 * 60 * 60 * 1000,
    routeId: '8A',
  });

  expect([...candidates.values()].map((candidate) => candidate.routeId)).toEqual(['2A']);
});

test('ignores invalid candidate observations', () => {
  const candidates = new Map();
  const result = upsertCandidateObservation(candidates, {
    routeId: '8A',
    shapeId: 'shape-8a',
    progressMinMeters: NaN,
    progressMaxMeters: 1250,
    timestampMs: 1000,
    vehicleId: 'bus-1',
    tripId: 'trip-1',
    evidencePoints: [],
  }, { maxGapMeters: 350 });

  expect(result).toBeNull();
  expect(candidates.size).toBe(0);
});
```

Expected: FAIL because the module does not exist.

- [x] **Step 2: Implement module**

Create `api-proxy/detour/candidateMemory.js` with pure functions only:

```js
'use strict';

function makeCandidateObservationSignature(observation) {
  if (observation?.vehicleId) return `vehicle:${observation.vehicleId}`;
  if (observation?.tripId) return `trip:${observation.tripId}`;
  return 'unknown';
}

function createCandidateKey(observation, bucketMeters = 350) {
  const midpoint = (
    Number(observation?.progressMinMeters) +
    Number(observation?.progressMaxMeters)
  ) / 2;
  const bucket = Number.isFinite(midpoint)
    ? Math.round(midpoint / Math.max(1, bucketMeters))
    : 'unknown';
  return [
    observation?.routeId || 'unknown-route',
    observation?.shapeId || 'unknown-shape',
    bucket,
  ].join(':');
}

function getProgressGapMeters(candidate, observation) {
  if (!candidate || !observation) return Infinity;
  if (candidate.shapeId && observation.shapeId && candidate.shapeId !== observation.shapeId) return Infinity;

  const candidateMin = Number(candidate.progressMinMeters);
  const candidateMax = Number(candidate.progressMaxMeters);
  const observationMin = Number(observation.progressMinMeters);
  const observationMax = Number(observation.progressMaxMeters);

  if (![candidateMin, candidateMax, observationMin, observationMax].every(Number.isFinite)) return Infinity;
  if (observationMin > candidateMax) return observationMin - candidateMax;
  if (candidateMin > observationMax) return candidateMin - observationMax;
  return 0;
}

function findMatchingCandidate(candidates, observation, { maxGapMeters = 350 } = {}) {
  let best = null;
  for (const [key, candidate] of candidates || []) {
    if (candidate.routeId !== observation.routeId) continue;
    const gapMeters = getProgressGapMeters(candidate, observation);
    if (gapMeters > maxGapMeters) continue;
    if (!best || gapMeters < best.gapMeters) best = { key, candidate, gapMeters };
  }
  return best;
}

function normalizeObservation(observation = {}) {
  const signature = observation.signature || makeCandidateObservationSignature(observation);
  return {
    routeId: observation.routeId || null,
    shapeId: observation.shapeId || null,
    progressMinMeters: Number(observation.progressMinMeters),
    progressMaxMeters: Number(observation.progressMaxMeters),
    timestampMs: Number(observation.timestampMs),
    vehicleId: observation.vehicleId || null,
    tripId: observation.tripId || null,
    tripShapeId: observation.tripShapeId || null,
    signature,
    entryObservation: observation.entryObservation || null,
    exitObservation: observation.exitObservation || null,
    evidencePoints: Array.isArray(observation.evidencePoints) ? observation.evidencePoints : [],
    lastCoordinate: observation.lastCoordinate || null,
  };
}

function mergeObservation(previous, next) {
  return {
    ...previous,
    ...next,
    progressMinMeters: Math.min(previous.progressMinMeters, next.progressMinMeters),
    progressMaxMeters: Math.max(previous.progressMaxMeters, next.progressMaxMeters),
    timestampMs: Math.max(previous.timestampMs, next.timestampMs),
    entryObservation: previous.entryObservation || next.entryObservation,
    evidencePoints: [
      ...(previous.evidencePoints || []),
      ...(next.evidencePoints || []),
    ].slice(-10),
    lastCoordinate: next.lastCoordinate || previous.lastCoordinate || null,
  };
}

function isValidCandidateObservation(observation) {
  return Boolean(
    observation?.routeId &&
    observation?.shapeId &&
    Number.isFinite(observation.progressMinMeters) &&
    Number.isFinite(observation.progressMaxMeters) &&
    observation.progressMaxMeters >= observation.progressMinMeters &&
    Number.isFinite(observation.timestampMs)
  );
}

function upsertCandidateObservation(candidates, observation, { maxGapMeters = 350 } = {}) {
  const normalized = normalizeObservation(observation);
  if (!isValidCandidateObservation(normalized)) return null;
  const match = findMatchingCandidate(candidates, normalized, { maxGapMeters });
  const key = match?.key || createCandidateKey(normalized, maxGapMeters);
  const candidate = match?.candidate || {
    routeId: normalized.routeId,
    shapeId: normalized.shapeId,
    progressMinMeters: normalized.progressMinMeters,
    progressMaxMeters: normalized.progressMaxMeters,
    firstSeenAt: normalized.timestampMs,
    lastSeenAt: normalized.timestampMs,
    observations: [],
    evidencePoints: [],
  };

  const existingIndex = candidate.observations.findIndex((item) => item.signature === normalized.signature);
  if (existingIndex >= 0) {
    candidate.observations[existingIndex] = mergeObservation(candidate.observations[existingIndex], normalized);
  } else {
    candidate.observations.push(normalized);
  }

  candidate.progressMinMeters = Math.min(...candidate.observations.map((item) => item.progressMinMeters));
  candidate.progressMaxMeters = Math.max(...candidate.observations.map((item) => item.progressMaxMeters));
  candidate.firstSeenAt = Math.min(...candidate.observations.map((item) => item.timestampMs));
  candidate.lastSeenAt = Math.max(...candidate.observations.map((item) => item.timestampMs));
  candidate.evidencePoints = candidate.observations.flatMap((item) => item.evidencePoints || []);
  candidates.set(key, candidate);
  return candidate;
}

function pruneExpiredCandidates(candidates, { nowMs, windowMs, routeId = null } = {}) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(windowMs) || windowMs <= 0) return;
  const cutoff = nowMs - windowMs;
  for (const [key, candidate] of candidates || []) {
    if (routeId && candidate.routeId !== routeId) continue;
    candidate.observations = (candidate.observations || [])
      .map((observation) => ({
        ...observation,
        evidencePoints: (observation.evidencePoints || [])
          .filter((point) => Number(point.timestampMs) >= cutoff),
      }))
      .filter((observation) =>
        isValidCandidateObservation(observation) &&
        Number(observation.timestampMs) >= cutoff
      );
    candidate.evidencePoints = candidate.observations.flatMap((observation) => observation.evidencePoints || []);

    if (candidate.observations.length === 0) {
      candidates.delete(key);
      continue;
    }

    candidate.progressMinMeters = Math.min(...candidate.observations.map((item) => item.progressMinMeters));
    candidate.progressMaxMeters = Math.max(...candidate.observations.map((item) => item.progressMaxMeters));
    candidate.firstSeenAt = Math.min(...candidate.observations.map((item) => item.timestampMs));
    candidate.lastSeenAt = Math.max(...candidate.observations.map((item) => item.timestampMs));
  }
}

function hasEnoughUniqueEvidence(candidate, { minUniqueSignatures = 2 } = {}) {
  const signatures = new Set(
    (candidate?.observations || [])
      .map((observation) => observation.signature || makeCandidateObservationSignature(observation))
      .filter(Boolean)
  );
  return signatures.size >= minUniqueSignatures;
}

module.exports = {
  createCandidateKey,
  makeCandidateObservationSignature,
  findMatchingCandidate,
  upsertCandidateObservation,
  pruneExpiredCandidates,
  hasEnoughUniqueEvidence,
  getProgressGapMeters,
  isValidCandidateObservation,
};
```

- [x] **Step 3: Run module tests**

Run:

```bash
npm --prefix api-proxy test -- --runTestsByPath __tests__/detourCandidateMemory.test.js
```

Expected: PASS.

---

## Task 3: Add Candidate State and Runtime Persistence

**Files:**

- Modify: `api-proxy/detour/state.js`
- Modify: `api-proxy/detour/runtimeState.js`
- Test: `api-proxy/__tests__/detourDetector.test.js`

- [x] **Step 1: Add failing runtime persistence test**

Add this test to `api-proxy/__tests__/detourDetector.test.js`. It directly seeds the new state map so this task can pass before the detector starts writing normal candidates.

```js
test('serializes and hydrates normal detour candidate memory for low-frequency confirmation', () => {
  const { normalDetourCandidates } = require('../detour/state');
  const baseTime = Date.parse('2026-05-24T14:00:00.000Z');

  normalDetourCandidates.set('route-1:shape-1:10', {
    routeId: 'route-1',
    shapeId: 'shape-1',
    progressMinMeters: 1000,
    progressMaxMeters: 1250,
    firstSeenAt: baseTime,
    lastSeenAt: baseTime,
    observations: [{
      routeId: 'route-1',
      shapeId: 'shape-1',
      progressMinMeters: 1000,
      progressMaxMeters: 1250,
      timestampMs: baseTime,
      vehicleId: 'bus-1',
      tripId: 'trip-1',
      tripShapeId: null,
      signature: 'vehicle:bus-1',
      entryObservation: {
        coordinate: ON_ROUTE_COORD,
        timestampMs: baseTime - 30_000,
      },
      exitObservation: null,
      evidencePoints: [{
        latitude: OFF_ROUTE_WEST.latitude,
        longitude: OFF_ROUTE_WEST.longitude,
        timestampMs: baseTime,
        vehicleId: 'bus-1',
        tripShapeId: null,
      }],
      lastCoordinate: OFF_ROUTE_WEST,
    }],
    evidencePoints: [{
      latitude: OFF_ROUTE_WEST.latitude,
      longitude: OFF_ROUTE_WEST.longitude,
      timestampMs: baseTime,
      vehicleId: 'bus-1',
      tripShapeId: null,
    }],
  });

  const snapshot = serializeDetectorRuntimeState();
  expect(Object.keys(snapshot.normalDetourCandidates || {})).toEqual(['route-1:shape-1:10']);

  clearVehicleState();
  hydrateRuntimeState(snapshot);

  const restored = serializeDetectorRuntimeState();
  expect(Object.keys(restored.normalDetourCandidates || {})).toEqual(['route-1:shape-1:10']);
  expect(restored.normalDetourCandidates['route-1:shape-1:10'].observations[0].signature)
    .toBe('vehicle:bus-1');
});
```

Expected: FAIL until candidate state is persisted.

- [x] **Step 2: Add state map**

Modify `api-proxy/detour/state.js`:

```js
const normalDetourCandidates = new Map();
```

Clear it in `clearDetourState()` and export it.

- [x] **Step 3: Serialize normal candidates**

In `api-proxy/detour/runtimeState.js`, add `normalDetourCandidates` to `serializeDetectorRuntimeState()`:

```js
normalDetourCandidates: Object.fromEntries(
  [...normalDetourCandidates.entries()].map(([key, candidate]) => [key, {
    routeId: candidate.routeId || null,
    shapeId: candidate.shapeId || null,
    progressMinMeters: Number.isFinite(candidate.progressMinMeters) ? candidate.progressMinMeters : null,
    progressMaxMeters: Number.isFinite(candidate.progressMaxMeters) ? candidate.progressMaxMeters : null,
    firstSeenAt: toTimestampMs(candidate.firstSeenAt) || null,
    lastSeenAt: toTimestampMs(candidate.lastSeenAt) || null,
    observations: (candidate.observations || []).map((observation) => ({
      routeId: observation.routeId || null,
      shapeId: observation.shapeId || null,
      progressMinMeters: Number.isFinite(observation.progressMinMeters) ? observation.progressMinMeters : null,
      progressMaxMeters: Number.isFinite(observation.progressMaxMeters) ? observation.progressMaxMeters : null,
      timestampMs: toTimestampMs(observation.timestampMs) || null,
      vehicleId: observation.vehicleId || null,
      tripId: observation.tripId || null,
      tripShapeId: observation.tripShapeId || null,
      signature: observation.signature || null,
      entryObservation: normalizeObservation(observation.entryObservation),
      exitObservation: normalizeObservation(observation.exitObservation),
      evidencePoints: (observation.evidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
      lastCoordinate: observation.lastCoordinate || null,
    })),
    evidencePoints: (candidate.evidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
  }])
)
```

- [x] **Step 4: Hydrate normal candidates**

In `hydrateRuntimeState()`, clear `normalDetourCandidates` and hydrate entries from `snapshot.normalDetourCandidates`.

Keep only candidates with:

- route ID
- shape ID
- finite progress range
- at least one observation

Also update the `createRuntimeStatePersistence(...)` argument list and the call site in `api-proxy/detourDetector.js` so `normalDetourCandidates` is passed alongside `persistentDetourCandidates` and `recurringShortDeviationCandidates`.

- [x] **Step 5: Run detector tests**

Run:

```bash
npm --prefix api-proxy test -- --runTestsByPath __tests__/detourDetector.test.js
```

Expected: new test passes and existing detector tests still pass.

---

## Task 4: Use GTFS-RT Vehicle Timestamps for Evidence

**Files:**

- Modify: `api-proxy/detourDetector.js`
- Test: `api-proxy/__tests__/detourDetector.test.js`

- [x] **Step 1: Add failing timestamp test**

Add a test:

```js
test('uses GTFS vehicle timestamp for evidence time when present', () => {
  const realDateNow = Date.now;
  const tickTime = Date.parse('2026-05-24T14:00:00.000Z');
  const sampleTimeSeconds = Math.floor(Date.parse('2026-05-24T13:59:30.000Z') / 1000);

  try {
    Date.now = () => tickTime;
    setMinVehicles(1);
    const vehicle = makeVehicle({
      id: 'bus-1',
      coordinate: OFF_ROUTE_WEST,
      timestamp: sampleTimeSeconds,
    });
    const result = runTicks([vehicle], CONSECUTIVE_READINGS_REQUIRED);

    expect(result['route-1'].geometry.lastEvidenceAt).toBe(sampleTimeSeconds * 1000);
  } finally {
    Date.now = realDateNow;
  }
});
```

Expected: FAIL because detector currently uses tick time.

- [x] **Step 2: Add helper in detector**

Add near the timestamp helpers in `api-proxy/detourDetector.js`:

```js
function getVehicleSampleTimeMs(vehicle, fallbackMs) {
  const seconds = Number(vehicle?.timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return fallbackMs;
  const timestampMs = seconds * 1000;
  const futureToleranceMs = 2 * 60 * 1000;
  if (timestampMs > fallbackMs + futureToleranceMs) return fallbackMs;
  return timestampMs;
}
```

- [x] **Step 3: Use sample time for evidence**

Inside `processVehicles()`:

```js
const sampleTimeMs = getVehicleSampleTimeMs(vehicle, now);
```

Use `sampleTimeMs` for:

- `offRouteStreakStart.timestampMs`
- `recordOffRouteStreakPoint(...)`
- `addVehicleToDetour(..., sampleTimeMs, ...)`
- `currentOnRouteObservation.timestampMs`
- recurring and normal candidate observations

Also update `recordOffRouteStreakPoint(...)` to prune per-vehicle `offRouteStreakPoints` with `DETOUR_VEHICLE_TRACE_WINDOW_MS`, not the shorter route geometry evidence window. Keep segment evidence pruning on `routeConfig.evidenceWindowMs`.

Keep `state.lastCheckedAt = now` because stale processing is about worker observation time, not vehicle sample time.

- [x] **Step 4: Run tests**

Run:

```bash
npm --prefix api-proxy test -- --runTestsByPath __tests__/detourDetector.test.js __tests__/vehicleSampleFreshness.test.js
```

Expected: PASS.

---

## Task 5: Integrate Normal Candidate Memory into Detection

**Files:**

- Modify: `api-proxy/detourDetector.js`
- Modify: `api-proxy/detour/state.js`
- Modify: `api-proxy/detour/runtimeState.js`
- Modify: `api-proxy/detourWorker.js`
- Test: `api-proxy/__tests__/detourDetector.test.js`

- [x] **Step 1: Add low-frequency confirmation tests**

Add `DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS` to the destructured imports from `../detourDetector`, then add these tests:

```js
test('second bus can confirm normal detour after the short geometry window but inside candidate window', () => {
  const realDateNow = Date.now;
  const baseTime = Date.parse('2026-05-24T14:00:00.000Z');

  try {
    Date.now = () => baseTime;
    setMinVehicles(2);
    runTicks([makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_WEST })], CONSECUTIVE_READINGS_REQUIRED);
    expect(getState().activeDetourCount).toBe(0);

    Date.now = () => baseTime + EVIDENCE_WINDOW_MS + 45 * 60 * 1000;
    const result = runTicks([makeVehicle({
      id: 'bus-2',
      tripId: 'trip-2',
      coordinate: OFF_ROUTE_WEST,
    })], CONSECUTIVE_READINGS_REQUIRED);

    expect(result['route-1']).toBeDefined();
    expect(result['route-1'].uniqueVehicleCount).toBe(2);
    expect(result['route-1'].geometry.confidence).toBe('medium');
  } finally {
    Date.now = realDateNow;
  }
});

test('normal detour candidate expires outside candidate confirmation window', () => {
  const realDateNow = Date.now;
  const baseTime = Date.parse('2026-05-24T14:00:00.000Z');

  try {
    Date.now = () => baseTime;
    setMinVehicles(2);
    runTicks([makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_WEST })], CONSECUTIVE_READINGS_REQUIRED);

    Date.now = () => baseTime + DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS + 60_000;
    const result = runTicks([makeVehicle({
      id: 'bus-2',
      tripId: 'trip-2',
      coordinate: OFF_ROUTE_WEST,
    })], CONSECUTIVE_READINGS_REQUIRED);

    expect(result['route-1']).toBeUndefined();
  } finally {
    Date.now = realDateNow;
  }
});

test('confirmed normal candidate stays published after older evidence leaves the short evidence window', () => {
  const realDateNow = Date.now;
  const baseTime = Date.parse('2026-05-24T14:00:00.000Z');

  try {
    Date.now = () => baseTime;
    setMinVehicles(2);
    runTicks([makeVehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: OFF_ROUTE_WEST })], CONSECUTIVE_READINGS_REQUIRED);

    Date.now = () => baseTime + EVIDENCE_WINDOW_MS + 45 * 60 * 1000;
    runTicks([makeVehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: OFF_ROUTE_WEST })], CONSECUTIVE_READINGS_REQUIRED);

    Date.now = () => baseTime + (2 * EVIDENCE_WINDOW_MS) + 46 * 60 * 1000;
    const result = processVehicles([], shapes, routeShapeMapping);

    expect(result['route-1']).toBeDefined();
    expect(result['route-1'].uniqueVehicleCount).toBe(2);
  } finally {
    Date.now = realDateNow;
  }
});
```

Expected: first test currently fails.

Also update the existing test named `does not publish when the second vehicle arrives after the first vehicle evidence aged out`. Under the new baseline, this should only stay unpublished **after the candidate confirmation window**, not merely after `EVIDENCE_WINDOW_MS`.

Change its time advance to:

```js
Date.now = () => baseTime + DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS + 60_000;
```

Keep the expectation:

```js
expect(result['route-1']).toBeUndefined();
expect(getState().detours['route-1']).toBeUndefined();
```

This preserves the false-positive guard while allowing 30–60 minute low-frequency confirmation.

- [x] **Step 2: Build normal candidate observations**

In `api-proxy/detourDetector.js`, create a function similar to `buildRecurringShortDeviationObservation()` but for normal confirmed off-route streaks:

```js
function buildNormalDetourCandidateObservation(state, routeId, routeConfig, shapes, routeShapeMapping, sampleTimeMs) {
  if (!state || state.consecutiveOffRoute < routeConfig.consecutiveReadingsRequired) return null;
  const streakPoints = (state.offRouteStreakPoints || []).map(normalizeEvidenceEntry).filter(Boolean);
  if (streakPoints.length === 0) return null;

  const projectedPoints = streakPoints
    .map((point) => {
      const coordinate = coordinateFromEvidencePoint(point);
      const projection = projectCoordinateToRoute(routeId, coordinate, shapes, routeShapeMapping, state.tripShapeId);
      return projection ? { point, projection } : null;
    })
    .filter(Boolean);

  if (projectedPoints.length === 0) return null;

  const shapeId = state.tripShapeId || projectedPoints[0].projection.shapeId || null;
  const progressValues = projectedPoints
    .filter((item) => !shapeId || item.projection.shapeId === shapeId)
    .map((item) => item.projection.progressMeters)
    .filter(Number.isFinite);

  if (progressValues.length === 0) return null;

  return {
    routeId,
    shapeId,
    progressMinMeters: Math.min(...progressValues),
    progressMaxMeters: Math.max(...progressValues),
    timestampMs: sampleTimeMs,
    vehicleId: state.vehicleId || state.id || null,
    tripId: state.tripId || null,
    tripShapeId: state.tripShapeId || null,
    entryObservation: state.lastOnRouteObservation || state.offRouteStreakStart || null,
    exitObservation: null,
    evidencePoints: streakPoints,
    lastCoordinate: coordinateFromEvidencePoint(streakPoints[streakPoints.length - 1]),
  };
}
```

- [x] **Step 3: Record and promote normal candidates**

Import the candidate helpers and schedule helper:

```js
const {
  upsertCandidateObservation,
  pruneExpiredCandidates,
  hasEnoughUniqueEvidence,
} = require('./detour/candidateMemory');
const { estimateRouteHeadwayMs } = require('./detour/routeSchedule');
```

Also import the five new candidate-memory constants from `./detour/detectionConfig` at the top of `api-proxy/detourDetector.js`.

Add a window helper. The fixed default remains 3 hours; the headway formula lets operators safely lower the base window later while still protecting 60-minute routes.

```js
function getNormalCandidateWindowMs(routeId, scheduleIndex, nowMs) {
  const fallbackWindowMs = DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS;
  const estimate = estimateRouteHeadwayMs(routeId, scheduleIndex, nowMs);
  const headwayMs = estimate?.headwayMs;
  if (!Number.isFinite(headwayMs) || headwayMs <= 0) return fallbackWindowMs;

  const headwayWindowMs =
    headwayMs * DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER +
    DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS;

  return Math.min(
    DETOUR_CANDIDATE_CONFIRMATION_MAX_MS,
    Math.max(fallbackWindowMs, headwayWindowMs)
  );
}
```

Then add the candidate record function:

```js
function recordNormalDetourCandidateObservation(
  observation,
  shapes,
  routeShapeMapping,
  scheduleIndex = null
) {
  if (!observation) return null;
  pruneExpiredCandidates(normalDetourCandidates, {
    nowMs: observation.timestampMs,
    windowMs: getNormalCandidateWindowMs(observation.routeId, scheduleIndex, observation.timestampMs),
    routeId: observation.routeId,
  });

  const candidate = upsertCandidateObservation(normalDetourCandidates, observation, {
    maxGapMeters: RECURRING_SHORT_DEVIATION_MAX_GAP_METERS,
  });

  if (!hasEnoughUniqueEvidence(candidate, { minUniqueSignatures: MIN_VEHICLES_FOR_DETOUR })) {
    return null;
  }

  return publishNormalDetourCandidate(candidate, observation, shapes, routeShapeMapping);
}
```

Add candidate-confirmation IDs to segment confirmation logic so older low-frequency evidence does not disappear when the short evidence window rolls forward:

- add `candidateConfirmationIds` as a `Set` on promoted segments
- normalize it in `ensureSegmentEvidenceSets()`
- include it in `getSegmentConfirmationVehicleIds(segment)` as a union with evidence-backed vehicle IDs
- update `syncMatchedVehicleIdsToCurrentEvidence(segment)` so it preserves candidate-confirmation IDs instead of replacing them with only the short-window evidence IDs
- serialize and hydrate `candidateConfirmationIds` in `api-proxy/detour/runtimeState.js`

`publishNormalDetourCandidate()` must return the promoted `segmentId`. It should:

- resolve route config with `resolveRouteDetectorConfig(observation.routeId)`
- call `addVehicleToDetour()`
- append all candidate evidence points to the segment
- add all candidate confirmation IDs to `segment.candidateConfirmationIds`: `vehicleId` when present, otherwise the `tripId` fallback signature
- do not mix fallback signatures into `vehiclesOffRoute`
- keep `vehiclesOffRoute` reflecting current vehicles only
- call the updated `syncMatchedVehicleIdsToCurrentEvidence()` so `matchedVehicleIds` includes both short-window evidence IDs and candidate-confirmation IDs
- call `markDetourPublishedIfEligible()`

- [x] **Step 4: Call it from the off-route confirmation path**

When `state.consecutiveOffRoute >= routeConfig.consecutiveReadingsRequired`, call:

```js
recordNormalDetourCandidateObservation(
  buildNormalDetourCandidateObservation(
    state,
    routeId,
    routeConfig,
    shapes,
    routeShapeMapping,
    sampleTimeMs
  ),
  shapes,
  routeShapeMapping,
  stopImpactData?.scheduleIndex || null
);
```

If `recordNormalDetourCandidateObservation(...)` returns a `segmentId`, assign it to `state.detourSegmentId` and skip the duplicate `addVehicleToDetour(...)` call for that same sample. If it returns `null`, continue the existing `addVehicleToDetour(...)` behavior.

- [x] **Step 5: Pass schedule data into the detector**

In `api-proxy/detourWorker.js`, include the schedule index in the fifth `processVehicles(...)` argument:

```js
const activeDetours = processVehicles(
  vehicles,
  baseline.shapes,
  baseline.routeShapeMapping,
  data.tripMapping,
  {
    stopsById: data.stopsById,
    routeStopSequencesMapping: data.routeStopSequencesMapping,
    scheduleIndex: data.scheduleIndex,
  }
);
```

- [x] **Step 6: Run detector tests**

Run:

```bash
npm --prefix api-proxy test -- --runTestsByPath __tests__/detourDetector.test.js __tests__/detourCandidateMemory.test.js
```

Expected: PASS.

---

## Task 6: Add Active Published Detour Hydration Guard

**Files:**

- Create: `api-proxy/activeDetourSnapshotStore.js`
- Create: `api-proxy/__tests__/activeDetourSnapshotStore.test.js`
- Modify: `api-proxy/detourWorker.js`
- Modify: `api-proxy/detourDetector.js`
- Test: `api-proxy/__tests__/detourIntegration.test.js`

- [x] **Step 1: Add store tests**

Create tests:

```js
test('loads active detour snapshots from Firestore', async () => {
  jest.resetModules();
  const get = jest.fn().mockResolvedValue({
    forEach(callback) {
      callback({
        id: '8A',
        data: () => ({
          routeId: '8A',
          detectedAt: 1779620000000,
          lastSeenAt: 1779620300000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          confidence: 'medium',
          shapeId: 'shape-8a',
          entryPoint: { latitude: 44.39, longitude: -79.69 },
          exitPoint: { latitude: 44.39, longitude: -79.68 },
          skippedSegmentPolyline: [
            { latitude: 44.39, longitude: -79.69 },
            { latitude: 44.39, longitude: -79.68 },
          ],
          segments: [],
        }),
      });
    },
  });

  jest.doMock('../firebaseAdmin', () => ({
    getDb: () => ({ collection: () => ({ get }) }),
  }));

  const { loadActiveDetourSnapshots } = require('../activeDetourSnapshotStore');
  const snapshots = await loadActiveDetourSnapshots({ force: true });

  expect(snapshots['8A'].routeId).toBe('8A');
  expect(snapshots['8A'].vehicleCount).toBe(2);
  expect(snapshots['8A'].geometry.shapeId).toBe('shape-8a');
});
```

- [x] **Step 2: Implement store**

Create `api-proxy/activeDetourSnapshotStore.js`:

```js
const { getDb } = require('./firebaseAdmin');

const COLLECTION = 'activeDetours';
let hydratePromise = null;

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toCount(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeSnapshot(routeId, data = {}) {
  return {
    routeId,
    detectedAt: toMillis(data.detectedAt) || Date.now(),
    lastSeenAt: toMillis(data.lastSeenAt) || toMillis(data.detectedAt) || Date.now(),
    lastEvidenceAt: toMillis(data.lastEvidenceAt) || toMillis(data.lastSeenAt) || null,
    triggerVehicleId: data.triggerVehicleId || null,
    vehicleCount: toCount(data.uniqueVehicleCount ?? data.vehicleCount),
    currentVehicleCount: toCount(data.currentVehicleCount),
    matchedVehicleIds: Array.isArray(data.matchedVehicleIds)
      ? data.matchedVehicleIds.filter(Boolean)
      : [],
    confidence: data.confidence || null,
    geometry: {
      shapeId: data.shapeId || null,
      segments: cloneJson(data.segments) || [],
      skippedSegmentPolyline: cloneJson(data.skippedSegmentPolyline) || null,
      inferredDetourPolyline: cloneJson(data.inferredDetourPolyline) || null,
      likelyDetourPolyline: cloneJson(data.likelyDetourPolyline) || null,
      entryPoint: cloneJson(data.entryPoint) || null,
      exitPoint: cloneJson(data.exitPoint) || null,
      confidence: data.confidence || null,
      evidencePointCount: data.evidencePointCount ?? null,
      lastEvidenceAt: toMillis(data.lastEvidenceAt) || null,
    },
    detourZone: cloneJson(data.detourZone) || null,
  };
}

async function loadActiveDetourSnapshots(options = {}) {
  const db = getDb();
  if (!db) return {};
  if (options.force) hydratePromise = null;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const records = {};
      const snapshot = await db.collection(COLLECTION).get();
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const routeId = data.routeId || doc.id;
        records[routeId] = normalizeSnapshot(routeId, data);
      });
      return records;
    })().catch((error) => {
      console.error('[activeDetourSnapshotStore] Failed to hydrate active detours:', error.message);
      return {};
    });
  }
  return hydratePromise;
}

module.exports = {
  COLLECTION,
  loadActiveDetourSnapshots,
  normalizeSnapshot,
};
```

- [x] **Step 3: Add detector hydration function**

In `api-proxy/detourDetector.js`, add `hydrateActiveDetourSnapshots(records)`.

For each record:

- skip if route already has an active segment
- create a published retained segment using the existing route/segment lifecycle helpers
- set `isPublished = true`
- set `isPersistent = true` only on the active segment so it remains visible with zero current vehicles and still requires normal-route GPS proof to clear
- do **not** add the snapshot to `learnedPersistentDetours` during hydration; the persistent store should only be updated later through the existing learning path
- set `persistedGeometry` from the snapshot
- set `detourZone` from snapshot when present
- set `lastOffRouteEvidenceAt` from `lastEvidenceAt`
- keep `vehiclesOffRoute` empty on cold start, because no live bus is currently proven off-route
- seed `matchedVehicleIds` from `record.matchedVehicleIds` when available; otherwise create stable synthetic IDs up to `record.vehicleCount` so `uniqueVehicleCount` does not drop to `0` after restart
- preserve `currentVehicleCount = 0` until live off-route evidence arrives again

Export the function.

- [x] **Step 4: Call hydration in worker**

Modify `api-proxy/detourWorker.js`:

```js
const { loadActiveDetourSnapshots } = require('./activeDetourSnapshotStore');
```

After runtime hydration, if runtime state is empty or has no routes, call:

```js
const activeSnapshots = await loadActiveDetourSnapshots({ force: forceReloadState });
hydrateActiveDetourSnapshots(activeSnapshots);
```

Track whether this fallback was attempted and how many snapshots were loaded; pass that status into the first publish call so the publisher can avoid destructive cleanup if both runtime state and snapshot hydration produced no active routes.

- [x] **Step 5: Prevent first-tick deletion when hydration is incomplete**

In `api-proxy/detourPublisher.js`, add an explicit publish option:

```js
publishDetours(activeDetours, {
  suppressDeletesWhenEmpty: true,
  suppressDeleteReason: 'runtime-and-active-snapshot-hydration-empty',
});
```

Before computing `removedIds`, guard destructive cleanup:

```js
if (
  options.suppressDeletesWhenEmpty === true &&
  Object.keys(publishableDetours).length === 0 &&
  stalePublishSuppressedIds.size === 0
) {
  console.warn(
    `[detourPublisher] Suppressing activeDetours deletion: ${options.suppressDeleteReason || 'unknown'}`
  );
  return;
}
```

In `api-proxy/detourWorker.js`, pass this option only on the first tick where:

- runtime state was missing or had no active routes
- active Firestore snapshot fallback was attempted
- detector output is empty after fallback hydration

The next successful hydrated tick may clean up normally.

- [x] **Step 6: Run integration tests**

Add/verify tests that cover:

- active Firestore snapshot hydrates into detector state after empty runtime state
- first empty detector output with `suppressDeletesWhenEmpty` does not delete existing Firestore `activeDetours`
- a later normal hydrated empty output can delete when suppression is not set

Run:

```bash
npm --prefix api-proxy test -- --runTestsByPath __tests__/detourIntegration.test.js __tests__/detourPublisher.test.js
```

Expected: PASS.

---

## Task 7: Switch Operations Docs to One-Tick-Per-Minute Low-Cost Mode

**Files:**

- Modify: `.env.example`
- Modify: `docs/API-PROXY-OPERATIONS.md`
- Modify: `docs/AUTO-DETOUR-DETECTION.md`

- [x] **Step 1: Update `.env.example`**

Set the recommended low-cost baseline:

```env
DETOUR_WORKER_MODE=scheduled
DETOUR_BURST_SAMPLING_ENABLED=false
DETOUR_BURST_DURATION_MS=65000
DETOUR_BURST_SAMPLE_INTERVAL_MS=30000
DETOUR_BURST_MAX_SAMPLES=3
DETOUR_VEHICLE_TRACE_WINDOW_MS=1200000
DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS=10800000
DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER=2
DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS=600000
DETOUR_CANDIDATE_CONFIRMATION_MAX_MS=10800000
```

Add a comment:

```env
# Low-cost production baseline: one scheduler tick per minute, no burst sampling.
# Burst sampling is retained for diagnostics only.
```

Remove or label as legacy the unused keys:

- `DETOUR_POLL_INTERVAL_MS`
- `DETOUR_STATIC_REFRESH_MS`
- `DETOUR_MIN_ROUTE_EVIDENCE`
- `DETOUR_MIN_ACTIVE_MS`

- [x] **Step 2: Update `docs/API-PROXY-OPERATIONS.md`**

Replace the current burst recommendation with:

```markdown
Recommended low-cost production shape:

- `DETOUR_WORKER_MODE=scheduled`
- Cloud Scheduler calls `POST /api/detour-run-once` every 60 seconds during service hours.
- `DETOUR_BURST_SAMPLING_ENABLED=false`
- Each scheduled call collects one GTFS-RT snapshot.
- Continuity comes from backend memory, not multiple pulses inside one request.
```

Update the sample scheduler command:

```bash
gcloud scheduler jobs create http bttp-detour-run-once \
  --location=YOUR_REGION \
  --schedule="* 0,5-23 * * *" \
  --time-zone="America/Toronto" \
  --uri="https://YOUR_CLOUD_RUN_URL/api/detour-run-once" \
  --http-method=POST \
  --headers="x-scheduler-token=YOUR_LONG_RANDOM_TOKEN" \
  --oidc-service-account-email="bttp-detour-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --oidc-token-audience="https://YOUR_CLOUD_RUN_URL" \
  --attempt-deadline=60s \
  --max-retry-attempts=0
```

- [x] **Step 3: Update `docs/AUTO-DETOUR-DETECTION.md`**

Document the three memory layers:

```markdown
1. Vehicle trace memory: 15–20 minutes of recent per-vehicle evidence.
2. Candidate detour memory: compact 2–3 hour/headway-based summaries for low-frequency confirmation.
3. Active detour memory: Firestore/runtime state that persists until normal-route GPS proof clears it.
```

State that the app must not use app icon movement as detector evidence.

- [x] **Step 4: Review docs diff**

Run:

```bash
git diff -- .env.example docs/API-PROXY-OPERATIONS.md docs/AUTO-DETOUR-DETECTION.md
```

Expected: docs clearly describe one scheduled tick per minute and backend memory continuity.

---

## Task 8: Add Low-Frequency and Overnight QA Checks

Note: The QA checklist items below were added to `docs/AUTO-DETOUR-QA-CHECKLIST.md`; they remain unchecked here until a deployed/manual validation pass is completed.

**Files:**

- Modify: `docs/AUTO-DETOUR-QA-CHECKLIST.md`
- Test: documentation review only

- [x] **Step 1: Add candidate-memory checks**

Add to the low-frequency section:

```markdown
- [ ] Confirm first bus off-route creates backend candidate evidence but no rider UI.
- [ ] Confirm second bus 30–60 minutes later can confirm the same candidate.
- [ ] Confirm candidate expires after the configured candidate confirmation window.
- [ ] Confirm repeated evidence from the same trip/vehicle does not count as two buses.
```

- [x] **Step 2: Add cold-start checks**

Add:

```markdown
- [ ] Restart the backend while `activeDetours` contains a published detour.
- [ ] Confirm the first post-restart tick does not delete the Firestore detour just because runtime state is empty.
- [ ] Confirm the detour still clears only after normal-route GPS traversal.
```

- [x] **Step 3: Add scheduler checks**

Add:

```markdown
- [ ] Confirm Cloud Scheduler runs every 60 seconds during service hours.
- [ ] Confirm burst sampling is disabled in the target environment.
- [ ] Confirm duplicate GTFS-RT snapshots are skipped and do not count as fresh evidence.
```

---

## Task 9: Full Verification

Note: Automated verification has passed locally. Manual backend smoke and live validation are intentionally left open until the deployed scheduler/environment is checked.

**Files:**

- No new files

- [x] **Step 1: Run backend tests**

Run:

```bash
npm --prefix api-proxy test
```

Expected: all API proxy tests pass.

- [x] **Step 2: Run app tests affected by detour display**

Run:

```bash
npm test -- --runTestsByPath src/__tests__/detourService.test.js src/__tests__/detourVisibility.test.js src/__tests__/detourIntegration.test.js src/__tests__/detourOverlays.test.js
```

Expected: all selected app tests pass.

- [ ] **Step 3: Manual local backend smoke**

Run locally with scheduled-mode settings:

```powershell
cd api-proxy
$env:DETOUR_WORKER_ENABLED='true'
$env:DETOUR_WORKER_MODE='scheduled'
$env:DETOUR_BURST_SAMPLING_ENABLED='false'
node index.js
```

Then call:

```powershell
curl.exe -X POST http://localhost:3001/api/detour-run-once -H "x-api-token: YOUR_TOKEN"
curl.exe http://localhost:3001/api/detour-status
```

Expected:

- one tick runs
- status reports recent successful tick
- `vehicleSamples.duplicateCount` is present
- no burst sampling block appears in the run-once response

- [ ] **Step 4: Live validation window**

During a planned validation window:

- run scheduler every 60 seconds
- watch `/api/detour-status`
- watch `/api/detour-rollout-health`
- inspect Firestore `activeDetours`
- verify no active detour clears without normal-route GPS proof

---

## Edge Cases That Must Stay Protected

- Duplicate GTFS snapshots do not count as fresh evidence.
- One vehicle/trip cannot trigger rider UI by itself.
- Two observations from the same trip do not count as two buses.
- The same physical bus on a later trip does not count as a second bus while `vehicleId` is available.
- 30–60 minute headways can still confirm detours inside candidate memory.
- Candidate memory expires so stale one-offs do not publish days later.
- Active detours survive service end and backend restart.
- Active detours clear only after same-bus normal-route traversal through the affected segment.
- Route-family projection still requires a confirmed real closure segment.
- Point-only short deviations stay route-specific.
- Same-route independent detours stay separate.
- Low-confidence validation-only detections stay hidden from riders.
- Likely detour paths remain gated by trusted entry/exit evidence.
- Firestore writes stay compact and throttled.

---

## Pros and Cons of This Switch

### Pros

- Better detection on 30- and 60-minute routes.
- Removes burst-pulsing complexity from normal operations.
- Keeps hosting cost low with Cloud Run min instances at `0`.
- Keeps app simple and avoids app-session-based evidence.
- Improves restart and overnight behavior.
- Maintains conservative two-bus rider visibility.

### Cons

- Adds more backend state to reason about.
- Candidate matching thresholds need careful tuning.
- Longer candidate windows can increase false positives if too broad.
- A missed normal-route traversal can keep a detour visible longer.
- Requires new tests around runtime hydration and low-frequency service.

---

## Rollout Plan

1. Merge code with feature flags/config defaulting to safe values.
2. Deploy backend with `DETOUR_WORKER_MODE=scheduled` and burst disabled.
3. Keep rider feature flag disabled during first live validation.
4. Run one or more planned live validation windows.
5. Review:
   - `/api/detour-rollout-health`
   - `detourHistory`
   - `activeDetours`
   - false positives
   - stale active detours
6. Enable rider UI only after rollout health is acceptable.

Rollback:

- Set `DETOUR_WORKER_ENABLED=false` to stop new detection.
- Pause the Cloud Scheduler job.
- Keep existing `activeDetours` untouched until an operator intentionally clears or validates them.

---

## Self-Review

- Spec coverage: covers low-cost scheduler, backend memory, low-frequency routes, overnight persistence, active clearing, docs, and QA.
- Placeholder scan: no placeholder markers, no unscoped test requests, and no open-ended implementation steps.
- Boundary check: backend owns detection; frontend remains Firestore display only.
- Cost check: raw GPS stays in memory/runtime summaries; Firestore receives compact state only.
