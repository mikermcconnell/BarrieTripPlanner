# Service-Hours-Aware Detour Clearing — Design

> Approved: 2026-03-03

---

## Problem

Two issues with the current auto-detour detection system:

1. **Zombie detours**: False-positive detours (single-vehicle GPS noise, deadheading buses) trigger at end-of-service and persist overnight because no vehicles report to clear them.
2. **Premature clearing of real detours**: Legitimate multi-vehicle detours (e.g., Route 8 construction) get cleared overnight when buses stop reporting. The stale-vehicle timeout removes vehicles from `vehiclesOffRoute`, then the no-vehicle timeout clears the detour. The next morning it must be re-detected from scratch — if it recovers at all after a worker restart.

Root cause: The system treats "vehicle stopped reporting" the same as "vehicle returned to route." It has no concept of when transit service is running.

## Solution

Add a service-hours window to the detector. Outside service hours, freeze detour state. At end-of-service, clear low-confidence detours (likely false positives) and preserve high-confidence detours (likely real). At morning service start, re-verify persisted detours.

---

## Design

### 1. Service Hours Window

New env-configurable parameters in `detourDetector.js`:

| Parameter | Env Var | Default | Description |
|---|---|---|---|
| `SERVICE_START_HOUR` | `DETOUR_SERVICE_START_HOUR` | `5` (5:00 AM) | Hour when detection activates |
| `SERVICE_END_HOUR` | `DETOUR_SERVICE_END_HOUR` | `1` (1:00 AM) | Hour when detection freezes |
| `SERVICE_TIMEZONE` | `DETOUR_SERVICE_TIMEZONE` | `America/Toronto` | Timezone for service hour evaluation |

Barrie Transit service runs 5:30 AM – 12:30 AM. The 30-minute buffers on each end account for buses in motion at the edges.

At each tick, `processVehicles` checks `isWithinServiceHours(now)`:
- **During service**: Normal detection and clearing behavior.
- **Outside service**: Skip all processing — no new detections, no clearing, no stale-vehicle pruning. Detour state frozen.

The midnight-crossing case (start=5, end=1) is handled: a time is "in service" if `hour >= 5 || hour < 1`.

### 2. End-of-Service Cleanup

On the first tick after the service window closes (transition from in-service → out-of-service), run a one-time cleanup:

**High-confidence detours** (`scoreConfidence()` returns `'high'`):
- Keep in `activeDetours` map, state stays `active`
- Prune stale vehicles from `vehiclesOffRoute`
- Preserve evidence points (skip normal evidence window pruning overnight)
- Survive the night untouched

**Medium/low-confidence detours**:
- Delete from `activeDetours` and `detourEvidence` maps
- Publish `DETOUR_CLEARED` event to history
- Delete Firestore `activeDetours/{routeId}` document

Track the transition with a `wasInService` boolean. When `wasInService === true && isWithinServiceHours() === false`, trigger cleanup and set `wasInService = false`.

Confidence is computed by `scoreConfidence()` in `detourGeometry.js` using evidence points. Called at cleanup time per detour.

### 3. Morning Re-verification

On the first tick after service resumes (transition from out-of-service → in-service):

Persisted high-confidence detours get a re-verification window:
- Mark with `pendingReverification: true`
- Start `REVERIFICATION_WINDOW_MS` timer (default 10 min, env-configurable)
- If any vehicle on that route is confirmed off-route within the window: re-verified, flag cleared, normal operation resumes
- If window expires with no off-route evidence: detour cleared

| Parameter | Env Var | Default | Description |
|---|---|---|---|
| `REVERIFICATION_WINDOW_MS` | `DETOUR_REVERIFICATION_WINDOW_MS` | `600000` (10 min) | Time after service start to re-confirm overnight detours |

Why 10 minutes: At 30s ticks, 4 consecutive off-route readings = 2 min to confirm. Barrie Transit headways mean the first bus should hit any active detour zone well within 10 min.

Client impact: None. `pendingReverification` is internal. The detour remains `active` in Firestore throughout — riders see it from app open. If it fails re-verification, it clears normally.

---

## Behavior Summary

| Time of Day | Low/Med Confidence | High Confidence |
|---|---|---|
| During service | Normal detect/clear | Normal detect/clear |
| Service end (1 AM) | **Cleared immediately** | **Preserved, frozen** |
| Overnight (1–5 AM) | Gone | Frozen in active state |
| Service start (5 AM) | — | Re-verification window (10 min) |
| +10 min, no confirmation | — | **Cleared** |
| +10 min, confirmed | — | Continues as active detour |

---

## Files to Modify

**`api-proxy/detourDetector.js`** — Core changes:
- New params: `SERVICE_START_HOUR`, `SERVICE_END_HOUR`, `SERVICE_TIMEZONE`, `REVERIFICATION_WINDOW_MS`
- New state: `wasInService` boolean, `pendingReverification` flag on detour objects
- `isWithinServiceHours(now)` function
- Guard at top of `processVehicles`: skip if outside service hours
- End-of-service cleanup pass
- Morning re-verification logic

**`api-proxy/detourWorker.js`** — Minor:
- Skip evidence window pruning for persisted overnight detours (if pruning happens in worker rather than detector)

**`api-proxy/detourPublisher.js`** — Minor:
- Publish `DETOUR_CLEARED` events for detours cleared at service end (existing capability, new call site)

### No Changes Needed
- Client code (detours appear/disappear via existing Firestore subscription)
- `detourGeometry.js` (`scoreConfidence()` already exported)
- Firestore schema (no new document fields)

### New Env Vars for Railway
```
DETOUR_SERVICE_START_HOUR=5
DETOUR_SERVICE_END_HOUR=1
DETOUR_SERVICE_TIMEZONE=America/Toronto
DETOUR_REVERIFICATION_WINDOW_MS=600000
```

---

## Test Cases Needed

- `isWithinServiceHours` correctly handles midnight crossing (5 AM → 1 AM window)
- End-of-service cleanup: high-confidence preserved, low/medium cleared
- Overnight freeze: no state changes during out-of-service ticks
- Morning re-verification: confirmed detour persists, unconfirmed detour clears after window
- Worker restart during overnight: seeded detours still get re-verified at morning start
- Edge: detour transitions from medium → high confidence during the day, survives overnight
